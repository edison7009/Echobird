import { toolLoader } from './tools/loader';
import { ModelInfo } from './tools/types';

// Apply model configuration to a tool
export async function applyModelToTool(toolId: string, modelInfo: ModelInfo): Promise<{ success: boolean; message: string }> {
    console.log(`[ToolConfigManager] applyModelToTool called for ${toolId}`);
    const tool = toolLoader.getTool(toolId);

    if (!tool) {
        console.warn(`[ToolConfigManager] Tool not found: ${toolId}. Available tools: ${toolLoader.getAllToolIds().join(', ')}`);
        return { success: false, message: `Unknown tool: ${toolId}` };
    }

    try {
        // 清理字符串字段的前后空格，防止用户输入空格导致配置异常
        const trimmedInfo = { ...modelInfo };
        for (const key of Object.keys(trimmedInfo) as (keyof ModelInfo)[]) {
            const val = trimmedInfo[key];
            if (typeof val === 'string') {
                (trimmedInfo as any)[key] = val.trim();
            }
        }

        console.log(`[ToolConfigManager] Applying config to ${toolId}...`);
        const result = await tool.applyConfig(trimmedInfo);
        console.log(`[ToolConfigManager] Result for ${toolId}:`, result);
        return result;
    } catch (error: any) {
        console.error(`[ToolConfigManager] Error applying config to ${toolId}:`, error);
        return {
            success: false,
            message: `Error applying config to ${toolId}: ${error.message}`
        };
    }
}

// Get current model info for a tool
export async function getToolModelInfo(toolId: string): Promise<ModelInfo | null> {
    const tool = toolLoader.getTool(toolId);

    if (!tool) {
        return null;
    }

    try {
        return await tool.getCurrentModelInfo();
    } catch (error) {
        console.error(`Error getting model info for ${toolId}:`, error);
        return null;
    }
}
