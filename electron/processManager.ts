// Process Manager - Manage Tool Processes
import { spawn, ChildProcess, exec } from 'child_process';
import * as os from 'os';
import { toolManager } from './toolManager';
import { BrowserWindow } from 'electron';

let mainWindow: BrowserWindow | null = null;
let monitorInterval: NodeJS.Timeout | null = null;

export function setMainWindow(win: BrowserWindow) {
    mainWindow = win;
    startMonitoring();
}

// Start monitoring process status (Mainly for Windows detached processes)
function startMonitoring() {
    if (monitorInterval) return;

    monitorInterval = setInterval(async () => {
        if (runningProcesses.size === 0) return;

        for (const [toolId, info] of runningProcesses) {
            try {
                if (info.platform === 'win32') {
                    // Windows: Use tasklist to check if PID exists
                    // process.kill(pid, 0) might not be accurate on Windows for some privileged processes, but usually enough
                    // But to be safe, we use tasklist
                    await new Promise<void>((resolve, reject) => {
                        exec(`tasklist /FI "PID eq ${info.pid}" /FO CSV /NH`, (_error, stdout) => {
                            // Empty stdout or "No tasks are running" means it's dead
                            // Note: tasklist output might have "INFO: No tasks are running..."
                            if (stdout.includes('No tasks') || stdout.trim() === '') {
                                reject(new Error('Process not found'));
                            } else {
                                resolve();
                            }
                        });
                    });
                } else {
                    // Unix: Send signal 0 to check existence
                    process.kill(info.pid, 0);
                }
            } catch (e) {
                // Process not found, exited
                console.log(`[ProcessManager] Detected tool ${toolId} (PID: ${info.pid}) exited externally.`);
                runningProcesses.delete(toolId);

                // Notify frontend
                if (mainWindow) {
                    mainWindow.webContents.send('tool-status-changed', toolId, false);
                }
            }
        }
    }, 2000); // Check every 2 seconds
}

// Process Info Interface
interface ProcessInfo {
    pid: number;
    platform: NodeJS.Platform;
    child?: ChildProcess; // Only for non-Windows or keeping reference
}

// Running processes map (Key: toolId)
const runningProcesses = new Map<string, ProcessInfo>();

// Get tool start command
function getStartCommand(toolId: string): string | null {
    const toolsConfig = toolManager.getDefaultToolsConfig();
    const tool = toolsConfig.find(t => t.id === toolId);
    return (tool as any)?.startCommand || null;
}

// 冷却中的工具 ID（防止连续点击）
const coolingDown = new Set<string>();

// Start tool process
export async function startTool(toolId: string): Promise<{ success: boolean; error?: string }> {
    // 简单冷却：3 秒内不允许重复启动同一工具
    if (coolingDown.has(toolId)) {
        return { success: false, error: 'Please wait before launching again' };
    }
    coolingDown.add(toolId);
    setTimeout(() => coolingDown.delete(toolId), 3000);

    const command = getStartCommand(toolId);

    // CLI 工具：有 startCommand，通过终端启动
    if (command) {
        console.log(`[ProcessManager] Starting CLI tool: ${toolId} with command: ${command}`);
        return startCliTool(toolId, command);
    }

    // IDE/GUI 工具：没有 startCommand，通过 shell.openPath 打开可执行文件
    console.log(`[ProcessManager] No startCommand for ${toolId}, trying shell.openPath...`);
    return startGuiTool(toolId);
}

// CLI 工具启动（终端命令）
async function startCliTool(toolId: string, command: string): Promise<{ success: boolean; error?: string }> {
    try {
        const isWindows = process.platform === 'win32';

        if (isWindows) {
            const userHome = os.homedir();
            const psCommand = `
                $process = Start-Process cmd -ArgumentList '/k "cd /d ${userHome} && ${command}"' -PassThru
                Write-Output $process.Id
            `;

            const child = spawn('powershell', ['-Command', psCommand], {
                stdio: ['ignore', 'pipe', 'pipe']
            });

            child.stdout.on('data', (data) => {
                const pid = parseInt(data.toString().trim());
                if (!isNaN(pid) && pid > 0) {
                    console.log(`[ProcessManager] Tool ${toolId} started with PID: ${pid}`);
                    runningProcesses.set(toolId, { pid, platform: 'win32' });
                }
            });

            child.stderr.on('data', (data) => {
                console.error(`[ProcessManager] PowerShell error for ${toolId}:`, data.toString());
            });
        } else {
            const parts = command.split(' ');
            const cmd = parts[0];
            const args = parts.slice(1);

            const child = spawn(cmd, args, {
                shell: true,
                detached: false,
                stdio: ['inherit', 'pipe', 'pipe'],
                env: { ...process.env },
                cwd: os.homedir()
            });

            if (!child.pid) {
                throw new Error('Failed to spawn process');
            }

            runningProcesses.set(toolId, {
                pid: child.pid,
                platform: process.platform,
                child
            });

            child.stdout?.on('data', (data) => {
                console.log(`[${toolId}] stdout:`, data.toString().trim());
            });

            child.stderr?.on('data', (data) => {
                console.log(`[${toolId}] stderr:`, data.toString().trim());
            });

            child.on('exit', (code, signal) => {
                console.log(`[ProcessManager] Tool ${toolId} exited with code ${code}, signal ${signal}`);
                runningProcesses.delete(toolId);
            });
        }

        return { success: true };
    } catch (error) {
        console.error(`[ProcessManager] Failed to start ${toolId}:`, error);
        return { success: false, error: String(error) };
    }
}

