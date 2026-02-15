// CodeBuddy 自定义模型读写逻辑
// 配置文件格式: ~/.codebuddy/models.json
// {
//   "models": [
//     { "id": "model-id", "name": "Display Name", "url": "https://api.example.com/v1/chat/completions", "apiKey": "sk-xxx", ... }
//   ],
//   "availableModels": ["model-id"]
// }

/**
 * 读取当前模型信息
 * 从 models.json 的 models 数组中读取第一个模型作为当前模型
 */
async function getCurrentModelInfo(readConfig) {
    try {
        const config = await readConfig();
        if (!config || !config.models || config.models.length === 0) {
            return null;
        }

        // 取第一个模型作为当前活跃模型
        const model = config.models[0];
        return {
            id: 'current',
            name: model.name || model.id || '',
            model: model.id || '',
            baseUrl: (model.url || '').replace(/\/chat\/completions$/, ''),
            apiKey: model.apiKey || '',
        };
    } catch {
        return null;
    }
}

/**
 * 应用模型配置
 * 将 WhichClaw 的模型信息写入 models.json
 * CodeBuddy 要求 URL 以 /chat/completions 结尾
 */
async function applyConfig(modelInfo, readConfig, writeConfig, getConfigFile) {
    try {
        // 构建 CodeBuddy 格式的模型对象
        let url = modelInfo.baseUrl || '';
        // CodeBuddy 要求完整路径，需以 /chat/completions 结尾
        if (url && !url.endsWith('/chat/completions')) {
            if (!url.endsWith('/')) url += '/';
            url += 'chat/completions';
        }

        // 从 URL 提取 vendor（一级域名部分）
        let vendor = 'unknown';
        try {
            const rawUrl = modelInfo.baseUrl || url;
            const hostname = new URL(rawUrl).hostname;
            if (hostname === 'localhost' || hostname.startsWith('127.') || hostname.startsWith('192.168.')) {
                vendor = 'local';
            } else {
                const parts = hostname.split('.');
                vendor = parts.length >= 2 ? parts[parts.length - 2] : hostname;
            }
        } catch { }

        const newModel = {
            id: modelInfo.model || modelInfo.name || 'whichclaw-model',
            name: modelInfo.name || modelInfo.model || 'WhichClaw Model',
            vendor: vendor,
            apiKey: modelInfo.apiKey || '',
            url: url,
            maxInputTokens: 200000,
            maxOutputTokens: 8192,
            supportsToolCall: true,
            supportsImages: true,
        };

        // 直接创建全新配置，不读旧数据，确保只保留一条模型
        const config = {
            models: [newModel],
            availableModels: [newModel.id]
        };

        const success = await writeConfig(config);
        if (success) {
            return {
                success: true,
                message: `Model "${newModel.name}" applied to CodeBuddy. Config: ${getConfigFile()}`
            };
        } else {
            return { success: false, message: 'Failed to write models.json' };
        }
    } catch (error) {
        return { success: false, message: error.message || 'Unknown error' };
    }
}

module.exports = { getCurrentModelInfo, applyConfig };
