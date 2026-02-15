import path from 'path';
import os from 'os';
import fs from 'fs';
import { DetectedTool } from './types';
import { ensureDir } from './utils';

// Tool config interface (read from default-tools.json)
export interface ToolConfigDef {
    id: string;
    name: string;
    category: string;
    official: boolean;
    description: string;
    website: string;
    installCommand?: string;
    configPath?: string;
    modelRules?: {
        configFormat: 'json' | 'yaml' | 'toml';
        modelField: string;
        template: Record<string, any>;
    };
}

export class ToolManager {
    private configDir: string;

    constructor() {
        // Use ~/.whichclaw/ as config directory
        this.configDir = path.join(os.homedir(), '.whichclaw', 'config');
    }

    async initialize(): Promise<void> {
        await ensureDir(this.configDir);
        console.log('[ToolManager] Initialized');
    }

    /**
     * Get default tool config (from default-tools.json)
     */
    getDefaultToolsConfig(): ToolConfigDef[] {
        // Try multiple possible paths
        const possiblePaths = [
            path.join(__dirname, '..', 'config', 'default-tools.json'),       // dist-electron -> config
            path.join(__dirname, 'config', 'default-tools.json'),             // dist-electron/config
            path.join(__dirname, '..', 'electron', 'config', 'default-tools.json'), // dist-electron -> electron/config
            path.join(process.cwd(), 'electron', 'config', 'default-tools.json'),   // Project root
        ];

        let configPath = '';
        for (const p of possiblePaths) {
            if (fs.existsSync(p)) {
                configPath = p;
                break;
            }
        }

        if (!configPath) {
            console.log('[ToolManager] Default tools config not found in any path:', possiblePaths);
            return [];
        }

        console.log('[ToolManager] Loading tools config from:', configPath);
        try {
            const content = fs.readFileSync(configPath, 'utf-8');
            const tools = JSON.parse(content) as ToolConfigDef[];
            console.log('[ToolManager] Loaded tools config:', tools.map(t => ({ id: t.id, category: t.category })));
            return tools;
        } catch (error) {
            console.error('[ToolManager] Failed to load default tools config:', error);
            return [];
        }
    }

    /**
     * Detect local tools
     */
    async scanInstalledTools(): Promise<DetectedTool[]> {
        console.log('[ToolManager] Scanning local tools with loader support...');

        // Dynamic import to avoid potential circular dependencies during init
        const { scanAgents } = await import('./utils');
        const { toolLoader } = await import('./tools/loader');
        await toolLoader.initialize();

        // 1. Get baseline scan results from utils (legacy logic)
        const agents = await scanAgents();

        // 2. Enhance with ToolLoader (new logic)
        for (const agent of agents) {
            const tool = toolLoader.getTool(agent.id);
            if (tool) {
                try {
                    // Detect path using new strategy
                    const detectedPath = await tool.detect();
                    if (detectedPath) {
                        agent.installed = true;
                        agent.executablePath = detectedPath;
                        agent.configPath = path.dirname(tool.getConfigFile());

                        // Detect skills path if supported
                        if (tool.getSkillsPath) {
                            const skillsPath = await tool.getSkillsPath();
                            if (skillsPath) {
                                agent.skillsPath = skillsPath;
                            }
                        }
                    }

                    // Get model info using new strategy
                    const modelInfo = await tool.getCurrentModelInfo();
                    if (modelInfo) {
                        agent.activeModel = modelInfo.model;
                    }
                } catch (e) {
                    console.error(`[ToolManager] Error enhancing tool ${agent.id}:`, e);
                }
            }
        }

        console.log('[ToolManager] Enhanced scan results:', agents);

        // 3. 自动补充 toolLoader 发现但 scanAgents 中没有的工具（纯配置驱动的新工具）
        const scannedIds = new Set(agents.map(a => a.id));
        const allLoaderIds = toolLoader.getAllToolIds();
        for (const loaderId of allLoaderIds) {
            if (!scannedIds.has(loaderId)) {
                const tool = toolLoader.getTool(loaderId)!;
                try {
                    const detectedPath = await tool.detect();
                    const modelInfo = await tool.getCurrentModelInfo();
                    let skillsPath: string | undefined;
                    if (tool.getSkillsPath) {
                        skillsPath = (await tool.getSkillsPath()) || undefined;
                    }
                    // 从 skillsPath 目录实际计数已安装技能
                    let skillsCount = 0;
                    if (skillsPath) {
                        try {
                            const entries = fs.readdirSync(skillsPath, { withFileTypes: true });
                            skillsCount = entries.filter(e => e.isDirectory() && !e.name.startsWith('.')).length;
                        } catch { }
                    }
                    agents.push({
                        id: loaderId,
                        name: loaderId,
                        installed: !!detectedPath,
                        version: (tool as any).pathsConfig?.version,
                        executablePath: detectedPath || undefined,
                        configPath: detectedPath ? path.dirname(tool.getConfigFile()) : undefined,
                        skillsPath: skillsPath || '',
                        installedSkillsCount: skillsCount,
                        activeModel: modelInfo?.model,
                    });
                } catch (e) {
                    console.error(`[ToolManager] Error detecting new tool ${loaderId}:`, e);
                }
            }
        }

        // 4. 从 toolLoader 获取元数据（统一数据源：paths.json）
        const result: DetectedTool[] = agents.map(agent => {
            const tool = toolLoader.getTool(agent.id);
            return {
                id: agent.id,
                name: tool?.getName() || agent.name,
                category: (tool?.getCategory() as any) || 'CLI',
                website: tool?.getDocs() || '',
                apiProtocol: tool?.getApiProtocol() || [],
                paths: {},
                official: true,
                installed: agent.installed,
                version: agent.version,
                detectedPath: agent.executablePath,
                configPath: agent.configPath,
                skillsPath: agent.skillsPath,
                installedSkillsCount: agent.installedSkillsCount,
                activeModel: agent.activeModel,
                launchFile: (tool as any)?.getLaunchFile?.() || undefined,
                names: (tool as any)?.getNames?.() || undefined,
            };
        });

        return result;
    }

    async updateOnlineConfig(): Promise<boolean> {
        return false;
    }

    async addCustomTool(): Promise<void> { }

    async removeCustomTool(): Promise<void> { }
}

export const toolManager = new ToolManager();
