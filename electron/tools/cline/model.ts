import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import { ModelInfo } from '../types';

/**
 * Cline Model Module (Patch Injection)
 * 
 * Writes config to ~/.whichclaw/cline.json,
 * patched Cline extension reads this file on startup and overrides API settings.
 * Auto-detects and applies patch on each Apply.
 */

const WHICHCLAW_DIR = path.join(os.homedir(), '.whichclaw');
const CLINE_CONFIG_FILE = path.join(WHICHCLAW_DIR, 'cline.json');
// 补丁标记
const PATCH_MARKER = '[WhichClaw-Patched]';
// VS Code 扩展目录
const VSCODE_EXTENSIONS_DIR = path.join(os.homedir(), '.vscode', 'extensions');
const CLINE_EXT_PREFIX = 'saoudrizwan.claude-dev-';

/**
 * WhichClaw Cline config file format
 */
interface WhichClawClineConfig {
    provider: 'openai';
    apiKey: string;
    baseUrl?: string;
    modelId: string;
    modelName?: string;
}

/**
 * Ensure config directory exists
 */
function ensureConfigDir(): void {
    if (!fs.existsSync(WHICHCLAW_DIR)) {
        fs.mkdirSync(WHICHCLAW_DIR, { recursive: true });
    }
}

/**
 * Read current config file
 */
function readConfig(): WhichClawClineConfig | null {
    try {
        if (fs.existsSync(CLINE_CONFIG_FILE)) {
            const content = fs.readFileSync(CLINE_CONFIG_FILE, 'utf-8');
            return JSON.parse(content) as WhichClawClineConfig;
        }
    } catch (e: any) {
        console.error('[Cline] Failed to read config:', e.message);
    }
    return null;
}

/**
 * Write config file
 */
function writeConfig(config: WhichClawClineConfig): boolean {
    try {
        ensureConfigDir();
        fs.writeFileSync(CLINE_CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
        console.log(`[Cline] Config written to ${CLINE_CONFIG_FILE}`);
        return true;
    } catch (e: any) {
        console.error('[Cline] Failed to write config:', e.message);
        return false;
    }
}

/**
 * Read current Cline model info from WhichClaw config
 */
export async function getCurrentModelInfo(
    _readConfig: () => Promise<any>
): Promise<ModelInfo | null> {
    try {
        const config = readConfig();
        if (!config) {
            return null;
        }

        return {
            id: config.modelId,
            name: config.modelName || config.modelId,
            model: config.modelId,
            baseUrl: config.baseUrl || '',
            apiKey: config.apiKey,
        };
    } catch (e: any) {
        console.error('[Cline] Failed to read model info:', e.message);
        return null;
    }
}

/**
 * Detect if Cline extension is patched, auto-patch if not
 */
function ensurePatch(): { patched: boolean; message: string } {
    try {
        // Find Cline extension directory
        if (!fs.existsSync(VSCODE_EXTENSIONS_DIR)) {
            return { patched: false, message: 'VS Code extensions directory not found' };
        }
        const dirs = fs.readdirSync(VSCODE_EXTENSIONS_DIR)
            .filter(d => d.startsWith(CLINE_EXT_PREFIX))
            .sort().reverse();
        if (dirs.length === 0) {
            return { patched: false, message: 'Cline extension not installed' };
        }
        const extJs = path.join(VSCODE_EXTENSIONS_DIR, dirs[0], 'dist', 'extension.js');
        if (!fs.existsSync(extJs)) {
            return { patched: false, message: 'extension.js not found' };
        }

        // Check if patch marker exists
        const content = fs.readFileSync(extJs, 'utf-8');
        if (content.includes(PATCH_MARKER)) {
            return { patched: true, message: 'Patch already applied' };
        }

        // Patch missing, auto-execute patch script
        const patchScript = path.join(__dirname, 'patch-cline.cjs');
        if (!fs.existsSync(patchScript)) {
            return { patched: false, message: 'Patch script not found' };
        }

        console.log('[Cline] Patch missing, auto-patching...');
        execSync(`node "${patchScript}"`, { timeout: 15000 });
        console.log('[Cline] Auto-patch complete');
        return { patched: true, message: 'Auto-patched successfully' };
    } catch (e: any) {
        console.error('[Cline] Auto-patch failed:', e.message);
        return { patched: false, message: `Auto-patch failed: ${e.message}` };
    }
}

/**
 * Apply model config to Cline
 * Write to ~/.whichclaw/cline.json and auto-detect/patch extension
 */
export async function applyConfig(
    modelInfo: ModelInfo,
    _readConfig: () => Promise<any>,
    _writeConfig: (config: any) => Promise<boolean>,
    _getConfigFile: () => string
): Promise<{ success: boolean; message: string }> {
    try {
        const provider: 'openai' = 'openai';

        const config: WhichClawClineConfig = {
            provider,
            apiKey: modelInfo.apiKey || '',
            modelId: modelInfo.model,
            modelName: modelInfo.name || modelInfo.model,
        };

        // Set baseUrl
        if (modelInfo.baseUrl) {
            config.baseUrl = modelInfo.baseUrl;
        }

        const success = writeConfig(config);

        if (success) {
            // Auto-detect and patch
            const patchResult = ensurePatch();
            const patchNote = patchResult.patched
                ? ''
                : ` (Warning: ${patchResult.message})`;
            return {
                success: true,
                message: `Model "${config.modelName}" configured for Cline (OpenAI Compatible). Please restart VS Code to apply.${patchNote}`
            };
        } else {
            return {
                success: false,
                message: 'Failed to write Cline config file. Please check file permissions.'
            };
        }
    } catch (e: any) {
        return { success: false, message: `Cline config error: ${e.message}` };
    }
}

