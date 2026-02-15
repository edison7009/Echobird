import { ModelInfo } from '../types';

/**
 * OpenCode 自定义模型模块
 * 
 * 配置文件：~/.config/opencode/opencode.json
 * 配置结构：{
 *   "$schema": "https://opencode.ai/config.json",
 *   "provider": {
 *     "<providerId>": {
 *       "npm": "@ai-sdk/openai-compatible",
 *       "name": "Display Name",
 *       "options": { "baseURL": "...", "apiKey": "..." },
 *       "models": { "<modelId>": { "name": "..." } }
 *     }
 *   }
 * }
 * 
 * 参考：https://opencode.ai/docs/providers#custom-provider
 */

// 从 URL 提取域名作为 provider 名
function extractDomainName(url: string): string {
    try {
        const hostname = new URL(url).hostname;
        const parts = hostname.split('.');
        if (parts.length >= 2) {
            // api.deepseek.com → deepseek
            // ark.cn-beijing.volces.com → volces
            return parts[parts.length - 2];
        }
        return hostname;
    } catch {
        return 'whichclaw';
    }
}

export async function getCurrentModelInfo(
    readConfig: () => Promise<any>
): Promise<ModelInfo | null> {
    try {
        const config = await readConfig();
        if (!config || !config.provider) return null;

        // 遍历所有 provider，找到第一个有 models 的
        for (const [providerId, providerData] of Object.entries(config.provider)) {
            const provider = providerData as any;
            if (!provider.models) continue;

            const modelIds = Object.keys(provider.models);
            if (modelIds.length === 0) continue;

            const modelId = modelIds[0];
            const modelEntry = provider.models[modelId];

            return {
                id: `${providerId}/${modelId}`,
                name: modelEntry.name || modelId,
                model: modelId,
                baseUrl: provider.options?.baseURL || '',
                apiKey: provider.options?.apiKey || '',
            };
        }

        return null;
    } catch (e: any) {
        console.error('[OpenCode] Failed to read model info:', e.message);
        return null;
    }
}

export async function applyConfig(
    modelInfo: ModelInfo,
    readConfig: () => Promise<any>,
    writeConfig: (config: any) => Promise<boolean>,
    getConfigFile: () => string
): Promise<{ success: boolean; message: string }> {
    try {
        let config = await readConfig();
        if (!config) {
            // 配置文件不存在，创建新的
            config = {
                '$schema': 'https://opencode.ai/config.json',
                provider: {}
            };
        }

        // 确保 provider 存在
        if (!config.provider) {
            config.provider = {};
        }

        // 准备 baseURL
        let baseUrl = modelInfo.baseUrl || 'https://api.openai.com/v1';
        if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);

        // 从 URL 提取 provider 名称（如 deepseek、volces）
        const providerName = extractDomainName(baseUrl);

        // 清空所有 provider，只保留当前推送的
        config.provider = {};
        config.provider[providerName] = {
            npm: '@ai-sdk/openai-compatible',
            name: `${providerName} (via WhichClaw)`,
            options: {
                baseURL: baseUrl,
                apiKey: modelInfo.apiKey || '',
            },
            models: {
                [modelInfo.model]: {
                    name: modelInfo.name || modelInfo.model
                }
            }
        };

        const success = await writeConfig(config);
        if (success) {
            return {
                success: true,
                message: `OpenCode updated: provider=${providerName}, model=${modelInfo.model}`
            };
        } else {
            return { success: false, message: 'Failed to write OpenCode config' };
        }
    } catch (e: any) {
        return { success: false, message: `OpenCode config error: ${e.message}` };
    }
}
