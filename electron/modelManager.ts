
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { safeStorage } from 'electron';
import * as ssProxyServer from './ssProxyServer';
import * as nodeNet from 'net'; // Use Node's net module for probing

// Model Config Interface
export interface ModelConfig {
    internalId: string;      // Internal Communication ID (Used internally by WhichClaw, e.g. m-abc123)
    name: string;           // User defined name (For display, e.g. "My OpenRouter")
    modelId?: string;       // API Model ID (Passed to API, e.g. MiniMAX-2.1, gpt-4o)
    baseUrl: string;        // OpenAI Compatible API Endpoint (e.g. https://api.example.com/v1)
    apiKey: string;       // API Key
    anthropicUrl?: string;  // Anthropic Protocol Endpoint (e.g. https://api.example.com)
    type?: 'CLOUD' | 'LOCAL' | 'TUNNEL' | 'DEMO';  // Model Type (Optional, undefined means hidden)
    proxyUrl?: string;      // Generated Relay URL (e.g. http://127.0.0.1:47890/proxy/modelId)
    ssNode?: {              // SS Node Config (Optional)
        name: string;
        server: string;
        port: number;
        cipher: string;
        password: string;
    };
    // Protocol Test Status
    openaiTested?: boolean;        // OpenAI Protocol Verified
    anthropicTested?: boolean;     // Anthropic Protocol Verified
    openaiLatency?: number;        // OpenAI Protocol Latency (ms)
    anthropicLatency?: number;     // Anthropic Protocol Latency (ms)
}

// WhichClaw User Config Directory (Cross-platform: ~/.whichclaw/)
function getWhichClawDir(): string {
    return path.join(os.homedir(), '.whichclaw');
}

// Model Config File Path
function getModelsConfigPath(): string {
    return path.join(getWhichClawDir(), 'config', 'models.json');
}

// Ensure config directory exists
function ensureConfigDir(): void {
    const configDir = path.join(getWhichClawDir(), 'config');
    if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
    }
}

// --- API Key 加密/解密（使用操作系统级安全存储） ---
const ENCRYPTED_PREFIX = 'enc:v1:';

// 加密 API Key（由用户主动触发）
function encryptApiKey(plainKey: string): string {
    if (!plainKey || plainKey.startsWith(ENCRYPTED_PREFIX) || plainKey === 'local') return plainKey;
    try {
        if (!safeStorage.isEncryptionAvailable()) return plainKey;
        const encrypted = safeStorage.encryptString(plainKey);
        return `${ENCRYPTED_PREFIX}${encrypted.toString('base64')}`;
    } catch {
        return plainKey;
    }
}

// 解密 API Key（内部使用，如 testModel、applyModel）
function decryptApiKey(storedKey: string): string {
    if (!storedKey || !storedKey.startsWith(ENCRYPTED_PREFIX)) return storedKey;
    try {
        const encrypted = Buffer.from(storedKey.slice(ENCRYPTED_PREFIX.length), 'base64');
        return safeStorage.decryptString(encrypted);
    } catch {
        console.error('[ModelManager] 解密失败，密钥可能已失效（重装系统/用户变更）');
        return ''; // 解密失败返回空，不传乱码
    }
}

// 获取可用的明文 API Key（内部调用 testModel / applyModel 时使用）
export function decryptKeyForUse(apiKey: string): string {
    return decryptApiKey(apiKey);
}

// Get built-in demo model config path
function getBuiltInModelsPath(): string {
    // Dev env: from dist-electron go up to project root electron/config/models.json
    const devPath = path.join(__dirname, '..', 'electron', 'config', 'models.json');
    if (fs.existsSync(devPath)) {
        return devPath;
    }
    // Alternative: directly in config under __dirname
    const altPath = path.join(__dirname, 'config', 'models.json');
    if (fs.existsSync(altPath)) {
        return altPath;
    }
    // Prod env fallback
    return path.join(process.resourcesPath || __dirname, 'config', 'models.json');
}

