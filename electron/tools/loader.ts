
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { ModelInfo, ToolConfigurator } from './types';

const execAsync = promisify(exec);

// --- paths.json 数据结构 ---
interface PathsConfig {
    // === 元数据（原来在 default-tools.json，现在统一到 paths.json） ===
    name: string;           // 显示名称（如 "OpenClaw"）
    names?: Record<string, string>;  // i18n 名称（按语言代码映射）
    category: string;       // 分类：AgentOS | IDE | CLI | AutoTrading
    apiProtocol: string[];  // 支持的 API 协议 ["openai", "anthropic"]
    installUrl?: string;    // 安装地址（可选，用于 Install 按钮）

    // === 路径检测 ===
    docs: string;           // 官方安装文档链接
    command: string;        // CLI 命令名
    envVar?: string;        // 自定义路径环境变量
    configDir: string;      // 配置目录路径
    configFile: string;     // 主配置文件路径
    configFileAlt?: string; // 备用配置文件路径
    requireConfigFile: boolean; // 是否要求配置文件存在才算已安装
    detectByConfigDir?: boolean; // 通过配置目录是否存在来判断安装（适用于 GUI 桌面程序）
    paths: {                // 平台特定的安装路径候选
        win32?: string[];
        darwin?: string[];
        linux?: string[];
    };
    skillsPath?: {          // 技能目录（可选）
        envVar?: string;
        win32?: string[];
        npmModule?: string;
    };
    extensionPaths?: {      // VS Code 扩展检测路径（可选，支持 * 通配符）
        win32?: string[];
        darwin?: string[];
        linux?: string[];
    };
    alwaysInstalled?: boolean;  // 内置工具，始终视为已安装（如游戏）
    version?: string;           // 内置工具版本号（无可执行文件时使用）
    description?: string;       // 工具描述（显示在卡片上）
    launchable?: boolean;       // 是否可通过 LAUNCH APP 启动
    launchType?: string;        // 启动类型：html
    launchFile?: string;        // 启动文件名（如 game.html）
}

// --- config.json 数据结构 ---
interface ConfigMapping {
    docs: string;       // 官方配置文档链接
    configFile: string; // 配置文件路径
    format: string;     // 格式（目前只支持 json）
    custom?: boolean;   // 是否使用自定义 model.ts 逻辑
    read?: {            // 读取映射：ModelInfo 字段 → 配置文件路径数组（优先级从高到低）
        model?: string[];
        baseUrl?: string[];
        apiKey?: string[];
        proxyUrl?: string[];
    };
    write?: Record<string, string>;     // 写入映射：配置文件路径 → ModelInfo 字段名
    writeProxy?: Record<string, string>; // 代理写入映射（有代理时写入，无代理时删除）
}

// --- 工具函数 ---

/** 展开路径中的环境变量和 ~ */
function expandPath(inputPath: string): string {
    let result = inputPath;
    if (process.platform === 'win32') {
        result = result.replace(/%([^%]+)%/g, (_, name) => process.env[name] || '');
    }
    if (result.startsWith('~/') || result === '~') {
        result = path.join(os.homedir(), result.slice(1));
    }
    // 统一分隔符
    return path.normalize(result);
}

/** 跨平台查找可执行文件 */
async function findExecutable(command: string): Promise<string | null> {
    const isWindows = process.platform === 'win32';
    const checkCmd = isWindows ? `where ${command}` : `which ${command}`;

    try {
        const { stdout } = await execAsync(checkCmd);
        const lines = stdout.trim().split('\n').map(l => l.trim()).filter(l => l);

        if (lines.length > 0) {
            if (isWindows) {
                const withExt = lines.find(l => /\.(exe|cmd|bat|ps1)$/i.test(l));
                return withExt || lines[0];
            }
            return lines[0];
        }
        return null;
    } catch {
        return null;
    }
}

/** 从嵌套对象中按点号路径读取值（如 "env.ANTHROPIC_MODEL"） */
function getNestedValue(obj: any, dotPath: string): any {
    const parts = dotPath.split('.');
    let current = obj;
    for (const part of parts) {
        if (current == null || typeof current !== 'object') return undefined;
        current = current[part];
    }
    return current;
}

