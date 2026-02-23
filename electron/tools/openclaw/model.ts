import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { execSync } from 'child_process';
import { ModelInfo } from '../types';

/**
 * OpenClaw Model Module (Patch Injection)
 * 
 * Config written to ~/.echobird/openclaw.json,
 * patch script injects into OpenClaw entry file openclaw.mjs,
 * auto-reads and injects model config on every OpenClaw start.
 * Does not directly modify ~/.openclaw/openclaw.json.
 */

const ECHOBIRD_DIR = path.join(os.homedir(), '.echobird');
const WC_OPENCLAW_CONFIG = path.join(ECHOBIRD_DIR, 'openclaw.json');
// Patch marker
const PATCH_MARKER = '[Echobird-Patched]';

/**
 * Echobird OpenClaw config file format
 */
interface EchobirdOpenClawConfig {
    apiKey: string;
    baseUrl?: string;
    modelId: string;
    modelName?: string;
    protocol?: string;  // 'openai' | 'anthropic'
}

/**
 * 确保配置目录存在
 */
function ensureConfigDir(): void {
    if (!fs.existsSync(ECHOBIRD_DIR)) {
        fs.mkdirSync(ECHOBIRD_DIR, { recursive: true });
    }
}

/**
 * Read Echobird's own OpenClaw config
 */
function readWcConfig(): EchobirdOpenClawConfig | null {
    try {
        if (fs.existsSync(WC_OPENCLAW_CONFIG)) {
            const content = fs.readFileSync(WC_OPENCLAW_CONFIG, 'utf-8');
            return JSON.parse(content) as EchobirdOpenClawConfig;
        }
    } catch (e: any) {
        console.error('[OpenClaw] Failed to read Echobird config:', e.message);
    }
    return null;
}

/**
 * Write Echobird's own OpenClaw config
 */
function writeWcConfig(config: EchobirdOpenClawConfig): boolean {
    try {
        ensureConfigDir();
        fs.writeFileSync(WC_OPENCLAW_CONFIG, JSON.stringify(config, null, 2), 'utf-8');
        console.log(`[OpenClaw] Config written to ${WC_OPENCLAW_CONFIG}`);
        return true;
    } catch (e: any) {
        console.error('[OpenClaw] Failed to write config:', e.message);
        return false;
    }
}

/**
 * Get config file path (returns Echobird's own config path)
 */
export function getConfigFile(): string {
    return WC_OPENCLAW_CONFIG;
}

/**
 * Read current model info from Echobird config
 */
export async function getCurrentModelInfo(
    _readConfig: () => Promise<any>
): Promise<ModelInfo | null> {
    try {
        const config = readWcConfig();
        if (!config) return null;

        return {
            id: config.modelId,
            name: config.modelName || config.modelId,
            model: config.modelId,
            baseUrl: config.baseUrl || '',
            apiKey: config.apiKey,
        };
    } catch (e: any) {
        console.error('[OpenClaw] Failed to read model info:', e.message);
        return null;
    }
}

/**
 * 查找 OpenClaw 全局安装的入口文件
 */
function findOpenClawEntry(): string | null {
    const candidates = [
        // npm root -g
        (() => {
            try {
                const npmRoot = execSync('npm root -g', { encoding: 'utf-8', timeout: 5000 }).trim();
                return path.join(npmRoot, 'openclaw', 'openclaw.mjs');
            } catch { return null; }
        })(),
        // 已知路径
        path.join(process.env.APPDATA || '', 'npm', 'node_modules', 'openclaw', 'openclaw.mjs'),
        path.join(os.homedir(), '.npm-global', 'lib', 'node_modules', 'openclaw', 'openclaw.mjs'),
    ].filter(Boolean) as string[];

    for (const entry of candidates) {
        if (fs.existsSync(entry)) return entry;
    }
    return null;
}

/**
 * 检测 OpenClaw 入口是否已打补丁，未打则自动执行补丁脚本
 */
function ensurePatch(): { patched: boolean; message: string } {
    try {
        const entryPath = findOpenClawEntry();
        if (!entryPath) {
            return { patched: false, message: 'OpenClaw installation not found' };
        }

        // 检查是否已有补丁标记
        const content = fs.readFileSync(entryPath, 'utf-8');
        if (content.includes(PATCH_MARKER)) {
            return { patched: true, message: 'Patch already applied' };
        }

        // 补丁缺失，自动执行补丁脚本
        const patchScript = path.join(__dirname, 'patch-openclaw.cjs');
        if (!fs.existsSync(patchScript)) {
            return { patched: false, message: 'Patch script not found' };
        }

        console.log('[OpenClaw] Patch missing, auto-patching...');
        execSync(`node "${patchScript}"`, { timeout: 15000 });
        console.log('[OpenClaw] Auto-patch complete');
        return { patched: true, message: 'Auto-patched successfully' };
    } catch (e: any) {
        console.error('[OpenClaw] Auto-patch failed:', e.message);
        return { patched: false, message: `Auto-patch failed: ${e.message}` };
    }
}

/**
 * Apply model config to OpenClaw
 * Write to ~/.echobird/openclaw.json and auto-detect/patch
 */
export async function applyConfig(
    modelInfo: ModelInfo,
    _readConfig: () => Promise<any>,
    _writeConfig: (config: any) => Promise<boolean>,
    _getConfigFile: () => string
): Promise<{ success: boolean; message: string }> {
    try {
        // 确保 model ID 非空
        const modelId = modelInfo.model || modelInfo.name || '';
        if (!modelId) {
            return { success: false, message: 'Model ID is empty, cannot apply config' };
        }

        const config: EchobirdOpenClawConfig = {
            apiKey: modelInfo.apiKey || '',
            modelId: modelId,
            modelName: modelInfo.name || modelId,
            protocol: modelInfo.protocol || 'openai',
        };

        // 设置 baseUrl
        if (modelInfo.baseUrl) {
            let baseUrl = modelInfo.baseUrl;
            if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
            config.baseUrl = baseUrl;
        }

        const success = writeWcConfig(config);

        if (success) {
            // 自动检测并应用补丁
            const patchResult = ensurePatch();
            const patchNote = patchResult.patched
                ? ''
                : ` (Warning: ${patchResult.message})`;
            return {
                success: true,
                message: `Model "${config.modelName}" configured for OpenClaw. Restart OpenClaw to apply.${patchNote}`
            };
        } else {
            return {
                success: false,
                message: 'Failed to write OpenClaw config file. Please check file permissions.'
            };
        }
    } catch (e: any) {
        return { success: false, message: `OpenClaw config error: ${e.message}` };
    }
}
