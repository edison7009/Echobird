import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';
import { ModelInfo } from '../types';

// ============================================================
// Codex Responses→Chat Completions 代理（"诈骗方案"）
// 本地代理接收 /v1/responses 请求，转换为 /chat/completions 发给第三方 API，
// 再把响应伪装成 Responses 格式返回。两边都被"骗"了。
// ============================================================

let proxyServer: http.Server | null = null;
let proxyPort: number = 0;
let targetBaseUrl: string = '';
let targetApiKey: string = '';

/** 把 input 字段解析为 messages 数组 */
function parseInputToMessages(input: any): { role: string; content: string }[] {
    const messages: { role: string; content: string }[] = [];
    if (typeof input === 'string') {
        messages.push({ role: 'user', content: input });
    } else if (Array.isArray(input)) {
        for (const item of input) {
            if (typeof item === 'string') {
                messages.push({ role: 'user', content: item });
                continue;
            }
            if (item.type === 'message') {
                let role = item.role || 'user';
                // OpenAI 用 'developer' 角色代替 'system'，第三方 API 不认，需映射
                if (role === 'developer') role = 'system';
                let text = '';
                if (typeof item.content === 'string') {
                    text = item.content;
                } else if (Array.isArray(item.content)) {
                    text = item.content.map((part: any) => {
                        if (part.type === 'input_text' || part.type === 'output_text' || part.type === 'text') return part.text || '';
                        return '';
                    }).join('');
                }
                if (text) messages.push({ role, content: text });
            } else if (item.type === 'function_call_output') {
                messages.push({ role: 'user', content: `[Tool Result: ${item.call_id || 'unknown'}]\n${item.output || ''}` });
            }
        }
    }
    return messages;
}

/** Responses 请求 → Chat Completions 请求 */
function responsesToChatCompletions(body: any): any {
    const rawMessages: { role: string; content: string }[] = [];
    if (body.instructions) rawMessages.push({ role: 'system', content: body.instructions });
    rawMessages.push(...parseInputToMessages(body.input));
    if (rawMessages.length === 0) rawMessages.push({ role: 'user', content: '' });

    // 兼容性处理：某些 API（如 MiniMax）不支持 system 角色
    // 把 system 消息内容作为前缀合并到下一条 user 消息中
    const messages: { role: string; content: string }[] = [];
    let pendingSystem = '';
    for (const msg of rawMessages) {
        if (msg.role === 'system') {
            pendingSystem += (pendingSystem ? '\n' : '') + msg.content;
        } else {
            if (pendingSystem && msg.role === 'user') {
                msg.content = `[System Instructions]\n${pendingSystem}\n\n${msg.content}`;
                pendingSystem = '';
            }
            messages.push(msg);
        }
    }
    // 如果还有剩余的 system 内容没合并（比如只有 system 没有 user）
    if (pendingSystem) {
        messages.unshift({ role: 'user', content: `[System Instructions]\n${pendingSystem}` });
    }
    if (messages.length === 0) messages.push({ role: 'user', content: '' });

    const result: any = { model: body.model, messages, stream: body.stream ?? false };
    if (body.temperature !== undefined) result.temperature = body.temperature;
    if (body.max_output_tokens !== undefined) result.max_tokens = body.max_output_tokens;
    if (body.top_p !== undefined) result.top_p = body.top_p;
    if (result.stream) result.stream_options = { include_usage: true };
    return result;
}

/** Chat Completions 非流式响应 → Responses 响应 */
function chatCompletionsToResponses(data: any, model: string): any {
    const content = data.choices?.[0]?.message?.content || '';
    const respId = 'resp_' + Date.now().toString(36);
    const msgId = 'msg_' + Date.now().toString(36);
    return {
        id: respId, object: 'response', created_at: Math.floor(Date.now() / 1000),
        status: 'completed', model,
        output: [{ type: 'message', id: msgId, role: 'assistant', content: [{ type: 'output_text', text: content }], status: 'completed' }],
        usage: { input_tokens: data.usage?.prompt_tokens || 0, output_tokens: data.usage?.completion_tokens || 0, total_tokens: data.usage?.total_tokens || 0 },
        text: { format: { type: 'text' } },
    };
}