/** 设置嵌套对象的值（自动创建中间对象） */
function setNestedValue(obj: any, dotPath: string, value: any): void {
    const parts = dotPath.split('.');
    let current = obj;
    for (let i = 0; i < parts.length - 1; i++) {
        if (current[parts[i]] == null || typeof current[parts[i]] !== 'object') {
            current[parts[i]] = {};
        }
        current = current[parts[i]];
    }
    current[parts[parts.length - 1]] = value;
}

/** 删除嵌套对象的值 */
function deleteNestedValue(obj: any, dotPath: string): void {
    const parts = dotPath.split('.');
    let current = obj;
    for (let i = 0; i < parts.length - 1; i++) {
        if (current == null || typeof current !== 'object') return;
        current = current[parts[i]];
    }
    if (current != null && typeof current === 'object') {
        delete current[parts[parts.length - 1]];
    }
}

// --- 通用工具配置器（由 JSON 数据驱动） ---
class DataDrivenToolConfigurator implements ToolConfigurator {
    readonly toolId: string;
    private pathsConfig: PathsConfig;
    private configMapping: ConfigMapping;
    private customModelModule: any;  // 自定义 model.ts（仅 OpenClaw 等特殊工具使用）
    private toolDir: string;  // 工具目录的绝对路径

    constructor(toolId: string, pathsConfig: PathsConfig, configMapping: ConfigMapping, toolDir: string, customModelModule?: any) {
        this.toolId = toolId;
        this.pathsConfig = pathsConfig;
        this.configMapping = configMapping;
        this.toolDir = toolDir;
        this.customModelModule = customModelModule;
    }

    // --- 元数据访问（来自 paths.json） ---
    getName(): string { return this.pathsConfig.name || this.toolId; }
    getCategory(): string { return this.pathsConfig.category || 'CLI'; }
    getNames(): Record<string, string> | undefined { return this.pathsConfig.names; }
    getApiProtocol(): string[] { return this.pathsConfig.apiProtocol || []; }
    getDocs(): string { return this.pathsConfig.docs || ''; }
    getInstallUrl(): string | undefined { return this.pathsConfig.installUrl; }

    getConfigFile(): string {
        const cfgFile = this.configMapping.configFile || this.pathsConfig.configFile || '';
        return expandPath(cfgFile);
    }

    // --- 获取可启动文件路径 ---
    getLaunchFile(): string | undefined {
        if (!this.pathsConfig.launchable || !this.pathsConfig.launchFile) return undefined;
        // 返回工具目录下的启动文件的绝对路径
        return this.pathsConfig.launchFile;
    }

    // --- 检测逻辑（完全由 paths.json 驱动） ---
    async detect(): Promise<string | null> {
        const pc = this.pathsConfig;

        // 0. 内置工具（始终已安装，返回工具目录路径）
        if ((pc as any).alwaysInstalled) {
            return this.toolDir;
        }

        // 1. 检查自定义环境变量
        if (pc.envVar && process.env[pc.envVar]) {
            const customPath = expandPath(process.env[pc.envVar]!);
            if (fs.existsSync(customPath)) return customPath;
        }

        // 2. 通过 PATH 查找命令
        const fromPath = await findExecutable(pc.command);
        if (fromPath) {
            if (pc.requireConfigFile) {
                // 需要配置文件存在才算已安装
                if (this.configFileExists()) {
                    return fromPath;
                }
                console.log(`[${this.toolId}] Command found in PATH but config file missing, treated as not installed`);
            } else {
                // 不需要配置文件，找到命令就算已安装
                return fromPath;
            }
        }

        // 3. 检查平台特定路径
        const platform = process.platform as string;
        const platformPaths = pc.paths?.[platform as keyof typeof pc.paths];
        if (platformPaths) {
            for (const p of platformPaths) {
                const expanded = expandPath(p);
                if (fs.existsSync(expanded)) {
                    if (pc.requireConfigFile) {
                        if (this.configFileExists()) return expanded;
                    } else {
                        return expanded;
                    }
                }
            }
        }

        // 4. 检查 VS Code 扩展安装路径（通配符匹配，优先于 configDir）
        // 必须在 detectByConfigDir 之前，否则返回配置目录路径会导致 processManager
        // 无法识别为 VS Code 扩展（需要路径包含 .vscode/extensions）
        const extPaths = (pc as any).extensionPaths;
        if (extPaths) {
            const extPlatformPaths = extPaths[platform];
            if (extPlatformPaths) {
                for (const pattern of extPlatformPaths) {
                    const expanded = expandPath(pattern);
                    // 通配符匹配：找到任意匹配的目录即认为已安装
                    const baseDir = path.dirname(expanded);
                    const globPart = path.basename(expanded);
                    if (fs.existsSync(baseDir)) {
                        try {
                            const entries = fs.readdirSync(baseDir);
                            const prefix = globPart.replace('*', '');
                            const match = entries.find(e => e.startsWith(prefix));
                            if (match) {
                                const fullPath = path.join(baseDir, match);
                                console.log(`[${this.toolId}] Extension found: ${fullPath}`);
                                return fullPath;
                            }
                        } catch { }
                    }
                }
            }
        }

        // 5. 通过配置目录判断（适用于 GUI 桌面程序，用户可能安装在任意位置）
        if (pc.detectByConfigDir && pc.configDir) {
            const configDir = expandPath(pc.configDir);
            if (fs.existsSync(configDir)) {
                console.log(`[${this.toolId}] Config directory found: ${configDir}, treated as installed`);
                return configDir;  // 返回配置目录作为检测路径
            }
        }

        return null;
    }

