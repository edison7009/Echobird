import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { execSync } from 'child_process';
import { ModelInfo } from '../types';

/**
 * OpenClaw Model Module (Patch Injection)
 * 
 * 配置写到 ~/.whichclaw/openclaw.json，
 * 补丁脚本注入到 OpenClaw 入口文件 openclaw.mjs，
 * 每次 OpenClaw 启动时自动读取并注入模型配置。
 * 不直接修改 ~/.openclaw/openclaw.json。
 */

const WHICHCLAW_DIR = path.join(os.homedir(), '.whichclaw');
const WC_OPENCLAW_CONFIG = path.join(WHICHCLAW_DIR, 'openclaw.json');
// 补丁标记
const PATCH_MARKER = '[WhichClaw-Patched]';

/**
 * WhichClaw OpenClaw 配置文件格式
 */
interface WhichClawOpenClawConfig {
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
    if (!fs.existsSync(WHICHCLAW_DIR)) {
        fs.mkdirSync(WHICHCLAW_DIR, { recursive: true });
    }
}

/**
 * 读取 WhichClaw 自己的 OpenClaw 配置
 */
function readWcConfig(): WhichClawOpenClawConfig | null {
    try {
        if (fs.existsSync(WC_OPENCLAW_CONFIG)) {
            const content = fs.readFileSync(WC_OPENCLAW_CONFIG, 'utf-8');
            return JSON.parse(content) as WhichClawOpenClawConfig;
        }
    } catch (e: any) {
        console.error('[OpenClaw] Failed to read WhichClaw config:', e.message);
    }
    return null;
}

/**
 * 写入 WhichClaw 自己的 OpenClaw 配置
 */
function writeWcConfig(config: WhichClawOpenClawConfig): boolean {
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
 * 获取配置文件路径（返回 WhichClaw 自己的配置路径）
 */
export function getConfigFile(): string {
    return WC_OPENCLAW_CONFIG;
}

/**
 * 从 WhichClaw 配置读取当前模型信息
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
 * 应用模型配置到 OpenClaw
 * 写入 ~/.whichclaw/openclaw.json 并自动检测/打补丁
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

        const config: WhichClawOpenClawConfig = {
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