/** 发送 SSE 事件 */
function sendSSE(res: http.ServerResponse, event: string, data: any) {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/** 流式转换：Chat Completions SSE → Responses SSE */
function pipeStreamChatToResponses(upstreamRes: http.IncomingMessage, clientRes: http.ServerResponse, model: string) {
    clientRes.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
    const respId = 'resp_' + Date.now().toString(36);
    const msgId = 'msg_' + Date.now().toString(36);

    sendSSE(clientRes, 'response.created', { type: 'response.created', response: { id: respId, object: 'response', status: 'in_progress', model, output: [], usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 } } });
    sendSSE(clientRes, 'response.in_progress', { type: 'response.in_progress', response: { id: respId, object: 'response', status: 'in_progress', model, output: [] } });
    sendSSE(clientRes, 'response.output_item.added', { type: 'response.output_item.added', output_index: 0, item: { type: 'message', id: msgId, role: 'assistant', content: [], status: 'in_progress' } });
    sendSSE(clientRes, 'response.content_part.added', { type: 'response.content_part.added', output_index: 0, content_index: 0, part: { type: 'output_text', text: '' } });

    let buffer = '';
    let fullText = '';
    let usage: any = null;

    upstreamRes.on('data', (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data: ')) continue;
            const jsonStr = trimmed.slice(6);
            if (jsonStr === '[DONE]') continue;
            try {
                const c = JSON.parse(jsonStr);
                if (c.choices?.[0]?.delta?.content) {
                    fullText += c.choices[0].delta.content;
                    sendSSE(clientRes, 'response.output_text.delta', { type: 'response.output_text.delta', output_index: 0, content_index: 0, delta: c.choices[0].delta.content });
                }
                if (c.usage) usage = { input_tokens: c.usage.prompt_tokens || 0, output_tokens: c.usage.completion_tokens || 0, total_tokens: c.usage.total_tokens || 0 };
            } catch { /* 忽略 */ }
        }
    });

    upstreamRes.on('end', () => {
        if (!usage) usage = { input_tokens: 0, output_tokens: 0, total_tokens: 0 };
        sendSSE(clientRes, 'response.output_text.done', { type: 'response.output_text.done', output_index: 0, content_index: 0, text: fullText });
        sendSSE(clientRes, 'response.content_part.done', { type: 'response.content_part.done', output_index: 0, content_index: 0, part: { type: 'output_text', text: fullText } });
        sendSSE(clientRes, 'response.output_item.done', { type: 'response.output_item.done', output_index: 0, item: { type: 'message', id: msgId, role: 'assistant', content: [{ type: 'output_text', text: fullText }], status: 'completed' } });
        sendSSE(clientRes, 'response.completed', { type: 'response.completed', response: { id: respId, object: 'response', status: 'completed', model, output: [{ type: 'message', id: msgId, role: 'assistant', content: [{ type: 'output_text', text: fullText }], status: 'completed' }], usage } });
        clientRes.end();
    });

    upstreamRes.on('error', (err) => { console.error('[CodexProxy] Upstream stream error:', err.message); clientRes.end(); });
}

/** 转发请求到真实 API */
function forwardToChatCompletions(chatBody: any, onResponse: (res: http.IncomingMessage) => void, onError: (err: Error) => void) {
    const postData = JSON.stringify(chatBody);
    const parsedUrl = new URL(targetBaseUrl);
    const isHttps = parsedUrl.protocol === 'https:';
    const httpModule = isHttps ? https : http;
    const requestPath = parsedUrl.pathname.replace(/\/+$/, '') + '/chat/completions';
    const req = httpModule.request({
        hostname: parsedUrl.hostname, port: parsedUrl.port || (isHttps ? 443 : 80),
        path: requestPath, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData), 'Authorization': `Bearer ${targetApiKey}` },
    }, onResponse);
    req.on('error', onError);
    req.write(postData);
    req.end();
}

