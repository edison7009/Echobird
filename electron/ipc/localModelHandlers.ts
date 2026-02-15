
import { ipcMain, dialog, BrowserWindow, app } from 'electron';
import { ChildProcess, spawn } from 'child_process';
import http from 'http';
import https from 'https';
import path from 'path';
import fs from 'fs';
import { addAppLog } from '../appLogger.js';
import { isLlamaServerInstalled, findLlamaServerInUserData, downloadLlamaServer, getLlamaInstallDir, cancelLlamaDownload } from '../llamaDownloader.js';

// Store current active server instance
let serverProcess: ChildProcess | null = null;
let unifiedProxy: http.Server | null = null; // Unified Proxy Server
let internalLlamaPort: number = 0; // llama-server internal port
let serverLogs: string[] = [];
const MAX_LOGS = 1000;

// 保存当前运行的服务器配置信息（供模型列表动态注入使用）
let serverUserPort: number = 0;
let serverModelPath: string = '';

// 导出状态查询（供托盘菜单使用）
export function isLocalServerRunning(): boolean {
    return !!serverProcess;
}

// 导出服务器详细信息（供 modelManager 注入虚拟模型使用）
export function getLocalServerInfo(): { running: boolean; port: number; modelName: string } {
    if (!serverProcess) {
        return { running: false, port: 0, modelName: '' };
    }
    // 从模型文件路径提取模型名
    const fileName = serverModelPath.replace(/\\/g, '/').split('/').pop() || '';
    const base = fileName.replace(/\.gguf$/i, '');
    const quantMatch = base.match(/[-_](q\d[_a-z0-9]*|f16|f32|fp16|fp32|bf16)$/i);
    const name = quantMatch ? base.slice(0, quantMatch.index) : base;
    return { running: true, port: serverUserPort, modelName: name || 'Local Model' };
}

// 服务器状态变化回调（供托盘菜单刷新）
let onServerStatusChange: (() => void) | null = null;
export function setServerStatusChangeCallback(cb: () => void) {
    onServerStatusChange = cb;
}
function notifyServerStatusChange() {
    onServerStatusChange?.();
}

function addLog(msg: string) {
    const timestamp = new Date().toLocaleTimeString();
    const cleanMsg = msg.trim();
    if (!cleanMsg) return;

    serverLogs.push(`[${timestamp}] ${cleanMsg}`);
    if (serverLogs.length > MAX_LOGS) {
        serverLogs.shift();
    }
}

/**
 * 获取 llama-server 可执行文件路径（跨平台）
 * 搜索顺序: 1. 内置(resources) 2. 运行时下载(userData) 3. 开发模式
 */
function findLlamaServerExe(): string | null {
    const exeName = process.platform === 'win32' ? 'llama-server.exe' : 'llama-server';

    const searchDirs: string[] = [];

    // 1. 打包后内置路径: resources/local/bin/
    if (process.resourcesPath) {
        searchDirs.push(path.join(process.resourcesPath, 'local', 'bin'));
    }
    // 2. 运行时下载路径: userData/llama-server/bin/
    searchDirs.push(path.join(getLlamaInstallDir(), 'bin'));
    // 3. 开发模式路径
    searchDirs.push(path.join(__dirname, '../local/bin'));
    searchDirs.push(path.join(process.cwd(), 'electron/local/bin'));

    for (const dir of searchDirs) {
        if (!fs.existsSync(dir)) continue;

        // 直接在 bin 目录下查找
        const directPath = path.join(dir, exeName);
        if (fs.existsSync(directPath)) return directPath;

        // 在子目录中查找（如 llama-b7981-bin-xxx/ 目录）
        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isDirectory()) {
                    const exePath = path.join(dir, entry.name, exeName);
                    if (fs.existsSync(exePath)) return exePath;
                }
            }
        } catch { /* 忽略 */ }
    }
    return null;
}

// ============================================================
// Anthropic ↔ OpenAI Format Conversion
// ============================================================

/** Anthropic Request → OpenAI Request */
function anthropicToOpenAI(body: any): any {
    const messages: any[] = [];

    if (body.system) {
        const systemText = typeof body.system === 'string'
            ? body.system
            : Array.isArray(body.system)
                ? body.system.map((b: any) => b.text || '').join('')
                : '';
        if (systemText) messages.push({ role: 'system', content: systemText });
    }

    if (body.messages && Array.isArray(body.messages)) {
        for (const msg of body.messages) {
            let content = '';
            if (typeof msg.content === 'string') {
                content = msg.content;
            } else if (Array.isArray(msg.content)) {
                content = msg.content.map((b: any) => b.type === 'text' ? (b.text || '') : '').join('');
            }
            messages.push({ role: msg.role, content });
        }
    }

    return {
        model: body.model || 'local-model',
        messages,
        max_tokens: body.max_tokens || 4096,
        temperature: body.temperature ?? 0.7,
        top_p: body.top_p ?? 0.9,
        stream: body.stream || false,
    };
}

/** OpenAI Non-streaming Response → Anthropic Response */
function openAIToAnthropic(data: any): any {
    const choice = data.choices?.[0];
    return {
        id: 'msg_' + Date.now(),
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: choice?.message?.content || '' }],
        model: data.model || 'local-model',
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: {
            input_tokens: data.usage?.prompt_tokens || 0,
            output_tokens: data.usage?.completion_tokens || 0,
        },
    };
}

