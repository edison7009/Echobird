/**
 * Codex Responses API → Chat Completions 代理（"诈骗方案"）
 * 
 * 本地代理服务器，接收 Codex 发来的 /v1/responses 请求，
 * 转换为 /v1/chat/completions 格式发给第三方 API，
 * 再把响应伪装成 Responses API 格式返回给 Codex。
 * 
 * Codex 以为在跟 OpenAI 对话，第三方 API 以为收到了标准请求。
 * 两边都被"骗"了，只有 WhichClaw 知道真相。
 */

import http from 'http';
import https from 'https';
import { URL } from 'url';

// 代理实例
let proxyServer: http.Server | null = null;
let proxyPort: number = 0;

// 目标 API 信息（真正的第三方 API）
let targetBaseUrl: string = '';
let targetApiKey: string = '';

// ============================================================
// 请求转换：Responses API → Chat Completions
// ============================================================

/**
 * 把 Responses API 的 input 字段解析为 Chat Completions 的 messages 数组
 */
function parseInputToMessages(input: any): { role: string; content: string }[] {
    const messages: { role: string; content: string }[] = [];

    if (typeof input === 'string') {
        // input 是纯字符串 → 单条 user 消息
        messages.push({ role: 'user', content: input });
    } else if (Array.isArray(input)) {
        // input 是数组 → 遍历每个 item
        for (const item of input) {
            if (typeof item === 'string') {
                messages.push({ role: 'user', content: item });
                continue;
            }
            if (item.type === 'message') {
                // 消息类型：提取 role 和文字内容
                const role = item.role || 'user';
                let text = '';
                if (typeof item.content === 'string') {
                    text = item.content;
                } else if (Array.isArray(item.content)) {
                    // content 是 content part 数组
                    text = item.content
                        .map((part: any) => {
                            if (part.type === 'input_text' || part.type === 'output_text') {
                                return part.text || '';
                            }
                            if (part.type === 'text') {
                                return part.text || '';
                            }
                            return '';
                        })
                        .join('');
                }
                if (text) {
                    messages.push({ role, content: text });
                }
            } else if (item.type === 'function_call_output') {
                // 工具调用结果 → 作为 assistant 的上下文
                messages.push({
                    role: 'user',
                    content: `[Tool Result: ${item.call_id || 'unknown'}]\n${item.output || ''}`
                });
            }
        }
    }

    return messages;
}

/**
 * Responses API 请求体 → Chat Completions 请求体
 */
function responsesToChatCompletions(body: any): any {
    const messages: { role: string; content: string }[] = [];

    // instructions → system 消息
    if (body.instructions) {
        messages.push({ role: 'system', content: body.instructions });
    }

    // input → user/assistant 消息
    const inputMessages = parseInputToMessages(body.input);
    messages.push(...inputMessages);

    // 如果没有任何消息，添加一个空的 user 消息防止报错
    if (messages.length === 0) {
        messages.push({ role: 'user', content: '' });
    }

    const result: any = {
        model: body.model,
        messages,
        stream: body.stream ?? false,
    };

    // 映射可选参数
    if (body.temperature !== undefined) result.temperature = body.temperature;
    if (body.max_output_tokens !== undefined) result.max_tokens = body.max_output_tokens;
    if (body.top_p !== undefined) result.top_p = body.top_p;

    // 流式需要 stream_options 来获取 usage
    if (result.stream) {
        result.stream_options = { include_usage: true };
    }

    return result;
}

// ============================================================
// 响应转换：Chat Completions → Responses API
// ============================================================

/**
 * Chat Completions 非流式响应 → Responses API 响应
 */
function chatCompletionsToResponses(data: any, model: string): any {
    const choice = data.choices?.[0];
    const content = choice?.message?.content || '';
    const respId = 'resp_' + Date.now().toString(36);
    const msgId = 'msg_' + Date.now().toString(36);

    return {
        id: respId,
        object: 'response',
        created_at: Math.floor(Date.now() / 1000),
        status: 'completed',
        model: model,
        output: [
            {
                type: 'message',
                id: msgId,
                role: 'assistant',
                content: [{ type: 'output_text', text: content }],
                status: 'completed',
            }
        ],
        usage: {
            input_tokens: data.usage?.prompt_tokens || 0,
            output_tokens: data.usage?.completion_tokens || 0,
            total_tokens: data.usage?.total_tokens || 0,
        },
        text: { format: { type: 'text' } },
    };
}