// 读取原始用户模型（未解密，内部使用）
function getRawUserModels(): ModelConfig[] {
    const configPath = getModelsConfigPath();
    if (!fs.existsSync(configPath)) {
        return [];
    }
    try {
        const content = fs.readFileSync(configPath, 'utf-8');
        return JSON.parse(content);
    } catch (error) {
        console.error('[ModelManager] Failed to load user models:', error);
        return [];
    }
}

// Get user models（返回原始数据，不自动加密/解密）
function getUserModels(): ModelConfig[] {
    return getRawUserModels();
}

// Get built-in demo models
function getBuiltInModels(): ModelConfig[] {
    const configPath = getBuiltInModelsPath();
    if (!fs.existsSync(configPath)) {
        console.log('[ModelManager] Built-in models not found at:', configPath);
        return [];
    }
    try {
        const content = fs.readFileSync(configPath, 'utf-8');
        return JSON.parse(content);
    } catch (error) {
        console.error('[ModelManager] Failed to load built-in models:', error);
        return [];
    }
}

// Get all models (User + Built-in + Local Server)
export function getModels(): ModelConfig[] {
    const userModels = getUserModels();
    const builtInModels = getBuiltInModels();

    // 动态注入本地服务器模型（仅当 Local Server 运行时）
    const localModels: ModelConfig[] = [];
    try {
        const { getLocalServerInfo } = require('./ipc/localModelHandlers.js');
        const info = getLocalServerInfo();
        if (info.running && info.port > 0) {
            localModels.push({
                internalId: 'local-server',
                name: info.modelName || 'Local Model',
                modelId: '',
                baseUrl: `http://127.0.0.1:${info.port}/v1`,
                apiKey: 'local',
                anthropicUrl: `http://127.0.0.1:${info.port}/anthropic`,
                type: 'LOCAL',
            });
        }
    } catch {
        // localModelHandlers 未初始化时忽略
    }

    // 本地模型 → 用户模型 → 内置模型
    return [...localModels, ...userModels, ...builtInModels];
}

/**
 * Generate unique internal ID
 */
function generateInternalId(): string {
    // Use short format: m-abc123
    return `m-${Math.random().toString(36).substring(2, 8)}`;
}

// Add model
export function addModel(config: {
    name?: string;
    baseUrl?: string;
    anthropicUrl?: string;
    apiKey?: string;
    modelId?: string;
    proxyUrl?: string;
    ssNode?: ModelConfig['ssNode'];
}): ModelConfig {
    ensureConfigDir();
    const models = getUserModels();

    // Auto determine type: LOCAL > CLOUD
    let autoType: ModelConfig['type'] = undefined;
    const urlToCheck = config.baseUrl || '';

    if (urlToCheck) {
        if (urlToCheck.includes('localhost') || urlToCheck.includes('127.0.0.1') || urlToCheck.includes('192.168.')) {
            autoType = 'LOCAL';
        } else {
            try {
                new URL(urlToCheck); // Check validity
                autoType = 'CLOUD';
            } catch { }
        }
    }

    // Generate unique internal ID, keep user API model ID
    const internalId = generateInternalId();
    const userModelId = config.modelId || '';

    const newModel: ModelConfig = {
        internalId,            // For internal communication
        name: config.name || '',
        modelId: userModelId,  // Passed to API (e.g. MiniMAX-2.1)
        baseUrl: config.baseUrl || '',
        apiKey: config.apiKey || '',
        anthropicUrl: config.anthropicUrl,
        proxyUrl: config.proxyUrl,
        ssNode: config.ssNode,
        type: autoType
    };

    models.push(newModel);

    // 直接存储（明文或已加密，由用户决定）
    const configPath = getModelsConfigPath();
    fs.writeFileSync(configPath, JSON.stringify(models, null, 2));

    console.log('[ModelManager] Added model:', newModel.name || '(unnamed)', '(internalId:', newModel.internalId + ')', '(modelId:', newModel.modelId || 'empty' + ')');
    return newModel;
}