/** Convert OpenAI SSE Stream to Anthropic SSE Stream */
function pipeStreamOpenAIToAnthropic(openaiRes: http.IncomingMessage, clientRes: http.ServerResponse) {
    clientRes.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
    });

    const msgId = 'msg_' + Date.now();

    clientRes.write(`event: message_start\ndata: ${JSON.stringify({
        type: 'message_start',
        message: {
            id: msgId, type: 'message', role: 'assistant', content: [],
            model: 'local-model', stop_reason: null, stop_sequence: null,
            usage: { input_tokens: 0, output_tokens: 0 }
        }
    })}\n\n`);

    clientRes.write(`event: content_block_start\ndata: ${JSON.stringify({
        type: 'content_block_start', index: 0,
        content_block: { type: 'text', text: '' }
    })}\n\n`);

    let buffer = '';
    openaiRes.on('data', (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data: ')) continue;
            const jsonStr = trimmed.slice(6);
            if (jsonStr === '[DONE]') continue;
            try {
                const c = JSON.parse(jsonStr);
                const delta = c.choices?.[0]?.delta;
                if (delta?.content) {
                    clientRes.write(`event: content_block_delta\ndata: ${JSON.stringify({
                        type: 'content_block_delta', index: 0,
                        delta: { type: 'text_delta', text: delta.content }
                    })}\n\n`);
                }
            } catch { /* Ignore */ }
        }
    });

    openaiRes.on('end', () => {
        clientRes.write(`event: content_block_stop\ndata: ${JSON.stringify({ type: 'content_block_stop', index: 0 })}\n\n`);
        clientRes.write(`event: message_delta\ndata: ${JSON.stringify({
            type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null },
            usage: { output_tokens: 0 }
        })}\n\n`);
        clientRes.write(`event: message_stop\ndata: ${JSON.stringify({ type: 'message_stop' })}\n\n`);
        clientRes.end();
    });

    openaiRes.on('error', (err) => {
        console.error('[Proxy] Stream forwarding error:', err);
        clientRes.end();
    });
}

// ============================================================
// HTTP Proxy Forwarding
// ============================================================

/** Pass request directly to llama-server (For /v1/* OpenAI requests) */
function proxyPassthrough(req: http.IncomingMessage, res: http.ServerResponse, targetPort: number) {
    let body: Buffer[] = [];
    req.on('data', (chunk) => body.push(chunk));
    req.on('end', () => {
        const proxyReq = http.request({
            hostname: '127.0.0.1',
            port: targetPort,
            path: req.url, // Keep original path
            method: req.method,
            headers: { ...req.headers, host: `127.0.0.1:${targetPort}` },
        }, (proxyRes) => {
            res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
            proxyRes.pipe(res);
        });

        proxyReq.on('error', (err) => {
            console.error('[Proxy] OpenAI forwarding error:', err.message);
            res.writeHead(502, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: { message: 'llama-server unreachable: ' + err.message } }));
        });

        if (body.length > 0) proxyReq.write(Buffer.concat(body));
        proxyReq.end();
    });
}

/** Convert Anthropic request and forward to llama-server */
function proxyAnthropicToOpenAI(req: http.IncomingMessage, res: http.ServerResponse, targetPort: number) {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', async () => {
        try {
            const anthropicReq = JSON.parse(body);
            const isStream = anthropicReq.stream || false;
            const openaiReq = anthropicToOpenAI(anthropicReq);

            console.log(`[Proxy] Anthropic → OpenAI: ${anthropicReq.messages?.length || 0} messages, stream=${isStream}`);

            const postData = JSON.stringify(openaiReq);

            const proxyReq = http.request({
                hostname: '127.0.0.1',
                port: targetPort,
                path: '/v1/chat/completions',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(postData),
                },
            }, (proxyRes) => {
                if (isStream) {
                    pipeStreamOpenAIToAnthropic(proxyRes, res);
                } else {
                    let resBody = '';
                    proxyRes.on('data', (chunk) => { resBody += chunk; });
                    proxyRes.on('end', () => {
                        try {
                            const openaiData = JSON.parse(resBody);
                            if ((proxyRes.statusCode || 200) !== 200) {
                                res.writeHead(proxyRes.statusCode || 500, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({
                                    type: 'error',
                                    error: { type: 'api_error', message: openaiData.error?.message || 'Unknown error' }
                                }));
                                return;
                            }
                            const anthropicResp = openAIToAnthropic(openaiData);
                            res.writeHead(200, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify(anthropicResp));
                        } catch (e: any) {
                            res.writeHead(500, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ type: 'error', error: { type: 'api_error', message: e.message } }));
                        }
                    });
                }
            });

            proxyReq.on('error', (err) => {
                console.error('[Proxy] Anthropic forwarding error:', err.message);
                res.writeHead(502, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ type: 'error', error: { type: 'api_error', message: 'llama-server unreachable' } }));
            });

            proxyReq.write(postData);
            proxyReq.end();
        } catch (err: any) {
            console.error('[Proxy] Request parse failed:', err);
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: err.message } }));
        }
    });
}