    /** 检查配置文件是否存在 */
    private configFileExists(): boolean {
        const mainConfig = expandPath(this.pathsConfig.configFile);
        if (fs.existsSync(mainConfig)) return true;
        // 检查备用配置文件
        if (this.pathsConfig.configFileAlt) {
            const altConfig = expandPath(this.pathsConfig.configFileAlt);
            if (fs.existsSync(altConfig)) return true;
        }
        return false;
    }

    /** 获取当前平台的所有候选路径（已展开，用于图标提取等场景） */
    getCandidatePaths(): string[] {
        const platform = process.platform as string;
        const platformPaths = this.pathsConfig.paths[platform as keyof typeof this.pathsConfig.paths];
        if (!platformPaths) return [];
        return platformPaths.map(p => expandPath(p));
    }

    // --- Skills 路径（可选） ---
    async getSkillsPath(): Promise<string | null> {
        const sp = this.pathsConfig.skillsPath;
        if (!sp) return null;

        // 1. 环境变量
        if (sp.envVar && process.env[sp.envVar]) {
            return process.env[sp.envVar]!;
        }

        // 2. 平台固定路径
        const platform = process.platform as string;
        const platformPaths = (sp as any)[platform] as string[] | undefined;
        if (platformPaths) {
            for (const p of platformPaths) {
                const expanded = expandPath(p);
                if (fs.existsSync(expanded)) return expanded;
            }
        }

        // 3. npm 全局模块
        if (sp.npmModule) {
            try {
                const { stdout } = await execAsync('npm root -g');
                const globalRoot = stdout.trim();
                if (globalRoot) {
                    const modulePath = path.join(globalRoot, ...sp.npmModule.split('/'));
                    if (fs.existsSync(modulePath)) return modulePath;
                }
            } catch {
                // 忽略 npm 错误
            }
        }

        return null;
    }

    /**
     * 将工具目录下 default-skills/ 中的技能自动安装到用户 skills 目录
     * 仅复制用户目录中不存在的技能（不覆盖已有技能）
     */
    async installDefaultSkills(): Promise<void> {
        const defaultSkillsDir = path.join(this.toolDir, 'default-skills');
        if (!fs.existsSync(defaultSkillsDir)) return;

        const userSkillsPath = await this.getSkillsPath();
        if (!userSkillsPath) {
            // 用户 skills 目录不存在，需要创建
            const sp = this.pathsConfig.skillsPath;
            if (!sp) return;
            const platform = process.platform as string;
            const platformPaths = (sp as any)[platform] as string[] | undefined;
            if (!platformPaths || platformPaths.length === 0) return;
            const targetDir = expandPath(platformPaths[0]);
            try {
                fs.mkdirSync(targetDir, { recursive: true });
                console.log(`[${this.toolId}] Created skills directory: ${targetDir}`);
                this.copySkillsTo(defaultSkillsDir, targetDir);
            } catch (e: any) {
                console.error(`[${this.toolId}] Failed to create skills directory:`, e.message);
            }
            return;
        }

        this.copySkillsTo(defaultSkillsDir, userSkillsPath);
    }

