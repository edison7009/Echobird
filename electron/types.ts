// Tool definition types
export interface ToolPaths {
    windows?: string[];
    mac?: string[];
    linux?: string[];
}

export interface ToolDefinition {
    id: string;
    name: string;
    category: 'CLI' | 'AgentOS' | 'IDE' | 'AutoTrading' | 'Game' | 'Custom';
    paths: ToolPaths;
    versionCommand?: string;
    official: boolean;
}

export interface ToolConfig {
    version: string;
    tools: ToolDefinition[];
}

export interface DetectedTool extends ToolDefinition {
    installed: boolean;
    detectedPath?: string;   // CLI tool install path (for display)
    configPath?: string;     // User config file path (for display)
    skillsPath?: string;     // skills/commands config directory (for reading installed skills)
    version?: string;
    installedSkillsCount?: number;
    activeModel?: string;    // Currently used model
    website?: string;        // Tool official site/docs link
    apiProtocol?: string[];  // Supported API protocols
    iconBase64?: string;     // 从 exe 提取的图标（base64 格式）
    launchFile?: string;     // 内置可启动 HTML 文件路径（如游戏）
}

// Skill info type
export interface SkillInfo {
    id: string;
    name: string;
    author: string;
    category: string;
    installed: boolean;
    description?: string;
}