// ============================================================
// Unified Proxy Server
// ============================================================

/**
 * Start Unified Proxy Server
 * Supports on same port:
 *   /v1/*        → Direct forward to llama-server (OpenAI native)
 *   /anthropic/* → Convert format then forward (Anthropic compatible)
 */
function startUnifiedProxy(userPort: number, llamaInternalPort: number): Promise<void> {
    return new Promise((resolve, reject) => {
        const server = http.createServer((req, res) => {
            // CORS
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', '*');

            if (req.method === 'OPTIONS') {
                res.writeHead(204);
                res.end();
                return;
            }

            const url = req.url || '';

            // /anthropic/* → Anthropic format proxy
            if (url.startsWith('/anthropic')) {
                proxyAnthropicToOpenAI(req, res, llamaInternalPort);
                return;
            }

            // /v1/* and other paths → Direct pass-through to llama-server
            proxyPassthrough(req, res, llamaInternalPort);
        });

        server.on('error', (err: any) => {
            console.error('[Proxy] Unified proxy start failed:', err);
            reject(err);
        });

        server.listen(userPort, '0.0.0.0', () => {
            console.log(`[Proxy] Unified proxy listening on port ${userPort}`);
            addLog(`Unified Proxy Started:`);
            addLog(`  OpenAI:    http://localhost:${userPort}/v1`);
            addLog(`  Anthropic: http://localhost:${userPort}/anthropic/v1/messages`);
            resolve();
        });

        unifiedProxy = server;
    });
}

function stopUnifiedProxy() {
    if (unifiedProxy) {
        unifiedProxy.close();
        unifiedProxy = null;
        console.log('[Proxy] Unified proxy stopped');
    }
}

// ============================================================
// IPC Handlers
// ============================================================

