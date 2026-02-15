import os from 'os';
import path from 'path';
import fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const HOME = os.homedir();

/**
 * Get platform
 */
function getPlatform(): 'windows' | 'mac' | 'linux' {
    const platform = os.platform();
    if (platform === 'win32') return 'windows';
    if (platform === 'darwin') return 'mac';
    return 'linux';
}

/**
 * Check if command exists
 */
async function commandExists(cmd: string): Promise<boolean> {
    try {
        const platform = getPlatform();
        // Windows use cmd /c where, Unix use which
        const checkCmd = platform === 'windows'
            ? `cmd /c \"where ${cmd}\"`
            : `which ${cmd}`;
        await execAsync(checkCmd, { timeout: 5000 });
        return true;
    } catch {
        return false;
    }
}

/**
 * Get installation path of command
 */
async function getCommandPath(cmd: string): Promise<string | null> {
    try {
        const platform = getPlatform();
        const checkCmd = platform === 'windows'
            ? `cmd /c \"where ${cmd}\"`
            : `which ${cmd}`;
        const result = await execAsync(checkCmd, { timeout: 5000 });
        const path = result.stdout.trim().split('\n')[0];
        return path || null;
    } catch {
        return null;
    }
}

/**
 * Get command version
 */
async function getVersion(cmd: string): Promise<string | null> {
    try {
        const { stdout } = await execAsync(`${cmd} --version`, { timeout: 3000 });
        return stdout.trim().split('\n')[0] || null;
    } catch {
        return null;
    }
}

/**
 * Check if path exists
 */
function pathExists(p: string): boolean {
    try {
        fs.accessSync(p);
        return true;
    } catch {
        return false;
    }
}

// Supported Agent definitions
interface AgentDef {
    id: string;
    name: string;
    skillsPaths: string[];  // Multiple possible skills paths
    checkType: 'cli' | 'dir';
    checkValue: string;
}

// Get cross-platform npm global install paths
function getNpmGlobalPaths(): string[] {
    const platform = os.platform();
    const home = os.homedir();

    if (platform === 'win32') {
        // Windows: %APPDATA%\npm\node_modules
        return [
            path.join(home, 'AppData', 'Roaming', 'npm', 'node_modules'),
        ];
    } else if (platform === 'darwin') {
        // macOS: /usr/local/lib/node_modules or ~/.npm-global/lib/node_modules
        return [
            '/usr/local/lib/node_modules',
            path.join(home, '.npm-global', 'lib', 'node_modules'),
            path.join(home, '.nvm', 'versions', 'node'),  // nvm user
        ];
    } else {
        // Linux: /usr/lib/node_modules or ~/.npm-global/lib/node_modules
        return [
            '/usr/lib/node_modules',
            '/usr/local/lib/node_modules',
            path.join(home, '.npm-global', 'lib', 'node_modules'),
        ];
    }
}

const NPM_GLOBAL_PATHS = getNpmGlobalPaths();

const SUPPORTED_AGENTS: AgentDef[] = [
    {
        id: 'claudecode',
        name: 'ClaudeCode',
        skillsPaths: [
            path.join(HOME, '.claude'),  // Claude Code config root (includes settings.json, MCP, Plugins)
        ],
        checkType: 'cli',
        checkValue: 'claude'
    },
    {
        id: 'openclaw',
        name: 'OpenClaw',
        skillsPaths: [
            path.join(HOME, '.openclaw', 'skills'),
            // Add all possible npm global paths
            ...NPM_GLOBAL_PATHS.map(p => path.join(p, 'openclaw', 'skills')),
        ],
        checkType: 'cli',
        checkValue: 'openclaw'
    },
    {
        id: 'opencode',
        name: 'OpenCode',
        skillsPaths: [
            path.join(HOME, '.opencode', 'skills'),
        ],
        checkType: 'cli',
        checkValue: 'opencode'
    },
    {
        id: 'codex',
        name: 'Codex',
        skillsPaths: [
            path.join(HOME, '.codex', 'skills'),
        ],
        checkType: 'cli',
        checkValue: 'codex'
    }
];