// GUI/IDE 工具启动（打开可执行文件，跨平台）
async function startGuiTool(toolId: string): Promise<{ success: boolean; error?: string }> {
    try {
        // 通过 toolLoader 直接检测单个工具路径（无需全量扫描）
        const { toolLoader } = await import('./tools/loader');
        await toolLoader.initialize();
        const tool = toolLoader.getTool(toolId);

        if (!tool) {
            return { success: false, error: 'Tool not found in loader' };
        }

        const exePath = await tool.detect();

        if (!exePath) {
            return { success: false, error: 'No executable path detected for this tool' };
        }

        console.log(`[ProcessManager] Opening GUI tool: ${toolId} at ${exePath}`);

        // VS Code 扩展类工具：检测路径包含 .vscode/extensions，启动 VS Code 而非打开扩展目录
        const normalizedPath = exePath.replace(/\\/g, '/');
        if (normalizedPath.includes('.vscode/extensions') || normalizedPath.includes('.vscode-insiders/extensions')) {
            console.log(`[ProcessManager] Detected VS Code extension tool: ${toolId}, launching VS Code...`);
            const codeCmd = normalizedPath.includes('.vscode-insiders') ? 'code-insiders' : 'code';
            const child = spawn(codeCmd, [], {
                shell: true,
                detached: true,
                stdio: 'ignore',
                cwd: os.homedir()
            });
            child.unref();
            return { success: true };
        }

        // 其他 GUI 工具：使用 Electron shell.openPath 跨平台打开可执行文件
        const { shell } = await import('electron');
        const errorMsg = await shell.openPath(exePath);

        if (errorMsg) {
            return { success: false, error: `Failed to open: ${errorMsg}` };
        }

        return { success: true };
    } catch (error) {
        console.error(`[ProcessManager] Failed to launch GUI tool ${toolId}:`, error);
        return { success: false, error: String(error) };
    }
}

// Stop tool process
export async function stopTool(toolId: string): Promise<{ success: boolean; error?: string }> {
    const processInfo = runningProcesses.get(toolId);
    if (!processInfo) {
        return { success: false, error: 'Tool is not running' };
    }

    console.log(`[ProcessManager] Stopping tool: ${toolId} (PID: ${processInfo.pid})`);

    try {
        if (processInfo.platform === 'win32') {
            // Windows: Use taskkill to force kill process tree (/T)
            // Effective for shell-started programs (like OpenClaw), closes popped new windows too
            await new Promise<void>((resolve, reject) => {
                exec(`taskkill /pid ${processInfo.pid} /T /F`, (error) => {
                    if (error) {
                        // Ignore "process not found" error (might have exited already)
                        if (error.message.includes('not found')) {
                            resolve();
                        } else {
                            console.error(`[ProcessManager] taskkill error:`, error);
                            reject(error);
                        }
                    } else {
                        resolve();
                    }
                });
            });
        } else {
            // macOS/Linux: Use process.kill
            // Try killing process group (negative PID) to ensure children are killed
            try {
                process.kill(-processInfo.pid, 'SIGKILL');
            } catch (e: any) {
                // If process group kill not supported (e.g. not detached), kill single process
                if (e.code === 'ESRCH') {
                    // Process dead, ignore
                } else {
                    process.kill(processInfo.pid, 'SIGKILL');
                }
            }
        }

        runningProcesses.delete(toolId);
        return { success: true };
    } catch (error) {
        console.error(`[ProcessManager] Failed to stop ${toolId}:`, error);
        // Remove record even on error to avoid deadlock
        runningProcesses.delete(toolId);
        return { success: false, error: String(error) };
    }
}

// Get list of running tool IDs
export function getRunningTools(): string[] {
    return Array.from(runningProcesses.keys());
}

// Check if tool is running
export function isToolRunning(toolId: string): boolean {
    return runningProcesses.has(toolId);
}

// Stop all processes (Called on app quit)
export function stopAllTools(): void {
    console.log('[ProcessManager] Stopping all tools...');
    for (const [toolId] of runningProcesses) {
        stopTool(toolId);
    }
}