export function registerLocalModelHandlers() {
    // 1. Select .gguf model file
    ipcMain.handle('model:select-file', async () => {
        const result = await dialog.showOpenDialog({
            properties: ['openFile'],
            filters: [
                { name: 'GGUF Models', extensions: ['gguf'] },
                { name: 'All Files', extensions: ['*'] }
            ]
        });

        if (result.canceled || result.filePaths.length === 0) {
            return null;
        }
        return result.filePaths[0];
    });

    // 2. Start local server
    // Architecture: llama-server.exe on internal port → Unified Proxy on user port
    //   User Port/v1/*        → Forward to internal llama-server
    //   User Port/anthropic/* → Anthropic→OpenAI convert then forward
    ipcMain.handle('model:start-server', async (_event, config: {
        modelPath: string;
        port: number;
        gpuLayers: number;
        contextSize: number;
    }) => {
        if (serverProcess) {
            return { success: false, error: 'Server already running' };
        }

        if (!fs.existsSync(config.modelPath)) {
            return { success: false, error: 'Model file not found' };
        }

        const exePath = findLlamaServerExe();
        if (!exePath) {
            return { success: false, error: 'llama-server not found. Please place it in electron/local/bin/' };
        }

        // llama-server runs on internal port (User Port + 100, avoid conflict)
        internalLlamaPort = config.port + 100;

        serverLogs = [];
        // 保存用户配置到模块级变量
        serverUserPort = config.port;
        serverModelPath = config.modelPath;
        addLog(`Start llama-server: ${path.basename(exePath)}`);
        addLog(`Model: ${path.basename(config.modelPath)}`);
        addLog(`User Port: ${config.port}, Internal Port: ${internalLlamaPort}`);
        addLog(`GPU Layers: ${config.gpuLayers}, Context: ${config.contextSize}`);

        // llama-server start args (Use internal port)
        const args: string[] = [
            '-m', config.modelPath,
            '--port', internalLlamaPort.toString(), // Internal port
            '-c', config.contextSize.toString(),
            '--host', '127.0.0.1', // Internal port only listens locally
        ];

        if (config.gpuLayers === -1) {
            args.push('-ngl', '99999');
        } else {
            args.push('-ngl', config.gpuLayers.toString());
        }

        console.log('[Main] Start llama-server:', exePath, args.join(' '));

        try {
            const exeDir = path.dirname(exePath);
            const parentDir = path.dirname(exeDir);
            const cudaDirs: string[] = [exeDir];

            if (fs.existsSync(parentDir)) {
                const siblings = fs.readdirSync(parentDir, { withFileTypes: true });
                for (const sibling of siblings) {
                    if (sibling.isDirectory() && sibling.name.toLowerCase().includes('cudart')) {
                        cudaDirs.push(path.join(parentDir, sibling.name));
                    }
                }
            }

            const envPath = cudaDirs.join(';') + ';' + (process.env.PATH || '');

            serverProcess = spawn(exePath, args, {
                stdio: ['ignore', 'pipe', 'pipe'],
                env: { ...process.env, PATH: envPath },
                cwd: exeDir
            });

            if (!serverProcess) throw new Error('Failed to spawn llama-server');

            serverProcess.stdout?.on('data', (data: Buffer) => {
                const lines = data.toString().split('\n');
                lines.forEach((line: string) => {
                    if (line.trim()) {
                        console.log('[LLM Server]', line.trim());
                        addLog(line);
                    }
                });
            });

            serverProcess.stderr?.on('data', (data: Buffer) => {
                const lines = data.toString().split('\n');
                lines.forEach((line: string) => {
                    if (line.trim()) {
                        console.log('[LLM Server]', line.trim());
                        addLog(line);
                    }
                });
            });

            serverProcess.on('exit', (code: number | null) => {
                addLog(`Server exited with code ${code}`);
                serverProcess = null;
                notifyServerStatusChange();
                stopUnifiedProxy();
            });

            serverProcess.on('error', (err: Error) => {
                console.error('[Main] llama-server process error:', err);
                addLog(`Process Error: ${err.message}`);
                serverProcess = null;
                notifyServerStatusChange();
            });

            // Start Unified Proxy (User configured port)
            try {
                await startUnifiedProxy(config.port, internalLlamaPort);
            } catch (proxyErr: any) {
                console.error('[Main] Unified proxy start failed:', proxyErr.message);
                addLog(`[Error] Proxy start failed: ${proxyErr.message}`);
                // Kill llama-server if proxy fails
                serverProcess?.kill();
                serverProcess = null;
                notifyServerStatusChange();
                return { success: false, error: `Proxy start failed: ${proxyErr.message}` };
            }

            notifyServerStatusChange();
            return { success: true };

        } catch (error: any) {
            console.error('[Main] Start failed:', error);
            addLog(`Start failed: ${error.message}`);
            return { success: false, error: error.message };
        }
    });

    // 3. Stop server
    ipcMain.handle('model:stop-server', async () => {
        if (!serverProcess) {
            return { success: false, error: 'No server running' };
        }

        serverProcess.kill();
        serverProcess = null;
        notifyServerStatusChange();
        stopUnifiedProxy();
        addLog('Server stopped by user');
        return { success: true };
    });

    // 4. Get logs
    ipcMain.handle('model:get-server-logs', () => {
        return serverLogs;
    });

    // 5. Get server status
    ipcMain.handle('model:get-server-status', () => {
        return {
            running: !!serverProcess,
            pid: serverProcess?.pid,
        };
    });

    // ============================================================
    // GPU Info Detection (nvidia-smi priority, systeminformation fallback)
    // ============================================================

    // Shorten GPU Name
    function shortenGpuName(name: string): string {
        return name
            .replace(/^NVIDIA\s+GeForce\s+/i, '')
            .replace(/^NVIDIA\s+/i, '')
            .replace(/^AMD\s+Radeon\s+/i, 'Radeon ')
            .replace(/^Intel\s+\(R\)\s+/i, 'Intel ')
            .replace(/^Apple\s+/i, '')
            .trim();
    }

    ipcMain.handle('model:get-gpu-info', async () => {
        // 1. Prioritize reading cache from modelSettings.json
        const settings = loadModelSettings();
        if (settings.gpuName && settings.gpuVramGB && settings.gpuVramGB > 0) {
            return { name: settings.gpuName, vramGB: settings.gpuVramGB };
        }

        let best = { name: 'Unknown', vramGB: 0 };

        // 2. Try nvidia-smi (NVIDIA driver native, returns accurate VRAM)
        try {
            const { execSync } = require('child_process');
            const output = execSync('nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits', {
                encoding: 'utf-8', timeout: 5000
            }).trim();
            // Output format: "NVIDIA GeForce RTX 3060, 12288"
            const parts = output.split('\n')[0]?.split(',').map((s: string) => s.trim());
            if (parts && parts.length >= 2) {
                const vramMB = parseInt(parts[1], 10);
                if (vramMB > 0) {
                    best = {
                        name: shortenGpuName(parts[0]),
                        vramGB: Math.round(vramMB / 1024 * 10) / 10
                    };
                }
            }
        } catch {
            // nvidia-smi unavailable (Non-NVIDIA or driver not installed), try systeminformation
        }

        // 3. Fallback: Use systeminformation
        if (best.vramGB <= 0) {
            try {
                const si = require('systeminformation');
                const graphics = await si.graphics();
                for (const ctrl of (graphics.controllers || [])) {
                    const vramMB = ctrl.vram || 0;
                    const vramGB = Math.round(vramMB / 1024 * 10) / 10;
                    if (vramGB > best.vramGB && vramGB <= 128) {
                        best = { name: shortenGpuName(ctrl.model || ctrl.name || 'Unknown'), vramGB };
                    }
                }
            } catch (e) {
                console.error('[GPU] systeminformation check failed:', e);
            }
        }

        // 4. Persistence
        if (best.vramGB > 0) {
            saveModelSettings({ ...settings, gpuName: best.name, gpuVramGB: best.vramGB });
            console.log(`[GPU] Detected: ${best.name}, VRAM: ${best.vramGB} GB (Saved)`);
        }
        return best;
    });

    // User manually sets GPU VRAM size (Fallback)
    ipcMain.handle('model:set-gpu-vram', async (_event, vramGB: number) => {
        const settings = loadModelSettings();
        saveModelSettings({
            ...settings,
            gpuVramGB: vramGB
        });
        console.log(`[GPU] User set VRAM: ${vramGB} GB`);
        return { success: true, vramGB };
    });

    // ============================================================
    // Model Store - Download Management
    // ============================================================

    // Model settings file path (Stores custom model directories etc.)
    // 打包后使用 userData 目录（可写），开发模式用项目目录
    const settingsPaths = app.isPackaged
        ? [
            path.join(app.getPath('userData'), 'modelSettings.json')
        ]
        : [
            path.join(process.cwd(), 'electron/local/modelSettings.json'),
            path.join(__dirname, '../local/modelSettings.json')
        ];

    // Default model storage directory
    const defaultModelsDir = app.isPackaged
        ? path.join(app.getPath('userData'), 'models')
        : path.join(process.cwd(), 'electron/local/models');

    // Settings Type
    interface ModelSettings {
        modelsDir?: string;       // Legacy single directory (Backward compatibility)
        modelsDirs?: string[];    // 扫描展示目录列表（LOCAL tab）
        downloadDir?: string;     // 下载保存目录（STORE tab，类似浏览器默认下载位置）
        gpuName?: string;
        gpuVramGB?: number;
    }

    // Load Model Settings
    function loadModelSettings(): ModelSettings {
        for (const p of settingsPaths) {
            if (fs.existsSync(p)) {
                try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { /* Ignore */ }
            }
        }
        return {};
    }

    function saveModelSettings(settings: ModelSettings) {
        const savePath = settingsPaths[0];
        try {
            const dir = path.dirname(savePath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(savePath, JSON.stringify(settings, null, 2), 'utf-8');
        } catch (e) {
            console.error('[ModelStore] Save settings failed:', e);
        }
    }

    // Get all model directories (Multi-dir support, backward compatible with old modelsDir)
    function getModelsDirs(): string[] {
        const settings = loadModelSettings();
        // New multi-dir
        if (settings.modelsDirs && settings.modelsDirs.length > 0) {
            return settings.modelsDirs.filter(d => fs.existsSync(d));
        }
        // Legacy single-dir migration
        if (settings.modelsDir && fs.existsSync(settings.modelsDir)) {
            return [settings.modelsDir];
        }
        // Default directory
        if (!fs.existsSync(defaultModelsDir)) {
            fs.mkdirSync(defaultModelsDir, { recursive: true });
        }
        return [defaultModelsDir];
    }

    // 获取下载保存目录（单独的配置，类似浏览器默认下载位置）
    function getDownloadDir(): string {
        const settings = loadModelSettings();
        if (settings.downloadDir && fs.existsSync(settings.downloadDir)) {
            return settings.downloadDir;
        }
        // 兼容：回退到默认目录
        if (!fs.existsSync(defaultModelsDir)) {
            fs.mkdirSync(defaultModelsDir, { recursive: true });
        }
        return defaultModelsDir;
    }

    // Load Model Store Config
    function loadStoreConfig(): any[] {
        const configPaths: string[] = [];
        // 打包后: resources/local/
        if (process.resourcesPath) {
            configPaths.push(path.join(process.resourcesPath, 'local', 'modelStoreConfig.json'));
        }
        // 开发模式路径
        configPaths.push(path.join(__dirname, '../local/modelStoreConfig.json'));
        configPaths.push(path.join(process.cwd(), 'electron/local/modelStoreConfig.json'));

        for (const configPath of configPaths) {
            if (fs.existsSync(configPath)) {
                try {
                    return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
                } catch (e) {
                    console.error('[ModelStore] Read config failed:', e);
                }
            }
        }
        return [];
    }

    // 当前活跃下载（可暂停/取消）
    let activeDownload: { abort: () => void; fileName: string; paused: boolean } | null = null;

    // 6. Get Model Store List
    ipcMain.handle('model:get-store-models', () => {
        return loadStoreConfig();
    });

    // 7. Get all model directories (Multi-dir)
    ipcMain.handle('model:get-models-dir', () => {
        return getModelsDirs();
    });

    // 8. Add model directory (Open selector dialog)
    ipcMain.handle('model:add-models-dir', async () => {
        const win = BrowserWindow.getFocusedWindow();
        if (!win) return { success: false };

        const result = await dialog.showOpenDialog(win, {
            title: 'Add Model Directory',
            properties: ['openDirectory']
        });

        if (result.canceled || result.filePaths.length === 0) {
            return { success: false };
        }

        const selectedDir = result.filePaths[0];
        const settings = loadModelSettings();
        const dirs = settings.modelsDirs || (settings.modelsDir ? [settings.modelsDir] : []);

        // Avoid duplicate add
        if (dirs.includes(selectedDir)) {
            return { success: false, error: 'Directory already exists' };
        }

        dirs.push(selectedDir);
        settings.modelsDirs = dirs;
        delete settings.modelsDir; // Clean up old field
        saveModelSettings(settings);
        return { success: true, dirs };
    });

    // 获取下载保存目录
    ipcMain.handle('model:get-download-dir', () => {
        return getDownloadDir();
    });

    // 设置下载保存目录（弹出文件夹选择器）
    ipcMain.handle('model:set-download-dir', async () => {
        const win = BrowserWindow.getFocusedWindow();
        if (!win) return { success: false };

        const result = await dialog.showOpenDialog(win, {
            title: 'Select Download Directory',
            properties: ['openDirectory']
        });

        if (result.canceled || result.filePaths.length === 0) {
            return { success: false };
        }

        const selectedDir = result.filePaths[0];
        const settings = loadModelSettings();
        settings.downloadDir = selectedDir;
        saveModelSettings(settings);
        console.log(`[ModelStore] Download dir set to: ${selectedDir}`);
        addAppLog('MODEL', `Download directory set to: ${selectedDir}`);
        return { success: true, dir: selectedDir };
    });

    // 9. Remove model directory
    ipcMain.handle('model:remove-models-dir', (_event, dirPath: string) => {
        const settings = loadModelSettings();
        const dirs = settings.modelsDirs || (settings.modelsDir ? [settings.modelsDir] : []);
        const filtered = dirs.filter(d => d !== dirPath);
        settings.modelsDirs = filtered;
        delete settings.modelsDir;
        saveModelSettings(settings);
        return { success: true, dirs: filtered };
    });

    // 10. Recursively scan downloaded model files (Supports subdirectories)
    function scanGgufFiles(dir: string, maxDepth = 5): { fileName: string; filePath: string; fileSize: number }[] {
        const results: { fileName: string; filePath: string; fileSize: number }[] = [];
        if (maxDepth <= 0) return results;

        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    results.push(...scanGgufFiles(fullPath, maxDepth - 1));
                } else if (entry.isFile() && entry.name.endsWith('.gguf')) {
                    results.push({
                        fileName: entry.name,
                        filePath: fullPath,
                        fileSize: fs.statSync(fullPath).size
                    });
                }
            }
        } catch { /* Ignore no permission errors etc. */ }
        return results;
    }

    ipcMain.handle('model:get-downloaded-models', () => {
        const dirs = getModelsDirs();
        const allFiles: { fileName: string; filePath: string; fileSize: number }[] = [];
        for (const dir of dirs) {
            allFiles.push(...scanGgufFiles(dir));
        }
        return allFiles;
    });

    // Batch delete model files
    ipcMain.handle('model:delete-model-files', (_event, filePaths: string[]) => {
        const deleted: string[] = [];
        const errors: string[] = [];
        for (const fp of filePaths) {
            try {
                if (fs.existsSync(fp) && fp.endsWith('.gguf')) {
                    fs.unlinkSync(fp);
                    deleted.push(fp);
                    console.log(`[ModelStore] Deleted: ${fp}`);
                    addAppLog('MODEL', `Deleted file: ${path.basename(fp)}`);
                }
            } catch (e) {
                errors.push(fp);
                console.error(`[ModelStore] Delete failed: ${fp}`, e);
                addAppLog('ERROR', `Delete file failed: ${path.basename(fp)}`);
            }
        }
        return { success: errors.length === 0, deleted, errors };
    });

    // 发送进度到所有窗口
    function sendProgress(data: { fileName: string; progress: number; downloaded: number; total: number; status: string }) {
        for (const win of BrowserWindow.getAllWindows()) {
            win.webContents.send('model:download-progress', data);
        }
    }

    /**
     * 测试单个模型下载源的速度（5 秒内下载的字节数）
     */
    function testModelSourceSpeed(url: string, name: string): Promise<{ name: string; speed: number }> {
        return new Promise((resolve) => {
            const TEST_DURATION = 5000;
            let bytes = 0;
            let settled = false;
            let activeReq: any = null;
            const startTime = Date.now();

            const done = () => {
                if (settled) return;
                settled = true;
                const elapsed = (Date.now() - startTime) / 1000;
                const speed = elapsed > 0 ? bytes / elapsed : 0;
                try { activeReq?.destroy(); } catch { /* 忽略 */ }
                console.log(`[ModelStore] Speed test ${name}: ${(speed / 1024).toFixed(0)} KB/s (${(bytes / 1024).toFixed(0)} KB in ${elapsed.toFixed(1)}s)`);
                resolve({ name, speed });
            };

            const handleRedirect = (currentUrl: string, redirectCount: number) => {
                if (redirectCount > 5 || settled) { done(); return; }
                try {
                    const client = currentUrl.startsWith('https') ? https : http;
                    const r = client.get(currentUrl, { headers: { 'User-Agent': 'WhichClaw/1.0' } }, (res) => {
                        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                            const nextUrl = new URL(res.headers.location, currentUrl).href;
                            handleRedirect(nextUrl, redirectCount + 1);
                            return;
                        }
                        if (res.statusCode !== 200) { done(); return; }
                        res.on('data', (chunk: Buffer) => { bytes += chunk.length; });
                        setTimeout(done, TEST_DURATION);
                    });
                    activeReq = r;
                    r.on('error', () => done());
                    r.setTimeout(8000, () => { r.destroy(); done(); });
                } catch { done(); }
            };

            try {
                const client = url.startsWith('https') ? https : http;
                const r = client.get(url, { headers: { 'User-Agent': 'WhichClaw/1.0' } }, (res) => {
                    if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                        const nextUrl = new URL(res.headers.location, url).href;
                        handleRedirect(nextUrl, 1);
                        return;
                    }
                    if (res.statusCode !== 200) { done(); return; }
                    res.on('data', (chunk: Buffer) => { bytes += chunk.length; });
                    setTimeout(done, TEST_DURATION);
                });
                activeReq = r;
                r.on('error', () => done());
                r.setTimeout(8000, () => { r.destroy(); done(); });
            } catch { done(); }
        });
    }

    // 下载模型文件（支持断点续传 + 测速选源）
    ipcMain.handle('model:download-model', async (_event, repo: string, fileName: string) => {
        const dir = getDownloadDir();
        const savePath = path.join(dir, fileName);
        const tempPath = savePath + '.downloading';

        // 多源下载 URL 列表
        const downloadSources = [
            { name: 'HuggingFace', url: `https://huggingface.co/${repo}/resolve/main/${fileName}` },
            { name: 'HF-Mirror', url: `https://hf-mirror.com/${repo}/resolve/main/${fileName}` },
            { name: 'ModelScope', url: `https://modelscope.cn/models/${repo}/resolve/master/${fileName}` },
        ];
        console.log(`[ModelStore] Start download: ${fileName}`);
        addAppLog('DOWNLOAD', `Starting download: ${fileName}`);

        // 从单个源尝试下载（支持断点续传）
        function tryDownloadFromSource(source: { name: string; url: string }): Promise<{ success: boolean; filePath?: string; error?: string }> {
            return new Promise((resolve) => {
                // 检查已下载的部分（断点续传）
                let startByte = 0;
                if (fs.existsSync(tempPath)) {
                    startByte = fs.statSync(tempPath).size;
                    console.log(`[ModelStore] [${source.name}] Resume mode, downloaded ${startByte} bytes`);
                }

                const headers: Record<string, string> = { 'User-Agent': 'WhichClaw/1.0' };
                if (startByte > 0) {
                    headers['Range'] = `bytes=${startByte}-`;
                }

                const CONNECT_TIMEOUT_MS = 15000;
                let settled = false;

                const makeRequest = (requestUrl: string, redirectCount = 0) => {
                    if (redirectCount > 5) {
                        if (!settled) { settled = true; resolve({ success: false, error: `[${source.name}] Too many redirects` }); }
                        return;
                    }

                    const isHttps = requestUrl.startsWith('https');
                    const httpModule = isHttps ? https : http;

                    const req = httpModule.get(requestUrl, { headers, timeout: CONNECT_TIMEOUT_MS }, (res) => {
                        // 处理重定向
                        if (res.statusCode && [301, 302, 303, 307, 308].includes(res.statusCode)) {
                            const location = res.headers.location;
                            if (location) {
                                makeRequest(location, redirectCount + 1);
                                return;
                            }
                        }

                        // 200=全新下载，206=断点续传
                        if (res.statusCode !== 200 && res.statusCode !== 206) {
                            if (!settled) { settled = true; resolve({ success: false, error: `[${source.name}] HTTP ${res.statusCode}` }); }
                            return;
                        }

                        // 如果服务器返回 200 而不是 206，说明不支持续传，从头开始
                        if (res.statusCode === 200 && startByte > 0) {
                            startByte = 0;
                        }

                        // 连接成功，开始下载
                        const contentLength = parseInt(res.headers['content-length'] || '0', 10);
                        const totalSize = startByte + contentLength;
                        // 追加模式写入临时文件
                        const fileStream = fs.createWriteStream(tempPath, { flags: startByte > 0 ? 'a' : 'w' });
                        let downloadedBytes = startByte;

                        // 保存引用用于暂停/取消
                        activeDownload = {
                            fileName,
                            paused: false,
                            abort: () => { req.destroy(); fileStream.close(); }
                        };

                        res.on('data', (chunk: Buffer) => {
                            downloadedBytes += chunk.length;
                            const progress = totalSize > 0 ? Math.round((downloadedBytes / totalSize) * 100) : 0;
                            sendProgress({ fileName, progress, downloaded: downloadedBytes, total: totalSize, status: 'downloading' });
                        });

                        res.pipe(fileStream);

                        fileStream.on('finish', () => {
                            // 暂停导致的 finish，不做完成处理
                            if (activeDownload?.paused) {
                                activeDownload = null;
                                return;
                            }
                            activeDownload = null;
                            try {
                                // 重命名临时文件为正式文件
                                if (fs.existsSync(savePath)) fs.unlinkSync(savePath);
                                fs.renameSync(tempPath, savePath);
                                sendProgress({ fileName, progress: 100, downloaded: totalSize, total: totalSize, status: 'completed' });
                                console.log(`[ModelStore] [${source.name}] Download complete: ${fileName}`);
                                addAppLog('DOWNLOAD', `Download complete: ${fileName} (${source.name})`);
                                if (!settled) { settled = true; resolve({ success: true, filePath: savePath }); }
                            } catch (e: any) {
                                if (!settled) {
                                    settled = true;
                                    sendProgress({ fileName, progress: 0, downloaded: 0, total: 0, status: 'error' });
                                    resolve({ success: false, error: e.message });
                                }
                            }
                        });

                        fileStream.on('error', (err) => {
                            activeDownload = null;
                            if (!settled) { settled = true; resolve({ success: false, error: `[${source.name}] ${err.message}` }); }
                        });
                    });

                    req.on('timeout', () => {
                        req.destroy();
                        if (!settled) { settled = true; resolve({ success: false, error: `[${source.name}] Connection timeout` }); }
                    });

                    req.on('error', (err) => {
                        activeDownload = null;
                        if (!settled) { settled = true; resolve({ success: false, error: `[${source.name}] ${err.message}` }); }
                    });
                };

                makeRequest(source.url);
            });
        }

        // 测速选择最快下载源（并行测速 5 秒）
        console.log(`[ModelStore] Speed testing ${downloadSources.length} sources...`);
        addAppLog('DOWNLOAD', `Speed testing ${downloadSources.length} sources for: ${fileName}`);

        const speedResults = await Promise.all(
            downloadSources.map(source => testModelSourceSpeed(source.url, source.name))
        );

        // 按速度排序（最快的在前），排除完全不可用的
        const sortedSources = speedResults
            .filter(r => r.speed > 0)
            .sort((a, b) => b.speed - a.speed);

        if (sortedSources.length === 0) {
            sendProgress({ fileName, progress: 0, downloaded: 0, total: 0, status: 'error' });
            addAppLog('ERROR', `Download failed: ${fileName} (all sources unreachable)`);
            return { success: false, error: 'All download sources unreachable' };
        }

        console.log('[ModelStore] Source speed results:');
        sortedSources.forEach(r => console.log(`  ${r.name}: ${(r.speed / 1024).toFixed(0)} KB/s`));
        addAppLog('DOWNLOAD', `Fastest source: ${sortedSources[0].name} (${(sortedSources[0].speed / 1024).toFixed(0)} KB/s)`);

        // 用最快的源下载，失败回退
        for (const fastest of sortedSources) {
            const source = downloadSources.find(s => s.name === fastest.name)!;
            const result = await tryDownloadFromSource(source);
            if (result.success) return result;
            console.log(`[ModelStore] ${source.name} failed: ${result.error}`);
        }

        // 所有源都失败
        sendProgress({ fileName, progress: 0, downloaded: 0, total: 0, status: 'error' });
        addAppLog('ERROR', `Download failed: ${fileName} (all sources failed)`);
        return { success: false, error: 'All download sources failed' };
    });

    // 暂停下载 — 中断请求但保留 .downloading 临时文件（支持续传）
    ipcMain.handle('model:pause-download', () => {
        if (activeDownload) {
            const fileName = activeDownload.fileName;
            console.log(`[ModelStore] Paused download: ${fileName}`);
            activeDownload.paused = true;
            activeDownload.abort();

            // 通知前端进入暂停状态
            sendProgress({ fileName, progress: 0, downloaded: 0, total: 0, status: 'paused' });
            addAppLog('DOWNLOAD', `Download paused: ${fileName}`);
            return { success: true };
        }
        // llama-server 不支持断点续传，暂停 = 取消
        cancelLlamaDownload();
        addAppLog('DOWNLOAD', `Engine download cancelled (pause)`);
        return { success: true };
    });

    // 取消下载 — 中断请求并删除 .downloading 临时文件（支持暂停后取消）
    ipcMain.handle('model:cancel-download', (_event, targetFileName?: string) => {
        // 优先用传入的 fileName（暂停后取消），其次用活跃下载的
        const fileName = targetFileName || activeDownload?.fileName;

        // llama-server 引擎下载的取消
        if (fileName && fileName.startsWith('llama-server')) {
            cancelLlamaDownload();
            addAppLog('DOWNLOAD', `Engine download cancelled: ${fileName}`);
            return { success: true };
        }

        if (!fileName) {
            return { success: false, error: 'No download to cancel' };
        }

        // 如果有活跃下载，中断它
        if (activeDownload) {
            activeDownload.abort();
            activeDownload = null;
        }

        // 删除不完整的临时文件
        const downloadDir = getDownloadDir();
        const tempPath = path.join(downloadDir, fileName + '.downloading');
        try {
            if (fs.existsSync(tempPath)) {
                fs.unlinkSync(tempPath);
                console.log(`[ModelStore] Cleaned temp file: ${tempPath}`);
            }
        } catch (e) {
            console.error(`[ModelStore] Failed to clean temp file:`, e);
        }

        // 通知前端
        sendProgress({ fileName, progress: 0, downloaded: 0, total: 0, status: 'cancelled' });
        addAppLog('DOWNLOAD', `Download cancelled: ${fileName}`);
        return { success: true };
    });

    // ============================================================
    // llama-server 引擎检测 & 运行时下载
    // ============================================================

    // 检测 llama-server 是否可用（内置 + 运行时下载 + 开发模式）
    ipcMain.handle('model:check-llama-server', () => {
        const exePath = findLlamaServerExe();
        return {
            installed: !!exePath,
            path: exePath || null,
        };
    });

    // 下载 llama-server 引擎
    ipcMain.handle('model:download-llama-server', async () => {
        console.log('[LlamaDownloader] Download requested by user');
        addAppLog('DOWNLOAD', 'llama-server engine download started');
        const result = await downloadLlamaServer();
        if (result.success) {
            addAppLog('DOWNLOAD', 'llama-server engine installed successfully');
        } else {
            addAppLog('DOWNLOAD', `llama-server download failed: ${result.error}`);
        }
        return result;
    });
}
