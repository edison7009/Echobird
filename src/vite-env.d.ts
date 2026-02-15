/// <reference types="vite/client" />

interface DetectedTool {
    id: string;
    name: string;
    category: string;
    installed: boolean;
    detectedPath?: string;   // CLI 工具安装路径 (用于显示)
    configPath?: string;
    skillsPath?: string;     // skills/commands 配置目录 (用于读取技能)
    version?: string;
    installedSkillsCount?: number;
    activeModel?: string;    // 当前使用的模型
    website?: string;        // 工具官网/文档链接
    apiProtocol?: string[];  // 支持的 API 协议
    iconBase64?: string;     // 从 exe 提取的图标（base64 格式）
}

interface SkillInfo {
    id: string;
    name: string;
    author: string;
    category: string;
    installed: boolean;
    brief?: string;
    description?: string;
}

interface Window {
    electron: {
        getAppVersion: () => Promise<string>;
        // 窗口控制 API
        windowMinimize: () => void;
        windowMaximize: () => void;
        windowClose: () => void;
        windowIsMaximized: () => Promise<boolean>;
        // Tool APIs
        scanTools: () => Promise<DetectedTool[]>;
        updateToolConfig: () => Promise<boolean>;
        addCustomTool: (tool: any) => Promise<DetectedTool[]>;
        removeCustomTool: (toolId: string) => Promise<DetectedTool[]>;
        // Skill APIs
        getSkillsList: () => Promise<SkillInfo[]>;
        getSkillCategories: () => Promise<string[]>;
        installSkill: (skillId: string) => Promise<{ success: boolean; message: string; command?: string }>;
        uninstallSkill: (skillId: string) => Promise<{ success: boolean; message: string }>;
        searchSkills: (query: string) => Promise<SkillInfo[]>;
        getSkillDetails: (skillId: string) => Promise<{ description: string; readme?: string }>;
        getToolInstalledSkills: (skillsPath: string) => Promise<InstalledSkillInfo[]>;
        openFolder: (folderPath: string) => Promise<{ success: boolean; error?: string }>;
        getClaudeConfig: (configPath: string) => Promise<ClaudeConfig>;
        // Model APIs
        getModels: () => Promise<ModelConfig[]>;
        addModel: (config: { name: string; baseUrl: string; anthropicUrl?: string; apiKey: string; modelId?: string; proxyUrl?: string; ssNode?: SSNodeConfig }) => Promise<ModelConfig>;
        deleteModel: (internalId: string) => Promise<boolean>;
        updateModel: (internalId: string, updates: { name?: string; baseUrl?: string; anthropicUrl?: string; apiKey?: string; modelId?: string; proxyUrl?: string; ssNode?: SSNodeConfig }) => Promise<ModelConfig | null>;
        testModel: (internalId: string, prompt: string, protocol?: 'openai' | 'anthropic') => Promise<{ success: boolean; latency: number; response?: string; error?: string; protocol: 'openai' | 'anthropic' }>;
        toggleKeyEncryption: (internalId: string) => Promise<{ success: boolean; apiKey: string; encrypted: boolean }>;
        isKeyDestroyed: (internalId: string) => Promise<boolean>;
        pingModel: (internalId: string) => Promise<{ success: boolean; latency: number; url: string; error?: string }>;
        // Tool Config APIs
        applyModelToTool: (toolId: string, modelInfo: { id: string; name: string; baseUrl: string; apiKey: string; model: string; proxyUrl?: string; protocol?: string }) => Promise<{ success: boolean; message: string }>;
        getToolModelInfo: (toolId: string) => Promise<{ id: string; name: string; baseUrl: string; apiKey: string; model: string; proxyUrl?: string } | null>;
        // SS Proxy Server APIs
        startSSProxy: () => Promise<{ success: boolean; port?: number; error?: string }>;
        stopSSProxy: () => Promise<{ success: boolean }>;
        addSSProxyRoute: (modelId: string, targetUrl: string, ssNode: SSNodeConfig) => Promise<{ success: boolean; proxyUrl: string }>;
        removeSSProxyRoute: (modelId: string) => Promise<{ success: boolean }>;
        parseSSUrl: (ssUrl: string) => Promise<SSNodeConfig | null>;
        addSSProxyRoute: (modelId: string, targetUrl: string, ssNode: SSNodeConfig) => Promise<{ success: boolean; proxyUrl: string }>;
        removeSSProxyRoute: (modelId: string) => Promise<{ success: boolean }>;
        parseSSUrl: (ssUrl: string) => Promise<SSNodeConfig | null>;
        getSSProxyPort: () => Promise<number>;
        // Local Model APIs
        selectLocalModelFile: () => Promise<string | null>;
        startLocalModelServer: (config: { modelPath: string; port: number; gpuLayers: number; contextSize: number }) => Promise<{ success: boolean; error?: string }>;
        stopLocalModelServer: () => Promise<{ success: boolean; error?: string }>;
        getLocalModelServerLogs: () => Promise<string[]>;
        getLocalModelServerStatus: () => Promise<{ running: boolean; pid?: number }>;
        // llama-server 引擎检测 & 下载 APIs
        checkLlamaServer: () => Promise<{ installed: boolean; path: string | null }>;
        downloadLlamaServer: () => Promise<{ success: boolean; error?: string }>;
        onLlamaDownloadProgress: (callback: (data: { fileName: string; progress: number; downloaded: number; total: number; status: string }) => void) => void;
        // Model Store APIs（模型商城）
        getStoreModels: () => Promise<any[]>;
        getDownloadedModels: () => Promise<{ fileName: string; filePath: string; fileSize: number }[]>;
        downloadModel: (repo: string, fileName: string) => Promise<{ success: boolean; error?: string; filePath?: string }>;
        cancelDownload: (fileName?: string) => Promise<{ success: boolean; error?: string }>;
        pauseDownload: () => Promise<{ success: boolean; error?: string }>;
        deleteModelFiles: (filePaths: string[]) => Promise<{ success: boolean; deleted: string[]; errors: string[] }>;
        getModelsDir: () => Promise<string[]>;
        addModelsDir: () => Promise<{ success: boolean; error?: string; dirs?: string[] }>;
        removeModelsDir: (dirPath: string) => Promise<{ success: boolean; dirs?: string[] }>;
        getDownloadDir: () => Promise<string>;
        setDownloadDir: () => Promise<{ success: boolean; dir?: string }>;
        getGpuInfo: () => Promise<{ name: string; vramGB: number }>;
        setGpuVram: (vramGB: number) => Promise<{ success: boolean; vramGB: number }>;
        onDownloadProgress: (callback: (data: { fileName: string; progress: number; downloaded: number; total: number; status: string }) => void) => void;
        // App Log APIs
        getAppLogs: () => Promise<{ timestamp: string; category: string; message: string }[]>;
        clearAppLogs: () => Promise<{ success: boolean }>;
        onAppLog: (callback: (entry: { timestamp: string; category: string; message: string }) => void) => void;
        // Process management API
        startTool: (toolId: string) => Promise<{ success: boolean; error?: string }>;
        stopTool: (toolId: string) => Promise<{ success: boolean; error?: string }>;
        getRunningTools: () => Promise<string[]>;
        isToolRunning: (toolId: string) => Promise<boolean>;
        onToolStatusChanged: (callback: (toolId: string, isRunning: boolean) => void) => void;
        // 托盘菜单事件
        onTrayServerToggle: (callback: (action: 'online' | 'offline') => void) => void;
    };
}