// Delete model (User models only)
export function deleteModel(internalId: string): boolean {
    const userModels = getUserModels();  // Only operate on user models
    const filtered = userModels.filter(m => m.internalId !== internalId);

    if (filtered.length === userModels.length) {
        return false; // Not found
    }

    const configPath = getModelsConfigPath();
    fs.writeFileSync(configPath, JSON.stringify(filtered, null, 2));

    console.log('[ModelManager] Deleted model internalId:', internalId);
    return true;
}

// Update model (User models only)
export function updateModel(internalId: string, updates: {
    name?: string;
    baseUrl?: string;
    anthropicUrl?: string;
    apiKey?: string;
    modelId?: string;
    proxyUrl?: string;
    ssNode?: ModelConfig['ssNode'];
    anthropicTested?: boolean;
    openaiTested?: boolean;
    anthropicLatency?: number;
    openaiLatency?: number;
}): ModelConfig | null {
    const userModels = getUserModels();  // Only operate on user models
    const index = userModels.findIndex(m => m.internalId === internalId);

    if (index === -1) {
        console.log('[ModelManager] Model not found in user models:', internalId);
        return null;
    }

    // Re-calculate type if baseUrl changes
    let newType = userModels[index].type;
    if (updates.baseUrl || updates.proxyUrl !== undefined) {
        // const baseUrl = updates.baseUrl || userModels[index].baseUrl;
        // const proxyUrl = updates.proxyUrl !== undefined ? updates.proxyUrl : userModels[index].proxyUrl;
        const urlToCheck = updates.baseUrl || userModels[index].baseUrl || '';
        newType = undefined; // Default to undefined

        if (urlToCheck) {
            if (urlToCheck.includes('localhost') || urlToCheck.includes('127.0.0.1') || urlToCheck.includes('192.168.')) {
                newType = 'LOCAL';
            } else {
                try {
                    new URL(urlToCheck);
                    newType = 'CLOUD';
                } catch { }
            }
        }
    }

    // Keep internal communication ID, update other fields
    userModels[index] = {
        ...userModels[index],
        ...updates,
        type: newType
    };

    // 直接存储
    const configPath = getModelsConfigPath();
    fs.writeFileSync(configPath, JSON.stringify(userModels, null, 2));

    console.log('[ModelManager] Updated model internalId:', internalId);
    return userModels[index];
}

async function probeProxyPort(port: number): Promise<boolean> {
    return new Promise((resolve) => {
        const socket = new nodeNet.Socket();
        socket.setTimeout(1000); // 1s timeout
        socket.on('connect', () => {
            console.log(`[ModelManager] Probe: Port ${port} is reachable.`);
            socket.destroy();
            resolve(true);
        });
        socket.on('timeout', () => {
            console.error(`[ModelManager] Probe: Port ${port} timeout.`);
            socket.destroy();
            resolve(false);
        });
        socket.on('error', (err) => {
            console.error(`[ModelManager] Probe: Port ${port} error:`, err.message);
            resolve(false);
        });
        socket.connect(port, '127.0.0.1');
    });
}

// Simple HTTP Proxy Agent Implementation (Node.js Native)
function createProxyAgent(proxyHost: string, proxyPort: number): any {
    const agent = new (require('https').Agent)({
        keepAlive: false,
        rejectUnauthorized: false, // Allow self-signed certificates (optional)
    });

    agent.createConnection = (options: any, cb: Function) => {
        const socket = nodeNet.connect(proxyPort, proxyHost);

        const onConnect = () => {
            // After TCP connection established, send HTTP CONNECT request
            const connectHeader = `CONNECT ${options.host}:${options.port} HTTP/1.1\r\n` +
                `Host: ${options.host}:${options.port}\r\n` +
                `Connection: close\r\n\r\n`;
            socket.write(connectHeader);
        };

        const onData = (data: Buffer) => {
            // Simple check: Received HTTP 200 Connection Established
            // Might need to handle packet splitting, but usually one packet on local loopback
            const response = data.toString();
            if (response.includes('200 Connection Established')) {
                // Handshake success, remove HTTP response header, put back remaining data (if any)
                // For CONNECT, usually encrypted stream follows 200, or wait for client ClientHello

                // CRITICAL: Stop listening to data here, so the TLS socket can take over!
                socket.off('data', onData);
                socket.off('connect', onConnect); // Cleanup

                // Upgrade to TLS for HTTPS requests upon successful CONNECT
                const tls = require('tls');
                const tlsSocket = tls.connect({
                    socket: socket,
                    // SNI is critical!
                    servername: options.hostname || (options.host ? options.host.split(':')[0] : undefined),
                    rejectUnauthorized: false
                }, () => {
                    cb(null, tlsSocket);
                });

                tlsSocket.on('error', (err: any) => {
                    cb(err);
                });
            } else {
                cb(new Error(`Proxy CONNECT failed: ${response.split('\r\n')[0]}`));
                socket.destroy();
            }
        };

        socket.on('connect', onConnect);
        socket.on('data', onData);
        socket.on('error', (err) => cb(err));

        // Do NOT return the socket here. We must wait for handshake.
        return undefined;
    };

    return agent;
}