// ============================================================
// 流式转换：Chat Completions SSE → Responses SSE
// ============================================================

/**
 * 把 Chat Completions 的 SSE 流转换为 Responses API 的 SSE 流
 */
function pipeStreamChatToResponses(
    upstreamRes: http.IncomingMessage,
    clientRes: http.ServerResponse,
    model: string
) {
    clientRes.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
    });

    const respId = 'resp_' + Date.now().toString(36);
    const msgId = 'msg_' + Date.now().toString(36);

    // 1. response.created
    sendSSE(clientRes, 'response.created', {
        type: 'response.created',
        response: {
            id: respId,
            object: 'response',
            status: 'in_progress',
            model,
            output: [],
            usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
        }
    });

    // 2. response.in_progress
    sendSSE(clientRes, 'response.in_progress', {
        type: 'response.in_progress',
        response: { id: respId, object: 'response', status: 'in_progress', model, output: [] },
    });

    // 3. output_item.added
    sendSSE(clientRes, 'response.output_item.added', {
        type: 'response.output_item.added',
        output_index: 0,
        item: {
            type: 'message', id: msgId, role: 'assistant',
            content: [], status: 'in_progress',
        }
    });

    // 4. content_part.added
    sendSSE(clientRes, 'response.content_part.added', {
        type: 'response.content_part.added',
        output_index: 0,
        content_index: 0,
        part: { type: 'output_text', text: '' },
    });

    // 解析上游 SSE 流
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
                const delta = c.choices?.[0]?.delta;

                // 文字增量
                if (delta?.content) {
                    fullText += delta.content;
                    sendSSE(clientRes, 'response.output_text.delta', {
                        type: 'response.output_text.delta',
                        output_index: 0,
                        content_index: 0,
                        delta: delta.content,
                    });
                }

                // usage 信息（通常在最后一个 chunk）
                if (c.usage) {
                    usage = {
                        input_tokens: c.usage.prompt_tokens || 0,
                        output_tokens: c.usage.completion_tokens || 0,
                        total_tokens: c.usage.total_tokens || 0,
                    };
                }
            } catch { /* 忽略解析失败 */ }
        }
    });

    upstreamRes.on('end', () => {
        if (!usage) {
            usage = { input_tokens: 0, output_tokens: 0, total_tokens: 0 };
        }

        // 5. output_text.done
        sendSSE(clientRes, 'response.output_text.done', {
            type: 'response.output_text.done',
            output_index: 0,
            content_index: 0,
            text: fullText,
        });

        // 6. content_part.done
        sendSSE(clientRes, 'response.content_part.done', {
            type: 'response.content_part.done',
            output_index: 0,
            content_index: 0,
            part: { type: 'output_text', text: fullText },
        });

        // 7. output_item.done
        sendSSE(clientRes, 'response.output_item.done', {
            type: 'response.output_item.done',
            output_index: 0,
            item: {
                type: 'message', id: msgId, role: 'assistant',
                content: [{ type: 'output_text', text: fullText }],
                status: 'completed',
            }
        });

        // 8. response.completed
        sendSSE(clientRes, 'response.completed', {
            type: 'response.completed',
            response: {
                id: respId,
                object: 'response',
                status: 'completed',
                model,
                output: [{
                    type: 'message', id: msgId, role: 'assistant',
                    content: [{ type: 'output_text', text: fullText }],
                    status: 'completed',
                }],
                usage,
            }
        });

        clientRes.end();
    });

    upstreamRes.on('error', (err) => {
        console.error('[CodexProxy] 上游流错误:', err.message);
        clientRes.end();
    });
}

/** 发送一个 SSE 事件 */
function sendSSE(res: http.ServerResponse, event: string, data: any) {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

// ============================================================
// HTTP 转发（支持 HTTPS 上游）
// ============================================================

/**
 * 向真实第三方 API 转发 Chat Completions 请求
 */
function forwardToChatCompletions(
    chatBody: any,
    onResponse: (res: http.IncomingMessage) => void,
    onError: (err: Error) => void
) {
    const postData = JSON.stringify(chatBody);
    const parsedUrl = new URL(targetBaseUrl);
    const isHttps = parsedUrl.protocol === 'https:';
    const httpModule = isHttps ? https : http;

    // 构建请求路径
    let basePath = parsedUrl.pathname.replace(/\/+$/, '');
    const requestPath = basePath + '/chat/completions';

    const options: http.RequestOptions = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: requestPath,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData),
            'Authorization': `Bearer ${targetApiKey}`,
        },
    };

    const req = httpModule.request(options, onResponse);
    req.on('error', onError);
    req.write(postData);
    req.end();
}

