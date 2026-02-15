import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import { ModelInfo } from '../types';

/**
 * Roo Code Model Module (Patch Injection)
 * 
 * Writes config to ~/.whichclaw/roocode.json,
 * patched Roo Code extension reads this file on startup and overrides API settings.
 * Auto-detects and applies patch on each Apply.
 */

// WhichClaw config directory and file
const WHICHCLAW_DIR = path.join(os.homedir(), '.whichclaw');
const ROOCODE_CONFIG_FILE = path.join(WHICHCLAW_DIR, 'roocode.json');
// Patch marker
const PATCH_MARKER = '[WhichClaw-RooCode-Patched]';
// VS Code extension directory
const VSCODE_EXTENSIONS_DIR = path.join(os.homedir(), '.vscode', 'extensions');
const ROOCODE_EXT_PREFIX = 'rooveterinaryinc.roo-cline-';

/**
 * WhichClaw Roo Code config file format
 */
interface WhichClawRooCodeConfig {
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
function readConfig(): WhichClawRooCodeConfig | null {
    try {
        if (fs.existsSync(ROOCODE_CONFIG_FILE)) {
            const content = fs.readFileSync(ROOCODE_CONFIG_FILE, 'utf-8');
            return JSON.parse(content) as WhichClawRooCodeConfig;
        }
    } catch (e: any) {
        console.error('[RooCode] Failed to read config:', e.message);
    }
    return null;
}

/**
 * Write config file
 */
function writeConfig(config: WhichClawRooCodeConfig): boolean {
    try {
        ensureConfigDir();
        fs.writeFileSync(ROOCODE_CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
        console.log(`[RooCode] Config written to ${ROOCODE_CONFIG_FILE}`);
        return true;
    } catch (e: any) {
        console.error('[RooCode] Failed to write config:', e.message);
        return false;
    }
}

/**
 * Read current model info from WhichClaw config
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
        console.error('[RooCode] Failed to read model info:', e.message);
        return null;
    }
}

/**
 * Detect if Roo Code extension is patched, auto-patch if not
 */
function ensurePatch(): { patched: boolean; message: string } {
    try {
        // Find Roo Code extension directory
        if (!fs.existsSync(VSCODE_EXTENSIONS_DIR)) {
            return { patched: false, message: 'VS Code extensions directory not found' };
        }
        const dirs = fs.readdirSync(VSCODE_EXTENSIONS_DIR)
            .filter(d => d.startsWith(ROOCODE_EXT_PREFIX))
            .sort().reverse();
        if (dirs.length === 0) {
            return { patched: false, message: 'Roo Code extension not installed' };
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
        const patchScript = path.join(__dirname, 'patch-roocode.cjs');
        if (!fs.existsSync(patchScript)) {
            return { patched: false, message: 'Patch script not found' };
        }

        console.log('[RooCode] Patch missing, auto-patching...');
        execSync(`node "${patchScript}"`, { timeout: 15000 });
        console.log('[RooCode] Auto-patch complete');
        return { patched: true, message: 'Auto-patched successfully' };
    } catch (e: any) {
        console.error('[RooCode] Auto-patch failed:', e.message);
        return { patched: false, message: `Auto-patch failed: ${e.message}` };
    }
}

/**
 * Apply model config to Roo Code
 * Write to ~/.whichclaw/roocode.json and auto-detect/patch extension
 */
export async function applyConfig(
    modelInfo: ModelInfo,
    _readConfig: () => Promise<any>,
    _writeConfig: (config: any) => Promise<boolean>,
    _getConfigFile: () => string
): Promise<{ success: boolean; message: string }> {
    try {
        const config: WhichClawRooCodeConfig = {
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
                message: `Roo Code configured: model=${config.modelName}. Please restart VS Code to apply.${patchNote}`
            };
        } else {
            return {
                success: false,
                message: 'Failed to write Roo Code config file. Please check file permissions.'
            };
        }
    } catch (e: any) {
        return { success: false, message: `Roo Code config error: ${e.message}` };
    }
}
