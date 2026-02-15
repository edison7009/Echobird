
export interface ModelInfo {
    id: string;
    name: string;
    baseUrl: string;
    apiKey: string;
    model: string;
    proxyUrl?: string;
    protocol?: string;  // API 协议类型（openai / anthropic）
}

export interface ToolConfigurator {
    /** 
     * Unique identifier for the tool (e.g., 'claudecode') 
     */
    readonly toolId: string;

    // --- 元数据访问（来自 paths.json） ---
    getName(): string;
    getCategory(): string;
    getApiProtocol(): string[];
    getDocs(): string;
    getInstallUrl(): string | undefined;

    /**
     * Detect if the tool is installed and return the executable path.
     * Returns null if not found.
     */
    detect(): Promise<string | null>;

    /**
     * Get the tool's configuration file path.
     */
    getConfigFile(): string;

    /**
     * Get the path to the skills directory for the tool, if applicable.
     * Returns null if not found or not applicable.
     */
    getSkillsPath?(): Promise<string | null>;

    /**
     * Read the current configuration of the tool.
     */
    readConfig(): Promise<any>;

    /**
     * Apply the model configuration to the tool.
     * Returns true if successful.
     */
    applyConfig(modelInfo: ModelInfo): Promise<{ success: boolean; message: string }>;

    /**
     * Get the current model info from the tool configuration.
     */
    getCurrentModelInfo(): Promise<ModelInfo | null>;
}