/** 处理 /v1/responses 请求 */
function handleResponsesRequest(req: http.IncomingMessage, res: http.ServerResponse) {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
        try {
            const responsesReq = JSON.parse(body);
            const isStream = responsesReq.stream ?? false;
            const model = responsesReq.model || 'unknown';
            const chatReq = responsesToChatCompletions(responsesReq);
            console.log(`[CodexProxy] Responses -> Chat: model=${model}, stream=${isStream}, messages=${chatReq.messages.length}`);
            forwardToChatCompletions(chatReq, (upstreamRes) => {
                const statusCode = upstreamRes.statusCode || 0;
                console.log(`[CodexProxy] Upstream responded: status=${statusCode}`);

                // 上游返回非 200 → 读取错误正文，直接返回给 Codex
                if (statusCode !== 200) {
                    let errBody = '';
                    upstreamRes.on('data', (chunk) => { errBody += chunk; });
                    upstreamRes.on('end', () => {
                        console.error(`[CodexProxy] Upstream error (${statusCode}): ${errBody.substring(0, 500)}`);
                        res.writeHead(statusCode, { 'Content-Type': 'application/json' });
                        res.end(errBody);
                    });
                    return;
                }

                if (isStream) {
                    pipeStreamChatToResponses(upstreamRes, res, model);
                } else {
                    let resBody = '';
                    upstreamRes.on('data', (chunk) => { resBody += chunk; });
                    upstreamRes.on('end', () => {
                        try {
                            const responsesData = chatCompletionsToResponses(JSON.parse(resBody), model);
                            res.writeHead(200, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify(responsesData));
                        } catch (e: any) {
                            console.error('[CodexProxy] Response parse error:', e.message);
                            res.writeHead(500, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ error: { message: e.message } }));
                        }
                    });
                }
            }, (err) => {
                console.error('[CodexProxy] Forward failed:', err.message);
                res.writeHead(502, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: { message: 'Upstream unreachable: ' + err.message } }));
            });
        } catch (err: any) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: { message: err.message } }));
        }
    });
}

/** 启动诈骗代理 */
function startCodexProxy(baseUrl: string, apiKey: string): Promise<number> {
    return new Promise((resolve, reject) => {
        stopCodexProxy();
        targetBaseUrl = baseUrl.replace(/\/+$/, '');
        targetApiKey = apiKey;
        const server = http.createServer((req, res) => {
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', '*');
            if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
            const url = req.url || '';
            if (url.includes('/responses')) { handleResponsesRequest(req, res); return; }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'ok', proxy: 'whichclaw-codex-proxy' }));
        });
        server.listen(0, '127.0.0.1', () => {
            const addr = server.address();
            if (addr && typeof addr === 'object') {
                proxyPort = addr.port; proxyServer = server;
                console.log(`[CodexProxy] Proxy started: http://127.0.0.1:${proxyPort}`);
                console.log(`[CodexProxy] Target API: ${targetBaseUrl}`);
                resolve(proxyPort);
            } else { reject(new Error('Failed to get proxy port')); }
        });
        server.on('error', (err) => { reject(err); });
    });
}

/** 停止诈骗代理 */
function stopCodexProxy() {
    if (proxyServer) { proxyServer.close(); proxyServer = null; proxyPort = 0; console.log('[CodexProxy] Proxy stopped'); }
}


/**
 * Codex CLI Model Module (Patch Injection)
 * 
 * 配置分两部分：
 * 1. ~/.whichclaw/codex.json — 存储 API Key（补丁读取后注入环境变量）
 * 2. ~/.codex/config.toml — 存储 model/provider 配置（Codex 原生读取）
 * 
 * 补丁脚本注入到 codex.js 启动器，在 spawn codex.exe 前设置 OPENAI_API_KEY。
 */

const WHICHCLAW_DIR = path.join(os.homedir(), '.whichclaw');
const WC_CODEX_CONFIG = path.join(WHICHCLAW_DIR, 'codex.json');
// 补丁标记
const PATCH_MARKER = '[WhichClaw-Codex-Patched]';

// 从 URL 提取域名作为 provider 名
function extractDomainName(url: string): string {
    try {
        const hostname = new URL(url).hostname;
        const parts = hostname.split('.');
        if (parts.length >= 2) {
            return parts[parts.length - 2];
        }
        return hostname;
    } catch {
        return 'whichclaw';
    }
}

