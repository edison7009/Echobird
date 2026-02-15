import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as yaml from 'js-yaml';
import { ModelInfo } from '../types';

/**
 * Continue Model Module
 * 
 * Config file: ~/.continue/config.yaml (YAML format)
 * Reference: https://docs.continue.dev/reference
 */

function getConfigFilePath(): string {
    return path.join(os.homedir(), '.continue', 'config.yaml');
}

export async function getCurrentModelInfo(
    _readConfig: () => Promise<any>
): Promise<ModelInfo | null> {
    try {
        const configFile = getConfigFilePath();
        if (!fs.existsSync(configFile)) return null;

        const content = fs.readFileSync(configFile, 'utf-8');
        const config = yaml.load(content) as any;
        if (!config || !config.models || !Array.isArray(config.models)) return null;

        // Find first model with 'chat' role
        let targetModel = config.models.find((m: any) =>
            m.roles && Array.isArray(m.roles) && m.roles.includes('chat')
        );

        // Fallback to first model
        if (!targetModel && config.models.length > 0) {
            targetModel = config.models[0];
        }
        if (!targetModel) return null;

        return {
            id: `${targetModel.provider || 'unknown'}/${targetModel.model || ''}`,
            name: targetModel.name || targetModel.model || '',
            model: targetModel.model || '',
            baseUrl: targetModel.apiBase || '',
            apiKey: targetModel.apiKey || '',
        };
    } catch (e: any) {
        console.error('[Continue] Failed to read model info:', e.message);
        return null;
    }
}

export async function applyConfig(
    modelInfo: ModelInfo,
    _readConfig: () => Promise<any>,
    _writeConfig: (config: any) => Promise<boolean>,
    _getConfigFile: () => string
): Promise<{ success: boolean; message: string }> {
    try {
        const configFile = getConfigFilePath();
        let config: any = null;

        // Read existing config
        if (fs.existsSync(configFile)) {
            try {
                const content = fs.readFileSync(configFile, 'utf-8');
                config = yaml.load(content) as any;
            } catch {
                config = null;
            }
        }

        // Create new config if none exists
        if (!config) {
            config = {
                name: 'WhichClaw Config',
                version: '1.0.0',
                schema: 'v1',
                models: []
            };
        }

        // Ensure models array exists
        if (!config.models || !Array.isArray(config.models)) {
            config.models = [];
        }


        // Prepare baseURL
        let baseUrl = modelInfo.baseUrl || 'https://api.openai.com/v1';
        if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);

        // Extract root domain from baseUrl (e.g. api.minimaxi.com -> minimaxi.com)
        let domainTag = 'openai.com';
        try {
            const host = new URL(baseUrl).hostname;
            const parts = host.split('.');
            if (parts.length >= 2) {
                domainTag = parts.slice(-2).join('.');
            }
        } catch { }

        // Build model entry
        const newModel: any = {
            name: `${modelInfo.name || modelInfo.model} (${domainTag})`,
            provider: 'openai',
            model: modelInfo.model,
            apiBase: baseUrl,
            roles: ['chat', 'edit'],
        };

        // Add apiKey if present
        if (modelInfo.apiKey) {
            newModel.apiKey = modelInfo.apiKey;
        }

        // Find existing WhichClaw-pushed model (name ends with domain tag in parentheses)
        const existingIndex = config.models.findIndex((m: any) =>
            m.name && /\([\w.-]+\)$/.test(m.name.trim())
        );

        if (existingIndex >= 0) {
            // Replace existing WhichClaw model
            config.models[existingIndex] = newModel;
        } else {
            // Insert at top
            config.models.unshift(newModel);
        }

        // Write YAML file
        const configDir = path.dirname(configFile);
        if (!fs.existsSync(configDir)) {
            fs.mkdirSync(configDir, { recursive: true });
        }

        const yamlContent = yaml.dump(config, {
            indent: 2,
            lineWidth: 120,
            noRefs: true,
            quotingType: '"',
        });

        fs.writeFileSync(configFile, yamlContent, 'utf-8');

        return {
            success: true,
            message: `Continue updated: model=${modelInfo.model}, apiBase=${baseUrl}`
        };
    } catch (e: any) {
        return { success: false, message: `Continue config error: ${e.message}` };
    }
}