// SS 节点配置
interface SSNodeConfig {
    name: string;
    server: string;
    port: number;
    cipher: string;
    password: string;
}

interface ModelConfig {
    internalId: string;      // 内部通信 ID (WhichClaw 内部使用)
    name: string;          // 用户自定义名称
    modelId?: string;      // API 模型 ID (传给 API)
    baseUrl: string;       // OpenAI 兼容 API 端点
    apiKey: string;
    anthropicUrl?: string; // Anthropic 协议端点
    type: 'CLOUD' | 'LOCAL' | 'TUNNEL' | 'DEMO';  // 模型类型
    proxyUrl?: string;     // 生成的中转 URL
    ssNode?: SSNodeConfig; // SS 节点配置
    // 协议测试状态
    openaiTested?: boolean;       // OpenAI 协议测试通过
    anthropicTested?: boolean;    // Anthropic 协议测试通过
    openaiLatency?: number;       // OpenAI 协议延迟 (ms)
    anthropicLatency?: number;    // Anthropic 协议延迟 (ms)
}

interface InstalledSkillInfo {
    id: string;
    name: string;
    path: string;
    hasReadme: boolean;
    description?: string;
}

// Claude Code 配置
interface ClaudeConfig {
    mcpServers: { name: string; command?: string; url?: string }[];
    agents: { name: string; description?: string }[];
    env: Record<string, string>;
}