    /** 将 srcDir 下的技能目录复制到 destDir（不覆盖已有） */
    private copySkillsTo(srcDir: string, destDir: string): void {
        try {
            const entries = fs.readdirSync(srcDir, { withFileTypes: true });
            for (const entry of entries) {
                if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
                const targetSkillDir = path.join(destDir, entry.name);
                if (fs.existsSync(targetSkillDir)) continue; // 已存在，不覆盖

                // 递归复制整个 skill 目录
                this.copyDirRecursive(path.join(srcDir, entry.name), targetSkillDir);
                console.log(`[${this.toolId}] Installed default skill: ${entry.name}`);
            }
        } catch (e: any) {
            console.error(`[${this.toolId}] Failed to install default skills:`, e.message);
        }
    }

    /** 递归复制目录 */
    private copyDirRecursive(src: string, dest: string): void {
        fs.mkdirSync(dest, { recursive: true });
        const entries = fs.readdirSync(src, { withFileTypes: true });
        for (const entry of entries) {
            const srcPath = path.join(src, entry.name);
            const destPath = path.join(dest, entry.name);
            if (entry.isDirectory()) {
                this.copyDirRecursive(srcPath, destPath);
            } else {
                fs.copyFileSync(srcPath, destPath);
            }
        }
    }

    // --- 读取配置文件 ---
    async readConfig(): Promise<any> {
        const configPath = this.getConfigFile();
        if (fs.existsSync(configPath)) {
            try {
                const content = await fs.promises.readFile(configPath, 'utf-8');
                return JSON.parse(content);
            } catch (error) {
                console.error(`[${this.toolId}] Failed to read config:`, error);
                return {};
            }
        }
        return {};
    }

    // --- 写入配置文件 ---
    private async writeConfig(config: any): Promise<boolean> {
        const configPath = this.getConfigFile();
        try {
            const dir = path.dirname(configPath);
            if (!fs.existsSync(dir)) {
                await fs.promises.mkdir(dir, { recursive: true });
            }
            await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
            return true;
        } catch (error) {
            console.error(`[${this.toolId}] Failed to write config:`, error);
            return false;
        }
    }

    // --- 读取当前模型信息（由 config.json 的 read 映射驱动） ---
    async getCurrentModelInfo(): Promise<ModelInfo | null> {
        // 自定义逻辑优先
        if (this.configMapping.custom && this.customModelModule?.getCurrentModelInfo) {
            return this.customModelModule.getCurrentModelInfo(this.readConfig.bind(this));
        }

        const readMap = this.configMapping.read;
        if (!readMap) return null;

        try {
            const config = await this.readConfig();

            // 按优先级读取每个字段
            const readField = (paths: string[] | undefined): string => {
                if (!paths) return '';
                for (const p of paths) {
                    const val = getNestedValue(config, p);
                    if (val != null && val !== '') return String(val);
                }
                return '';
            };

            const model = readField(readMap.model);
            if (!model) return null;

            return {
                id: 'current',
                name: model,
                model: model,
                baseUrl: readField(readMap.baseUrl),
                apiKey: readField(readMap.apiKey),
                proxyUrl: readField(readMap.proxyUrl) || undefined,
            };
        } catch {
            return null;
        }
    }

    // --- 应用模型配置（由 config.json 的 write 映射驱动） ---
    async applyConfig(modelInfo: ModelInfo): Promise<{ success: boolean; message: string }> {
        // Custom logic takes priority
        if (this.configMapping.custom && this.customModelModule?.applyConfig) {
            return this.customModelModule.applyConfig(
                modelInfo,
                this.readConfig.bind(this),
                this.writeConfig.bind(this),
                this.getConfigFile.bind(this)
            );
        }

        const writeMap = this.configMapping.write;
        const proxyMap = this.configMapping.writeProxy;
        if (!writeMap) {
            return { success: false, message: 'No write mapping config' };
        }

        try {
            const config = await this.readConfig();

            // 写入基本字段
            // ModelInfo 的已知字段名列表，用于区分字段映射和固定值
            const knownModelFields = ['id', 'name', 'baseUrl', 'apiKey', 'model', 'proxyUrl'];
            for (const [configPath, modelField] of Object.entries(writeMap)) {
                const value = (modelInfo as any)[modelField];
                if (value != null) {
                    // modelField 是 ModelInfo 的字段名，取其值写入
                    setNestedValue(config, configPath, value);
                } else if (!knownModelFields.includes(modelField)) {
                    // modelField 不是 ModelInfo 字段名，当作固定值直接写入
                    setNestedValue(config, configPath, modelField);
                }
            }

            // 写入/删除代理
            if (proxyMap) {
                if (modelInfo.proxyUrl) {
                    for (const [configPath] of Object.entries(proxyMap)) {
                        setNestedValue(config, configPath, modelInfo.proxyUrl);
                    }
                } else {
                    for (const [configPath] of Object.entries(proxyMap)) {
                        deleteNestedValue(config, configPath);
                    }
                }
            }

            const success = await this.writeConfig(config);

            if (success) {
                const proxyMsg = modelInfo.proxyUrl ? `\nProxy: ${modelInfo.proxyUrl}` : '';
                return {
                    success: true,
                    message: `Model "${modelInfo.name}" applied to ${this.toolId} successfully.${proxyMsg}`
                };
            } else {
                return { success: false, message: 'Failed to write config file' };
            }
        } catch (error: any) {
            return { success: false, message: error.message || 'Unknown error' };
        }
    }
}