// 简易 TOML 解析器（只处理我们需要的结构）
function parseSimpleToml(content: string): Record<string, any> {
    const result: Record<string, any> = {};
    let currentSection = '';

    for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        // 匹配 section header: [xxx] 或 [xxx.yyy]
        const sectionMatch = trimmed.match(/^\[(.+)\]$/);
        if (sectionMatch) {
            currentSection = sectionMatch[1];
            const parts = currentSection.split('.');
            let obj = result;
            for (const part of parts) {
                if (!obj[part]) obj[part] = {};
                obj = obj[part];
            }
            continue;
        }

        // 匹配 key = value
        const kvMatch = trimmed.match(/^(\S+)\s*=\s*(.+)$/);
        if (kvMatch) {
            const key = kvMatch[1];
            let value: any = kvMatch[2].trim();

            if (value === 'true') value = true;
            else if (value === 'false') value = false;
            else if (/^\d+$/.test(value)) value = parseInt(value, 10);
            else if (value.startsWith('"') && value.endsWith('"')) {
                value = value.slice(1, -1);
            }

            if (currentSection) {
                const parts = currentSection.split('.');
                let obj = result;
                for (const part of parts) {
                    if (!obj[part]) obj[part] = {};
                    obj = obj[part];
                }
                obj[key] = value;
            } else {
                result[key] = value;
            }
        }
    }

    return result;
}

function formatTomlValue(value: any): string {
    if (typeof value === 'string') return `"${value}"`;
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'number') return String(value);
    return `"${String(value)}"`;
}

// 生成 TOML 字符串
function generateToml(
    providerName: string,
    providerConfig: Record<string, any>,
    profileName: string,
    profileConfig: Record<string, any>,
    topLevel: Record<string, any>
): string {
    const lines: string[] = [];

    for (const [key, value] of Object.entries(topLevel)) {
        lines.push(`${key} = ${formatTomlValue(value)}`);
    }

    lines.push('');

    lines.push(`[model_providers.${providerName}]`);
    for (const [key, value] of Object.entries(providerConfig)) {
        lines.push(`${key} = ${formatTomlValue(value)}`);
    }

    lines.push('');

    lines.push(`[profiles.${profileName}]`);
    for (const [key, value] of Object.entries(profileConfig)) {
        lines.push(`${key} = ${formatTomlValue(value)}`);
    }

    lines.push('');
    return lines.join('\n');
}

/**
 * 确保 WhichClaw 配置目录存在
 */
function ensureConfigDir(): void {
    if (!fs.existsSync(WHICHCLAW_DIR)) {
        fs.mkdirSync(WHICHCLAW_DIR, { recursive: true });
    }
}

/**
 * 写入 WhichClaw Codex 配置（API Key）
 */
function writeWcConfig(apiKey: string): boolean {
    try {
        ensureConfigDir();
        const config = { apiKey };
        fs.writeFileSync(WC_CODEX_CONFIG, JSON.stringify(config, null, 2), 'utf-8');
        console.log(`[Codex] API Key written to ${WC_CODEX_CONFIG}`);
        return true;
    } catch (e: any) {
        console.error('[Codex] Failed to write WhichClaw config:', e.message);
        return false;
    }
}

/**
 * 查找 Codex 全局安装的入口文件
 */
function findCodexEntry(): string | null {
    const candidates = [
        // npm root -g
        (() => {
            try {
                const npmRoot = execSync('npm root -g', { encoding: 'utf-8', timeout: 5000 }).trim();
                return path.join(npmRoot, '@openai', 'codex', 'bin', 'codex.js');
            } catch { return null; }
        })(),
        // 已知路径
        path.join(process.env.APPDATA || '', 'npm', 'node_modules', '@openai', 'codex', 'bin', 'codex.js'),
        path.join(os.homedir(), '.npm-global', 'lib', 'node_modules', '@openai', 'codex', 'bin', 'codex.js'),
    ].filter(Boolean) as string[];

    for (const entry of candidates) {
        if (fs.existsSync(entry)) return entry;
    }
    return null;
}

/**
 * 检测 Codex 入口是否已打补丁，未打则自动执行补丁脚本
 */
function ensurePatch(): { patched: boolean; message: string } {
    try {
        const entryPath = findCodexEntry();
        if (!entryPath) {
            return { patched: false, message: 'Codex installation not found' };
        }

        // 检查是否已有补丁标记
        const content = fs.readFileSync(entryPath, 'utf-8');
        if (content.includes(PATCH_MARKER)) {
            return { patched: true, message: 'Patch already applied' };
        }

        // 补丁缺失，自动执行补丁脚本
        const patchScript = path.join(__dirname, 'patch-codex.cjs');
        if (!fs.existsSync(patchScript)) {
            return { patched: false, message: 'Patch script not found' };
        }

        console.log('[Codex] Patch missing, auto-patching...');
        execSync(`node "${patchScript}"`, { timeout: 15000 });
        console.log('[Codex] Auto-patch complete');
        return { patched: true, message: 'Auto-patched successfully' };
    } catch (e: any) {
        console.error('[Codex] Auto-patch failed:', e.message);
        return { patched: false, message: `Auto-patch failed: ${e.message}` };
    }
}