// Helper: Use Node.js native https module to request via proxy
// Alternative to Electron net.fetch, avoids Electron proxy setting issues
async function fetchWithProxy(url: string, options: any, modelConfig: ModelConfig): Promise<any> {
    // If ssNode is configured, consider as needing proxy (TUNNEL mode)
    if (modelConfig.ssNode) {
        try {
            // 1. Start proxy service
            const port = await ssProxyServer.startProxyServer(modelConfig.ssNode);

            // 2. Probe port
            const isReachable = await probeProxyPort(port);
            if (!isReachable) throw new Error(`Proxy server at 127.0.0.1:${port} is unreachable.`);

            // 3. Add Host Rule
            try {
                const hostname = new URL(url).hostname;
                ssProxyServer.addHostRule(hostname, modelConfig.ssNode);
            } catch { }

            console.log(`[ModelManager] NodeFetch: Proxying ${url} via 127.0.0.1:${port}`);

            // 4. Use custom Agent to make request
            return new Promise((resolve, reject) => {
                new URL(url); // Validate URL
                const agent = createProxyAgent('127.0.0.1', port);

                const https = require('https');
                const req = https.request(url, {
                    method: options.method || 'GET',
                    headers: options.headers || {},
                    agent: agent,
                    timeout: 30000 // 30s timeout
                }, (res: any) => {
                    // Simulate fetch Response object
                    const response = {
                        ok: res.statusCode >= 200 && res.statusCode < 300,
                        status: res.statusCode,
                        statusText: res.statusMessage,
                        json: async () => {
                            return new Promise((resolveJson, rejectJson) => {
                                let data = '';
                                res.on('data', (chunk: any) => data += chunk);
                                res.on('end', () => {
                                    try { resolveJson(JSON.parse(data)); }
                                    catch (e) { rejectJson(e); }
                                });
                                res.on('error', rejectJson);
                            });
                        },
                        text: async () => {
                            return new Promise((resolveText, rejectText) => {
                                let data = '';
                                res.on('data', (chunk: any) => data += chunk);
                                res.on('end', () => resolveText(data));
                                res.on('error', rejectText);
                            });
                        }
                    };
                    resolve(response);
                });

                req.on('error', (err: any) => {
                    console.error('[ModelManager] NodeFetch Error:', err);
                    reject(err);
                });

                req.on('timeout', () => {
                    req.destroy();
                    reject(new Error('Request timed out'));
                });

                if (options.body) {
                    req.write(options.body);
                }
                req.end();
            });

        } catch (e: any) {
            console.error('[ModelManager] Proxy fetch failed:', e);
            throw e;
        }
    }

    // Non-proxy mode, use global fetch
    return fetch(url, options);
}

// Test Result Interface
export interface TestResult {
    success: boolean;
    latency: number;      // Latency (ms)
    response?: string;    // AI Response Content
    error?: string;       // Error Message
    protocol: 'openai' | 'anthropic';  // Protocol Used
}

