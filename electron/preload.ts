import { contextBridge, ipcRenderer } from 'electron';

console.log('[Preload] Starting preload script');

try {
    contextBridge.exposeInMainWorld('electron', {
        getAppVersion: () => ipcRenderer.invoke('get-app-version'),
        setLocale: (locale: string) => ipcRenderer.invoke('set-locale', locale),
        quitApp: () => ipcRenderer.invoke('quit-app'),
        checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
        appReady: () => ipcRenderer.send('app-ready'),

        // 窗口控制 API（无边框窗口自定义标题栏用）
        windowMinimize: () => ipcRenderer.send('window-minimize'),
        windowMaximize: () => ipcRenderer.send('window-maximize'),
        windowClose: () => ipcRenderer.send('window-close'),
        windowIsMaximized: () => ipcRenderer.invoke('window-is-maximized'),

        // Tool scanning API
        scanTools: () => ipcRenderer.invoke('scan-tools'),
        updateToolConfig: () => ipcRenderer.invoke('update-tool-config'),
        addCustomTool: (tool: any) => ipcRenderer.invoke('add-custom-tool', tool),
        removeCustomTool: (toolId: string) => ipcRenderer.invoke('remove-custom-tool', toolId),
        getDefaultToolsConfig: () => ipcRenderer.invoke('get-default-tools-config'),

        // Skill management API
        getSkillsList: () => ipcRenderer.invoke('get-skills-list'),
        getSkillCategories: () => ipcRenderer.invoke('get-skill-categories'),
        installSkill: (skillId: string) => ipcRenderer.invoke('install-skill', skillId),
        uninstallSkill: (skillId: string) => ipcRenderer.invoke('uninstall-skill', skillId),
        searchSkills: (query: string) => ipcRenderer.invoke('search-skills', query),
        getSkillDetails: (skillId: string) => ipcRenderer.invoke('get-skill-details', skillId),
        getToolInstalledSkills: (skillsPath: string) => ipcRenderer.invoke('get-tool-installed-skills', skillsPath),
        openFolder: (folderPath: string) => ipcRenderer.invoke('open-folder', folderPath),
        openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
        setToolModel: (toolId: string, modelConfig: { name: string; baseUrl: string; apiKey: string; model: string }) => ipcRenderer.invoke('set-tool-model', toolId, modelConfig),
        getClaudeConfig: (configPath: string) => ipcRenderer.invoke('get-claude-config', configPath),

        // Model management API
        getModels: () => ipcRenderer.invoke('get-models'),
        addModel: (config: { name: string; baseUrl: string; anthropicUrl?: string; apiKey: string; modelId?: string; proxyUrl?: string; ssNode?: any }) => ipcRenderer.invoke('add-model', config),
        deleteModel: (internalId: string) => ipcRenderer.invoke('delete-model', internalId),
        updateModel: (internalId: string, updates: { name?: string; baseUrl?: string; anthropicUrl?: string; apiKey?: string; modelId?: string; proxyUrl?: string; ssNode?: any }) => ipcRenderer.invoke('update-model', internalId, updates),
        testModel: (internalId: string, prompt: string, protocol?: 'openai' | 'anthropic') => ipcRenderer.invoke('test-model', internalId, prompt, protocol || 'openai'),
        toggleKeyEncryption: (internalId: string) => ipcRenderer.invoke('toggle-key-encryption', internalId),
        isKeyDestroyed: (internalId: string) => ipcRenderer.invoke('is-key-destroyed', internalId),
        pingModel: (internalId: string) => ipcRenderer.invoke('ping-model', internalId),

        // Tool config management API
        applyModelToTool: (toolId: string, modelInfo: { id: string; name: string; baseUrl: string; apiKey: string; model: string; proxyUrl?: string; protocol?: string }) => ipcRenderer.invoke('apply-model-to-tool', toolId, modelInfo),
        getToolModelInfo: (toolId: string) => ipcRenderer.invoke('get-tool-model-info', toolId),

        // SS Proxy Server API
        startSSProxy: () => ipcRenderer.invoke('start-ss-proxy'),
        stopSSProxy: () => ipcRenderer.invoke('stop-ss-proxy'),
        addSSProxyRoute: (modelId: string, targetUrl: string, ssNode: { name: string; server: string; port: number; cipher: string; password: string }) => ipcRenderer.invoke('add-ss-proxy-route', modelId, targetUrl, ssNode),
        removeSSProxyRoute: (modelId: string) => ipcRenderer.invoke('remove-ss-proxy-route', modelId),
        parseSSUrl: (ssUrl: string) => ipcRenderer.invoke('parse-ss-url', ssUrl),
        getSSProxyPort: () => ipcRenderer.invoke('get-ss-proxy-port'),

        // Local Model APIs
        selectLocalModelFile: () => ipcRenderer.invoke('model:select-file'),
        startLocalModelServer: (config: any) => ipcRenderer.invoke('model:start-server', config),
        stopLocalModelServer: () => ipcRenderer.invoke('model:stop-server'),
        getLocalModelServerLogs: () => ipcRenderer.invoke('model:get-server-logs'),
        getLocalModelServerStatus: () => ipcRenderer.invoke('model:get-server-status'),
        checkLlamaServer: () => ipcRenderer.invoke('model:check-llama-server'),
        downloadLlamaServer: () => ipcRenderer.invoke('model:download-llama-server'),
        onLlamaDownloadProgress: (callback: (data: { fileName: string; progress: number; downloaded: number; total: number; status: string }) => void) => {
            ipcRenderer.removeAllListeners('llama-download-progress');
            ipcRenderer.on('llama-download-progress', (_event, data) => callback(data));
        },

        // Model Store APIs
        getStoreModels: () => ipcRenderer.invoke('model:get-store-models'),
        getDownloadedModels: () => ipcRenderer.invoke('model:get-downloaded-models'),
        downloadModel: (repo: string, fileName: string) => ipcRenderer.invoke('model:download-model', repo, fileName),
        cancelDownload: (fileName?: string) => ipcRenderer.invoke('model:cancel-download', fileName),
        pauseDownload: () => ipcRenderer.invoke('model:pause-download'),
        deleteModelFiles: (filePaths: string[]) => ipcRenderer.invoke('model:delete-model-files', filePaths),
        getModelsDir: () => ipcRenderer.invoke('model:get-models-dir'),
        addModelsDir: () => ipcRenderer.invoke('model:add-models-dir'),
        removeModelsDir: (dirPath: string) => ipcRenderer.invoke('model:remove-models-dir', dirPath),
        getDownloadDir: () => ipcRenderer.invoke('model:get-download-dir'),
        setDownloadDir: () => ipcRenderer.invoke('model:set-download-dir'),
        getGpuInfo: () => ipcRenderer.invoke('model:get-gpu-info'),
        setGpuVram: (vramGB: number) => ipcRenderer.invoke('model:set-gpu-vram', vramGB),
        onDownloadProgress: (callback: (data: { fileName: string; progress: number; downloaded: number; total: number; status: string }) => void) => {
            ipcRenderer.removeAllListeners('model:download-progress');
            ipcRenderer.on('model:download-progress', (_event, data) => callback(data));
        },

        // Process management API
        startTool: (toolId: string) => ipcRenderer.invoke('start-tool', toolId),
        stopTool: (toolId: string) => ipcRenderer.invoke('stop-tool', toolId),
        getRunningTools: () => ipcRenderer.invoke('get-running-tools'),
        isToolRunning: (toolId: string) => ipcRenderer.invoke('is-tool-running', toolId),
        launchGame: (toolId: string, launchFile: string, modelConfig?: any) => ipcRenderer.invoke('launch-game', toolId, launchFile, modelConfig),

        // App Log APIs
        getAppLogs: () => ipcRenderer.invoke('get-app-logs'),
        clearAppLogs: () => ipcRenderer.invoke('clear-app-logs'),
        onAppLog: (callback: (entry: { timestamp: string; category: string; message: string }) => void) => {
            ipcRenderer.removeAllListeners('app-log');
            ipcRenderer.on('app-log', (_event, entry) => callback(entry));
        },

        // Event listeners
        onToolStatusChanged: (callback: (toolId: string, isRunning: boolean) => void) => {
            // Remove old listeners to avoid duplicates (Optional, but usually handled by cleanup in useEffect)
            ipcRenderer.removeAllListeners('tool-status-changed');
            ipcRenderer.on('tool-status-changed', (_event, toolId, isRunning) => callback(toolId, isRunning));
        },

        // 托盘菜单事件
        onTrayServerToggle: (callback: (action: 'online' | 'offline') => void) => {
            ipcRenderer.removeAllListeners('tray:server-toggle');
            ipcRenderer.on('tray:server-toggle', (_event, action) => callback(action));
        },
    });
    console.log('[Preload] exposeInMainWorld success');
} catch (error) {
    console.error('[Preload] exposeInMainWorld failed:', error);
}

console.log('[Preload] Preload script completed');