// ============================================================
// 代理服务器管理
// ============================================================

/**
 * 处理 /v1/responses 请求
 */
function handleResponsesRequest(req: http.IncomingMessage, res: http.ServerResponse) {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
        try {
            const responsesReq = JSON.parse(body);
            const isStream = responsesReq.stream ?? false;
            const model = responsesReq.model || 'unknown';

            // 转换请求格式
            const chatReq = responsesToChatCompletions(responsesReq);

            console.log(`[CodexProxy] Responses → Chat: model=${model}, stream=${isStream}, messages=${chatReq.messages.length}`);

            forwardToChatCompletions(
                chatReq,
                (upstreamRes) => {
                    if (isStream) {
                        // 流式：SSE 格式转换
                        pipeStreamChatToResponses(upstreamRes, res, model);
                    } else {
                        // 非流式：收集完整响应再转换
                        let resBody = '';
                        upstreamRes.on('data', (chunk) => { resBody += chunk; });
                        upstreamRes.on('end', () => {
                            try {
                                const statusCode = upstreamRes.statusCode || 200;
                                if (statusCode !== 200) {
                                    console.error(`[CodexProxy] 上游返回错误: ${statusCode}`);
                                    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
                                    res.end(resBody);
                                    return;
                                }
                                const chatData = JSON.parse(resBody);
                                const responsesData = chatCompletionsToResponses(chatData, model);
                                res.writeHead(200, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify(responsesData));
                            } catch (e: any) {
                                console.error('[CodexProxy] 响应解析失败:', e.message);
                                res.writeHead(500, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({ error: { message: e.message } }));
                            }
                        });
                    }
                },
                (err) => {
                    console.error('[CodexProxy] 转发失败:', err.message);
                    res.writeHead(502, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: { message: 'Upstream unreachable: ' + err.message } }));
                }
            );
        } catch (err: any) {
            console.error('[CodexProxy] 请求解析失败:', err.message);
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: { message: err.message } }));
        }
    });
}

/**
 * 启动 Codex 代理服务器
 * @returns 代理监听端口
 */
export function startCodexProxy(baseUrl: string, apiKey: string): Promise<number> {
    return new Promise((resolve, reject) => {
        // 如果已有代理在运行，先停止
        stopCodexProxy();

        targetBaseUrl = baseUrl.replace(/\/+$/, '');
        targetApiKey = apiKey;

        const server = http.createServer((req, res) => {
            // CORS
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', '*');

            if (req.method === 'OPTIONS') {
                res.writeHead(204);
                res.end();
                return;
            }

            const url = req.url || '';

            // /v1/responses → 核心转换逻辑
            if (url.includes('/responses')) {
                handleResponsesRequest(req, res);
                return;
            }

            // 其他路径直接返回 200（健康检查等）
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'ok', proxy: 'whichclaw-codex-proxy' }));
        });

        // 动态分配端口（端口 0 = 系统自动选）
        server.listen(0, '127.0.0.1', () => {
            const addr = server.address();
            if (addr && typeof addr === 'object') {
                proxyPort = addr.port;
                proxyServer = server;
                console.log(`[CodexProxy] 诈骗代理已启动: http://127.0.0.1:${proxyPort}`);
                console.log(`[CodexProxy] 目标 API: ${targetBaseUrl}`);
                resolve(proxyPort);
            } else {
                reject(new Error('Failed to get proxy port'));
            }
        });

        server.on('error', (err) => {
            console.error('[CodexProxy] 代理启动失败:', err);
            reject(err);
        });
    });
}

/**
 * 停止 Codex 代理服务器
 */
export function stopCodexProxy() {
    if (proxyServer) {
        proxyServer.close();
        proxyServer = null;
        proxyPort = 0;
        console.log('[CodexProxy] 诈骗代理已停止');
    }
}

/**
 * 获取代理信息
 */
export function getCodexProxyInfo(): { running: boolean; port: number } {
    return { running: !!proxyServer, port: proxyPort };
}