// Test Model - Supports OpenAI and Anthropic protocols
export async function testModel(internalId: string, prompt: string, protocol: 'openai' | 'anthropic' = 'openai'): Promise<TestResult> {
    const models = getModels();
    const model = models.find(m => m.internalId === internalId);

    if (!model) {
        return { success: false, latency: 0, error: 'Model not found', protocol };
    }

    const startTime = Date.now();

    try {
        if (protocol === 'anthropic') {
            // Anthropic Protocol Test
            if (!model.anthropicUrl) {
                return { success: false, latency: 0, error: 'Anthropic URL not configured', protocol };
            }

            // Smart append path
            let url = model.anthropicUrl;
            const originalUrl = url;

            // Check if path exists, append if missing
            if (!url.includes('/messages')) {
                url = url.replace(/\/$/, '') + '/v1/messages';
            }

            const shouldSkip = false; // Deprecated, always false

            // Detailed Debug Info
            console.log('[ModelManager] ========== Anthropic API Request ==========');
            console.log('[ModelManager] Model Name:', model.name);
            console.log('[ModelManager] Internal ID:', model.internalId);
            console.log('[ModelManager] API Model:', model.modelId);
            console.log('[ModelManager] Original URL:', originalUrl);
            console.log('[ModelManager] Skip Path Append:', shouldSkip);
            console.log('[ModelManager] Final URL:', url);
            console.log('[ModelManager] ===============================================');

            // Use different header formats per provider
            const headers: Record<string, string> = {
                'Content-Type': 'application/json'
            };

            // 解密 apiKey（如果已加密）
            const usableKey = decryptApiKey(model.apiKey);
            // Xiaomi Mimo uses Authorization: Bearer format
            if (url.includes('xiaomimimo.com')) {
                headers['Authorization'] = `Bearer ${usableKey}`;
            } else {
                // Standard Anthropic uses x-api-key
                headers['x-api-key'] = usableKey;
                headers['anthropic-version'] = '2023-06-01';
            }

            const response = await fetchWithProxy(url, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    model: model.modelId || '',  // Use user API Model ID
                    max_tokens: 100,
                    messages: [
                        { role: 'user', content: prompt }
                    ]
                })
            }, model);

            const latency = Date.now() - startTime;

            if (!response.ok) {
                const errorText = await response.text();
                // console.error('[ModelManager] Anthropic test failed:', response.status, errorText);
                return { success: false, latency, error: `HTTP ${response.status}: ${errorText}`, protocol };
            }

            const data = await response.json() as any;
            const content = data.content?.[0]?.text || 'No response';

            // Test success, auto save status
            updateModel(internalId, {
                anthropicTested: true,
                anthropicLatency: latency
            });

            console.log('[ModelManager] Anthropic test succeeded:', model.name, latency + 'ms');
            return { success: true, latency, response: content, protocol };

        } else {
            // OpenAI Protocol Test
            if (!model.baseUrl) {
                return { success: false, latency: 0, error: 'OpenAI URL not configured', protocol };
            }

            // Auto append /chat/completions (User added /v1 in frontend)
            let url = model.baseUrl.trim();

            // Only append missing /chat/completions
            if (!url.includes('/chat/completions')) {
                url = url.replace(/\/$/, '') + '/chat/completions';
            }

            // Detailed Debug Info
            console.log('[ModelManager] ========== OpenAI API Request ==========');
            console.log('[ModelManager] Model Name:', model.name);
            console.log('[ModelManager] Internal ID:', model.internalId);
            console.log('[ModelManager] API Model:', model.modelId);


            const requestBody = {
                model: model.modelId || '',  // Use user API Model ID
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 100,
                stream: false,
                temperature: 0.7
            };

            const response = await fetchWithProxy(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${decryptApiKey(model.apiKey)}`
                },
                body: JSON.stringify(requestBody)
            }, model);

            const latency = Date.now() - startTime;

            if (!response.ok) {
                const errorText = await response.text();
                // console.error('[ModelManager] OpenAI test failed:', response.status, errorText);
                return { success: false, latency, error: `HTTP ${response.status}: ${errorText}`, protocol };
            }

            const data = await response.json() as any;
            const content = data.choices?.[0]?.message?.content || 'No response';

            // Test success, auto save status
            updateModel(internalId, {
                openaiTested: true,
                openaiLatency: latency
            });

            console.log('[ModelManager] OpenAI test succeeded:', model.name, latency + 'ms');
            return { success: true, latency, response: content, protocol };
        }

    } catch (error) {
        // Network/Proxy error -> -1 latency
        console.error('[ModelManager] Test error:', error);
        return { success: false, latency: -1, error: String(error), protocol };
    }
}

// Simple ping model server - Test reachability only, no API request
export interface PingResult {
    success: boolean;
    latency: number;
    url: string;
    error?: string;
}

export async function pingModel(internalId: string): Promise<PingResult> {
    const models = getModels();
    const model = models.find(m => m.internalId === internalId);

    if (!model) {
        return { success: false, latency: 0, url: '', error: 'Model not found' };
    }

    // Prioritize OpenAI URL, then Anthropic URL
    const url = model.baseUrl || model.anthropicUrl;
    if (!url) {
        return { success: false, latency: 0, url: '', error: 'No URL configured' };
    }

    // Extract base domain (keep protocol + hostname, remove path)
    // E.g.: https://api.xiaomimimo.com/v1 -> https://api.xiaomimimo.com
    let baseUrl: string;
    try {
        const urlObj = new URL(url);
        baseUrl = `${urlObj.protocol}//${urlObj.host}`;
    } catch {
        // If URL parse fails, use original URL
        baseUrl = url;
    }

    const startTime = Date.now();

    try {
        // Use HEAD request to test server reachability
        // Ping also via proxy
        await fetchWithProxy(baseUrl, {
            method: 'HEAD',
            signal: AbortSignal.timeout(5000) // 5s timeout
        }, model);

        const latency = Date.now() - startTime;

        // Save latency to model config (use openaiLatency field)
        updateModel(internalId, { openaiLatency: latency });

        console.log('[ModelManager] Ping succeeded:', model.name, latency + 'ms');
        return { success: true, latency, url };
    } catch (error) {
        // Network/Proxy error -> -1 latency
        console.error('[ModelManager] Ping error:', error);
        return { success: false, latency: -1, url, error: String(error) };
    }
}