export interface DetectedAgent {
    id: string;
    name: string;
    installed: boolean;
    version?: string;
    executablePath?: string;  // CLI tool install path
    configPath?: string;      // User config file path
    skillsPath: string;       // skills/commands config directory
    installedSkillsCount: number;
    activeModel?: string;     // Currently used model
}

/**
 * Detect single Agent
 */
async function detectAgent(agent: AgentDef): Promise<DetectedAgent> {
    let installed = false;
    let version: string | undefined;
    let executablePath: string | undefined;
    let installedSkillsCount = 0;
    let skillsPath = ''; // 只有找到存在的路径才赋值
    let activeModel: string | undefined;

    // Check if installed
    if (agent.checkType === 'cli') {
        installed = await commandExists(agent.checkValue);
        if (installed) {
            version = await getVersion(agent.checkValue) || undefined;
            executablePath = await getCommandPath(agent.checkValue) || undefined;
        }
    } else if (agent.checkType === 'dir') {
        installed = pathExists(agent.checkValue);
        executablePath = agent.checkValue;
    }

    // Find actual existing skills path
    if (installed) {
        for (const possiblePath of agent.skillsPaths) {
            if (pathExists(possiblePath)) {
                skillsPath = possiblePath;
                try {
                    const entries = fs.readdirSync(skillsPath, { withFileTypes: true });
                    installedSkillsCount = entries.filter(e => e.isDirectory() && !e.name.startsWith('.')).length;
                } catch {
                    // Ignore error
                }
                break; // Stop after finding first existing path
            }
        }
    }

    // Read model config - Read from settings.json in user home
    if (installed) {
        try {
            const homeDir = process.env.HOME || process.env.USERPROFILE || '';
            // Tool config path mapping
            const settingsPaths: Record<string, string> = {
                'claudecode': path.join(homeDir, '.claude', 'settings.json'),
                'openclaw': path.join(homeDir, '.openclaw', 'settings.json'),
                'opencode': path.join(homeDir, '.opencode', 'settings.json'),
                'codex': path.join(homeDir, '.codex', 'settings.json'),
            };
            const settingsPath = settingsPaths[agent.id];
            if (settingsPath && fs.existsSync(settingsPath)) {
                const content = fs.readFileSync(settingsPath, 'utf-8');
                const settings = JSON.parse(content);
                // Read from env.ANTHROPIC_MODEL first, then settings.model
                if (settings.env?.ANTHROPIC_MODEL) {
                    activeModel = settings.env.ANTHROPIC_MODEL;
                } else if (settings.env?.OPENAI_MODEL) {
                    activeModel = settings.env.OPENAI_MODEL;
                } else {
                    activeModel = settings.model || settings.preferredModel;
                }
            }
        } catch {
            // Ignore read error
        }
        // Tool default model
        if (!activeModel) {
            const defaultModels: Record<string, string> = {
                'claudecode': 'claude-sonnet-4-20250514',
                'openclaw': 'gpt-4o',
                'opencode': 'gpt-4o',
                'codex': 'codex-mini-latest'
            };
            activeModel = defaultModels[agent.id];
        }
    }

    return {
        id: agent.id,
        name: agent.name,
        installed,
        version,
        executablePath,
        skillsPath,
        installedSkillsCount,
        activeModel
    };
}

/**
 * Scan all Agents
 */
export async function scanAgents(): Promise<DetectedAgent[]> {
    const results: DetectedAgent[] = [];

    for (const agent of SUPPORTED_AGENTS) {
        const detected = await detectAgent(agent);
        results.push(detected);
    }

    return results;
}

/**
 * Ensure directory exists
 */
export async function ensureDir(dirPath: string): Promise<void> {
    try {
        fs.mkdirSync(dirPath, { recursive: true });
    } catch {
        // Ignore
    }
}