export async function getCurrentModelInfo(
    readConfig: () => Promise<any>
): Promise<ModelInfo | null> {
    try {
        // 直接读取 TOML 文件
        const configFile = path.join(os.homedir(), '.codex', 'config.toml');
        if (!fs.existsSync(configFile)) return null;

        const content = fs.readFileSync(configFile, 'utf-8');
        const config = parseSimpleToml(content);

        const model = config.model;
        const providerName = config.model_provider;

        if (!model) return null;

        let baseUrl = '';
        if (providerName && config.model_providers && config.model_providers[providerName]) {
            baseUrl = config.model_providers[providerName].base_url || '';
        }

        return {
            id: providerName ? `${providerName}/${model}` : model,
            name: model,
            model: model,
            baseUrl: baseUrl,
            apiKey: '',  // Codex 用环境变量，不在配置文件中显示
        };
    } catch (e: any) {
        console.error('[Codex] Failed to read model info:', e.message);
        return null;
    }
}

export async function applyConfig(
    modelInfo: ModelInfo,
    readConfig: () => Promise<any>,
    writeConfig: (config: any) => Promise<boolean>,
    getConfigFile: () => string
): Promise<{ success: boolean; message: string }> {
    try {
        // 1. 写入 API Key 到 ~/.whichclaw/codex.json（补丁读取）
        if (modelInfo.apiKey) {
            writeWcConfig(modelInfo.apiKey);
        }

        // 2. 判断是否需要启动代理（非 OpenAI 官方 = 需要代理）
        let baseUrl = modelInfo.baseUrl || 'https://api.openai.com/v1';
        if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);

        const isOpenAI = baseUrl.includes('api.openai.com');
        let actualBaseUrl = baseUrl; // 写入 config.toml 的 base_url
        let proxyNote = '';

        if (!isOpenAI) {
            // 非 OpenAI → 启动诈骗代理
            try {
                const proxyPort = await startCodexProxy(baseUrl, modelInfo.apiKey || '');
                actualBaseUrl = `http://127.0.0.1:${proxyPort}/v1`;
                proxyNote = ` [Proxy: :${proxyPort}]`;
                console.log(`[Codex] Proxy started: ${actualBaseUrl} -> ${baseUrl}`);
            } catch (proxyErr: any) {
                console.error('[Codex] Proxy start failed:', proxyErr.message);
                return { success: false, message: `Proxy start failed: ${proxyErr.message}` };
            }
        } else {
            // OpenAI 官方 → 直连，停止旧代理
            stopCodexProxy();
        }

        // 3. 写入 model/provider 配置到 ~/.codex/config.toml
        const providerName = isOpenAI ? 'openai' : extractDomainName(baseUrl);
        const profileName = 'whichclaw';

        // model 字段：优先用 modelId（云端），fallback 到 name（本地模型）
        const modelName = modelInfo.model || modelInfo.name || 'unknown';

        const tomlContent = generateToml(
            providerName,
            {
                name: `${providerName} (via WhichClaw)`,
                base_url: actualBaseUrl,
                env_key: 'OPENAI_API_KEY',
                wire_api: 'responses',
                requires_openai_auth: false,
            },
            profileName,
            {
                model: modelName,
                model_provider: providerName,
            },
            {
                model: modelName,
                model_provider: providerName,
                profile: profileName,
            }
        );

        const configFile = getConfigFile();
        const configDir = path.dirname(configFile);

        if (!fs.existsSync(configDir)) {
            fs.mkdirSync(configDir, { recursive: true });
        }

        fs.writeFileSync(configFile, tomlContent, 'utf-8');

        // 4. 自动检测并应用补丁
        const patchResult = ensurePatch();
        const patchNote = patchResult.patched
            ? ''
            : ` (Warning: ${patchResult.message})`;

        return {
            success: true,
            message: `Codex updated: provider=${providerName}, model=${modelInfo.model}.${proxyNote} Restart Codex to apply.${patchNote}`
        };
    } catch (e: any) {
        return { success: false, message: `Codex config error: ${e.message}` };
    }
}