// 切换单个模型的 API Key 加密状态（用户点击锁图标时调用）
export function toggleKeyEncryption(internalId: string): { success: boolean; apiKey: string; encrypted: boolean } {
    const userModels = getUserModels();
    const index = userModels.findIndex(m => m.internalId === internalId);
    if (index === -1) {
        return { success: false, apiKey: '', encrypted: false };
    }

    const currentKey = userModels[index].apiKey;

    // 跳过空 key 和 local
    if (!currentKey || currentKey === 'local') {
        return { success: false, apiKey: currentKey, encrypted: false };
    }

    let newKey: string;
    let encrypted: boolean;

    if (currentKey.startsWith(ENCRYPTED_PREFIX)) {
        // 当前已加密 → 解密
        newKey = decryptApiKey(currentKey);
        if (!newKey) {
            // 解密失败（重装后），清空 key
            console.error('[ModelManager] 解密失败，清空 key，请用户重新填写');
            newKey = '';
        }
        encrypted = false;
    } else {
        // 当前明文 → 加密
        newKey = encryptApiKey(currentKey);
        encrypted = newKey.startsWith(ENCRYPTED_PREFIX);
    }

    userModels[index].apiKey = newKey;
    const configPath = getModelsConfigPath();
    fs.writeFileSync(configPath, JSON.stringify(userModels, null, 2));
    console.log('[ModelManager] Key encryption toggled for:', userModels[index].name, '->', encrypted ? 'encrypted' : 'plaintext');

    return { success: true, apiKey: newKey, encrypted };
}

// 检测加密密钥是否已自毁（解密失败 = 环境已变更）
export function isKeyDestroyed(internalId: string): boolean {
    const models = getRawUserModels();
    const model = models.find(m => m.internalId === internalId);
    if (!model || !model.apiKey?.startsWith(ENCRYPTED_PREFIX)) return false;
    const decrypted = decryptApiKey(model.apiKey);
    return !decrypted; // 解密返回空 = 已自毁
}