// --- 工具加载器 ---
class ToolLoader {
    private tools: Map<string, ToolConfigurator> = new Map();
    private initialized: boolean = false;

    public async initialize() {
        if (this.initialized) return;
        await this.loadTools();
        this.initialized = true;
    }

    private async loadTools() {
        let toolsDir = __dirname;

        // 生产环境（打包后），__dirname 是 'dist-electron'，需附加 'tools'
        if (path.basename(toolsDir) !== 'tools') {
            const potentialToolsDir = path.join(toolsDir, 'tools');
            if (fs.existsSync(potentialToolsDir)) {
                toolsDir = potentialToolsDir;
            }
        }

        console.log('[ToolLoader] Scanning tools directory:', toolsDir);

        try {
            const items = fs.readdirSync(toolsDir);
            console.log(`[ToolLoader] Found ${items.length} items:`, items);

            for (const item of items) {
                const fullPath = path.join(toolsDir, item);
                try {
                    if (!fs.statSync(fullPath).isDirectory()) continue;

                    // 尝试加载 paths.json + config.json（数据驱动方式）
                    const pathsFile = path.join(fullPath, 'paths.json');
                    const configFile = path.join(fullPath, 'config.json');

                    if (fs.existsSync(pathsFile) && fs.existsSync(configFile)) {
                        try {
                            const pathsConfig: PathsConfig = JSON.parse(
                                fs.readFileSync(pathsFile, 'utf-8')
                            );
                            const configMapping: ConfigMapping = JSON.parse(
                                fs.readFileSync(configFile, 'utf-8')
                            );

                            // 如果配置标记为 custom，尝试加载自定义 model 模块
                            let customModelModule: any = undefined;
                            if (configMapping.custom) {
                                try {
                                    const modelPath = path.join(fullPath, 'model.cjs');
                                    customModelModule = require(modelPath);
                                    console.log(`[ToolLoader] Loading custom model module: ${item}`);
                                } catch (e: any) {
                                    console.warn(`[ToolLoader] ${item} marked as custom but failed to load model module:`, e.message);
                                }
                            }

                            const tool = new DataDrivenToolConfigurator(
                                item,
                                pathsConfig,
                                configMapping,
                                fullPath,
                                customModelModule
                            );

                            console.log(`[ToolLoader] Loaded data-driven tool: ${item} (docs: ${pathsConfig.docs})`);
                            this.register(tool);

                            // 自动安装 default-skills 到用户目录
                            tool.installDefaultSkills().catch(e =>
                                console.error(`[ToolLoader] Failed to install default skills for ${item}:`, e)
                            );
                        } catch (e: any) {
                            console.error(`[ToolLoader] Failed to parse JSON for ${item}:`, e.message);
                        }
                    } else {
                        console.log(`[ToolLoader] Skipping ${item} (missing paths.json or config.json)`);
                    }
                } catch (e) {
                    console.error(`[ToolLoader] Error processing ${item}:`, e);
                }
            }
        } catch (e) {
            console.error('[ToolLoader] Dynamic scan failed:', e);
        }
    }

    register(tool: ToolConfigurator) {
        if (this.tools.has(tool.toolId)) {
            console.warn(`[ToolLoader] Tool ${tool.toolId} already registered, skipping`);
            return;
        }
        this.tools.set(tool.toolId, tool);
    }

    getTool(toolId: string): ToolConfigurator | undefined {
        return this.tools.get(toolId);
    }

    getAllToolIds(): string[] {
        return Array.from(this.tools.keys());
    }
}

export const toolLoader = new ToolLoader();
