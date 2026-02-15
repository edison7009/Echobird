import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as yaml from 'js-yaml';
import { ModelInfo } from '../types';

/**
 * Aider 自定义模型模块
 * 
 * 配置文件：~/.aider.conf.yml（YAML 格式）
 * 关键字段：
 *   model: "模型名称"（如 openai/gpt-4, deepseek/deepseek-chat）
 *   openai-api-key: "API Key"
 *   openai-api-base: "API Base URL"
 *   anthropic-api-key: "Anthropic API Key"
 * 
 * 参考：https://aider.chat/docs/config/aider_conf.html
 */

function getConfigFilePath(): string {
    return path.join(os.homedir(), '.aider.conf.yml');
}

export async function getCurrentModelInfo(
    readConfig: () => Promise<any>
): Promise<ModelInfo | null> {
    try {
        const configFile = getConfigFilePath();
        if (!fs.existsSync(configFile)) return null;

        const content = fs.readFileSync(configFile, 'utf-8');
        const config = yaml.load(content) as any;
        if (!config) return null;

        const model = config.model || config['model'] || '';
        if (!model) return null;

        return {
            id: model,
            name: model,
            model: model,
            baseUrl: config['openai-api-base'] || '',
            apiKey: config['openai-api-key'] || config['anthropic-api-key'] || '',
        };
    } catch (e: any) {
        console.error('[Aider] Failed to read model info:', e.message);
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
        const configFile = getConfigFilePath();
        let config: any = {};

        // 读取现有配置
        if (fs.existsSync(configFile)) {
            try {
                const content = fs.readFileSync(configFile, 'utf-8');
                config = yaml.load(content) as any || {};
            } catch {
                config = {};
            }
        }

        // 设置模型
        config['model'] = modelInfo.model;

        // 设置 API Base URL
        let baseUrl = modelInfo.baseUrl || '';
        if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);

        if (baseUrl) {
            config['openai-api-base'] = baseUrl;
        }

        // 设置 API Key
        if (modelInfo.apiKey) {
            config['openai-api-key'] = modelInfo.apiKey;
        }

        // 写入 YAML
        const yamlContent = yaml.dump(config, {
            indent: 2,
            lineWidth: 120,
            noRefs: true,
        });

        fs.writeFileSync(configFile, yamlContent, 'utf-8');

        return {
            success: true,
            message: `Aider updated: model=${modelInfo.model}`
        };
    } catch (e: any) {
        return { success: false, message: `Aider config error: ${e.message}` };
    }
}
