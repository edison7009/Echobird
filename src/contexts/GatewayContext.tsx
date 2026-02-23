// GatewayContext — Global multi-connection OpenClaw Gateway manager
// Each channel has its own WebSocket connection, lifecycle follows App
import { createContext, useContext, useCallback, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';

// ─── Types ───────────────────────────────────────────────────
export interface GatewayMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

export type GatewayStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface ChannelState {
    status: GatewayStatus;
    messages: GatewayMessage[];
    isLoading: boolean;
    hasNewMessage: boolean; // Badge indicator for background messages
}

interface ConnectOptions {
    url: string;
    token: string;
    password?: string;
    sessionKey?: string;
}

// ─── Utilities ─────────────────────────────────────────────────
let reqCounter = 0;
const nextId = () => `wc-${++reqCounter}-${Date.now()}`;

// Normalize OpenClaw content to plain string
const normalizeContent = (content: any): string => {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
        return content
            .map((block: any) => {
                if (typeof block === 'string') return block;
                if (block?.type === 'text') return block.text || '';
                if (block?.type === 'thinking') return '';
                if (block?.text) return block.text;
                return '';
            })
            .filter(Boolean)
            .join('\n');
    }
    if (content && typeof content === 'object') {
        if (content.text) return content.text;
        if (content.type === 'text') return content.text || '';
        return JSON.stringify(content);
    }
    return String(content ?? '');
};

// ─── Single channel connection ─────────────────────────────────
class ChannelConnection {
    channelId: number;
    ws: WebSocket | null = null;
    pending = new Map<string, { resolve: (v: any) => void; reject: (e: any) => void }>();
    sessionKey = 'agent:main:main';
    state: ChannelState = {
        status: 'disconnected',
        messages: [],
        isLoading: false,
        hasNewMessage: false,
    };

    // De-duplication (prevent duplicate messages from RPC + event)
    private lastMsgHash = '';
    private lastMsgTime = 0;

    private onChange: () => void;

    constructor(channelId: number, onChange: () => void) {
        this.channelId = channelId;
        this.onChange = onChange;
    }

    private update(patch: Partial<ChannelState>) {
        this.state = { ...this.state, ...patch };
        this.onChange();
    }

    private updateMessages(updater: (prev: GatewayMessage[]) => GatewayMessage[]) {
        this.state = { ...this.state, messages: updater(this.state.messages) };
        this.onChange();
    }

    // RPC request
    rpc(method: string, params: any = {}, timeout = 30000): Promise<any> {
        return new Promise((resolve, reject) => {
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
                reject(new Error('WebSocket not connected'));
                return;
            }
            const id = nextId();
            this.pending.set(id, { resolve, reject });
            this.ws.send(JSON.stringify({ type: 'req', id, method, params }));
            setTimeout(() => {
                if (this.pending.has(id)) {
                    this.pending.delete(id);
                    reject(new Error(`RPC timeout: ${method}`));
                }
            }, timeout);
        });
    }

    // Handle WS messages — only care about chat events (final results)
    private handleMessage(data: string) {
        let frame: any;
        try { frame = JSON.parse(data); } catch { return; }

        // RPC response
        if (frame.type === 'res' && frame.id) {
            const p = this.pending.get(frame.id);
            if (p) {
                this.pending.delete(frame.id);
                if (frame.ok) p.resolve(frame.payload);
                else p.reject(new Error(frame.error?.message || 'RPC error'));
            }
            return;
        }

        if (frame.type === 'event') {

            // OpenClaw protocol: chat and agent events
            // payload: { message?: { role, content: [{type:'text',text:'...'}] }, state?, runId?, sessionKey? }
            // agent event: { stream: 'assistant'|'tool'|'lifecycle', data: {...}, runId, sessionKey }
            if (frame.event === 'chat' || frame.event === 'agent') {
                const payload = frame.payload as any;

                // Extract message from agent event (ref: webclaw extractChatPayloadsFromAgentPayload)
                let message = payload?.message;
                let state = payload?.state;

                if (frame.event === 'agent' && !message) {
                    const stream = payload?.stream || '';
                    const data = payload?.data;
                    if (stream === 'assistant' && data) {
                        const text = data?.text || data?.delta || '';
                        if (text) {
                            message = { role: 'assistant', content: [{ type: 'text', text }] };
                            state = 'delta';
                        }
                    }
                    if (stream === 'lifecycle' && data?.phase === 'end') {
                        state = 'final';
                    }
                }

                // Process message
                if (message && typeof message === 'object') {
                    const role = message.role || 'assistant';
                    const content = message.content || message.text;
                    if (content) {
                        const normalized = normalizeContent(content);
                        if (normalized.trim()) {
                            // De-duplicate
                            const hash = `${role}:${normalized}`;
                            const now = Date.now();
                            if (hash === this.lastMsgHash && now - this.lastMsgTime < 2000) {
                                // skip duplicate
                            } else {
                                this.lastMsgHash = hash;
                                this.lastMsgTime = now;
                                this.updateMessages(prev => [...prev, {
                                    role: role === 'user' ? 'user' as const : 'assistant' as const,
                                    content: normalized,
                                }]);
                                if (role !== 'user') {
                                    this.update({ hasNewMessage: true });
                                }
                            }
                        }
                    }
                }

                // State check: final/error/aborted = done
                if (state === 'final' || state === 'error' || state === 'aborted') {
                    this.update({ isLoading: false });
                }
            }
            // Heartbeat
            if (frame.event === 'heartbeat' || frame.event === 'tick') {
                this.ws?.send(JSON.stringify({ type: 'event', event: 'heartbeat', payload: {} }));
            }
        }
    }

    // Connect to Gateway
    async connect(options: ConnectOptions): Promise<void> {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }

        this.update({ status: 'connecting' });
        this.sessionKey = options.sessionKey || 'agent:main:main';

        return new Promise<void>((resolve, reject) => {
            let settled = false;
            const safeResolve = () => { if (!settled) { settled = true; resolve(); } };
            const safeReject = (err: Error) => {
                if (!settled) { settled = true; this.update({ status: 'error' }); reject(err); }
            };

            let ws: WebSocket;
            try { ws = new WebSocket(options.url); } catch (e) {
                safeReject(new Error(`Invalid WebSocket URL: ${options.url}`));
                return;
            }
            this.ws = ws;

            ws.onopen = () => { /* Wait for connect.challenge */ };

            ws.onmessage = (ev) => {
                let frame: any;
                try { frame = JSON.parse(ev.data); } catch { return; }

                if (frame.type === 'event' && frame.event === 'connect.challenge') {
                    const connectId = nextId();
                    this.pending.set(connectId, {
                        resolve: async (payload: any) => {
                            if (payload?.type === 'hello-ok') {
                                this.update({ status: 'connected' });
                                ws.onmessage = (e) => this.handleMessage(e.data);

                                // Fetch chat history
                                try {
                                    const history = await this.rpc('chat.history', { sessionKey: this.sessionKey });
                                    if (history?.messages?.length) {
                                        const historyMsgs: GatewayMessage[] = history.messages.map((m: any) => ({
                                            role: m.role === 'user' ? 'user' as const : 'assistant' as const,
                                            content: normalizeContent(m.content || m.text),
                                        }));
                                        this.update({ messages: historyMsgs });
                                    }
                                } catch { /* History fetch failure is non-blocking */ }
                                safeResolve();
                            }
                        },
                        reject: (err: any) => safeReject(err instanceof Error ? err : new Error(String(err))),
                    });

                    try {
                        ws.send(JSON.stringify({
                            type: 'req', id: connectId, method: 'connect',
                            params: {
                                minProtocol: 3, maxProtocol: 3,
                                client: { id: 'webchat-ui', version: '1.0.0', platform: navigator.platform, mode: 'webchat' },
                                scopes: ['operator.read', 'operator.write'],
                                caps: [],
                                auth: {
                                    ...(options.token ? { token: options.token } : {}),
                                    ...(options.password ? { password: options.password } : {}),
                                },
                                locale: navigator.language,
                                userAgent: 'Echobird/1.0.0',
                            },
                        }));
                    } catch { safeReject(new Error('Failed to send connect request')); }
                    return;
                }

                if (frame.type === 'res' && frame.id) {
                    const p = this.pending.get(frame.id);
                    if (p) {
                        this.pending.delete(frame.id);
                        if (frame.ok) p.resolve(frame.payload);
                        else p.reject(new Error(frame.error?.message || 'Connect failed'));
                    }
                }
            };

            ws.onerror = () => safeReject(new Error('WebSocket connection failed'));
            ws.onclose = (ev) => {
                if (!settled) safeReject(new Error(ev.reason || 'Connection closed before handshake'));
                else this.update({ status: 'disconnected' });
                this.update({ isLoading: false });
                this.pending.clear();
            };

            setTimeout(() => {
                if (this.ws === ws && !settled) {
                    ws.close();
                    safeReject(new Error('Connection timeout'));
                }
            }, 5000);
        });
    }

    // Send message (with optional attachments)
    async send(text: string, attachments?: Array<{ type: 'image' | 'file'; name: string; data: string }>) {
        if (!text.trim() && (!attachments || attachments.length === 0)) return;

        // Build display text for user message area
        const displayParts: string[] = [];
        if (text.trim()) displayParts.push(text);
        if (attachments?.length) {
            displayParts.push(attachments.map(a => `[📎 ${a.name}]`).join(' '));
        }
        this.updateMessages(prev => [...prev, { role: 'user', content: displayParts.join('\n') }]);
        this.update({ isLoading: true, hasNewMessage: false });

        // Always send message as string
        let messageStr = text;
        // Build OpenClaw attachments (images via attachments param, files appended to message)
        const gatewayAttachments: Array<{ mimeType: string; content: string }> = [];
        if (attachments && attachments.length > 0) {
            const textParts: string[] = [];
            for (const att of attachments) {
                if (att.type === 'image' && att.data) {
                    // Extract mimeType and base64 from dataURL
                    // Format: data:image/jpeg;base64,/9j/4AAQ...
                    const commaIdx = att.data.indexOf(',');
                    const semicolonIdx = att.data.indexOf(';');
                    if (commaIdx > 0 && semicolonIdx > 0) {
                        const mimeType = att.data.substring(5, semicolonIdx); // skip "data:"
                        const base64 = att.data.substring(commaIdx + 1);
                        if (mimeType && base64) {
                            gatewayAttachments.push({ mimeType, content: base64 });
                        }
                    }
                } else if (att.type === 'file') {
                    textParts.push(`[File: ${att.name}]\n${att.data}`);
                }
            }
            if (textParts.length > 0) {
                messageStr = messageStr ? `${messageStr}\n\n${textParts.join('\n\n')}` : textParts.join('\n\n');
            }
        }

        try {
            const rpcParams: any = {
                message: messageStr,
                sessionKey: this.sessionKey,
                deliver: true,
                timeoutMs: 120_000,
                idempotencyKey: `wc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            };
            // Add attachments param for images (webclaw-compatible format)
            if (gatewayAttachments.length > 0) {
                rpcParams.attachments = gatewayAttachments;
            }
            const result = await this.rpc('chat.send', rpcParams, 120000);

            // Do not add message from RPC result (handled by chat events to avoid duplicates)
            if (result?.status === 'ok') {
                this.update({ isLoading: false });
            } else {
                // Accepted: 60s fallback timeout
                setTimeout(() => {
                    if (this.state.isLoading) {
                        console.warn('[GW] Send timeout (60s)');
                        this.update({ isLoading: false });
                    }
                }, 60000);
            }
        } catch (e) {
            this.updateMessages(prev => [...prev, {
                role: 'system',
                content: `[ERROR] ${e instanceof Error ? e.message : String(e)}`,
            }]);
            this.update({ isLoading: false });
        }
    }

    // Abort current request
    async abort() {
        try { await this.rpc('chat.abort', { sessionKey: this.sessionKey }); } catch { /* ignore */ }
        this.update({ isLoading: false });
    }

    // Disconnect
    disconnect() {
        if (this.ws) { this.ws.close(); this.ws = null; }
        this.update({ status: 'disconnected', isLoading: false });
        this.pending.clear();
    }

    // Reset: disconnect + clear all messages
    reset() {
        this.disconnect();
        this.updateMessages(() => []);
        this.update({ hasNewMessage: false });
    }

    // Mark messages as read
    markRead() {
        if (this.state.hasNewMessage) {
            this.update({ hasNewMessage: false });
        }
    }

    // Destroy connection and state
    destroy() {
        this.disconnect();
        this.state = { status: 'disconnected', messages: [], isLoading: false, hasNewMessage: false };
    }
}

// ─── GatewayManager ─────────────────────────────────────────────
class GatewayManager {
    connections = new Map<number, ChannelConnection>();
    private listeners = new Set<() => void>();
    private version = 0;

    // useSyncExternalStore support
    subscribe = (listener: () => void) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    };

    getSnapshot = () => this.version;

    private notify() {
        this.version++;
        this.listeners.forEach(fn => fn());
    }

    getConnection(channelId: number): ChannelConnection {
        let conn = this.connections.get(channelId);
        if (!conn) {
            conn = new ChannelConnection(channelId, () => this.notify());
            this.connections.set(channelId, conn);
        }
        return conn;
    }

    getChannelState(channelId: number): ChannelState {
        return this.connections.get(channelId)?.state ?? {
            status: 'disconnected', messages: [], isLoading: false, hasNewMessage: false,
        };
    }

    hasAnyNewMessage(): boolean {
        for (const [, conn] of this.connections) {
            if (conn.state.hasNewMessage) return true;
        }
        return false;
    }

    async connect(channelId: number, options: ConnectOptions) {
        return this.getConnection(channelId).connect(options);
    }

    async send(channelId: number, text: string, attachments?: Array<{ type: 'image' | 'file'; name: string; data: string }>) {
        return this.getConnection(channelId).send(text, attachments);
    }

    async abort(channelId: number) {
        return this.getConnection(channelId).abort();
    }

    disconnect(channelId: number) {
        this.connections.get(channelId)?.disconnect();
    }

    reset(channelId: number) {
        this.connections.get(channelId)?.reset();
    }

    markRead(channelId: number) {
        this.connections.get(channelId)?.markRead();
    }

    destroyChannel(channelId: number) {
        this.connections.get(channelId)?.destroy();
        this.connections.delete(channelId);
        this.notify();
    }
}

// ─── React Context ─────────────────────────────────────────────
const GatewayContext = createContext<GatewayManager | null>(null);

// Global singleton (survives re-renders)
const globalManager = new GatewayManager();

export function GatewayProvider({ children }: { children: ReactNode }) {
    return (
        <GatewayContext.Provider value={globalManager}>
            {children}
        </GatewayContext.Provider>
    );
}

// ─── Hooks ─────────────────────────────────────────────────────

export function useGatewayManager() {
    const manager = useContext(GatewayContext);
    if (!manager) throw new Error('useGatewayManager must be used within GatewayProvider');
    useSyncExternalStore(manager.subscribe, manager.getSnapshot);
    return manager;
}

export function useChannelGateway(channelId: number | null) {
    const manager = useGatewayManager();

    const state = channelId ? manager.getChannelState(channelId) : {
        status: 'disconnected' as GatewayStatus,
        messages: [] as GatewayMessage[],
        isLoading: false,
        hasNewMessage: false,
    };

    const connect = useCallback((options: ConnectOptions) => {
        if (!channelId) return Promise.resolve();
        return manager.connect(channelId, options);
    }, [manager, channelId]);

    const send = useCallback((text: string, attachments?: Array<{ type: 'image' | 'file'; name: string; data: string }>) => {
        if (!channelId) return Promise.resolve();
        return manager.send(channelId, text, attachments);
    }, [manager, channelId]);

    const abort = useCallback(() => {
        if (!channelId) return Promise.resolve();
        return manager.abort(channelId);
    }, [manager, channelId]);

    const disconnect = useCallback(() => {
        if (channelId) manager.disconnect(channelId);
    }, [manager, channelId]);

    const reset = useCallback(() => {
        if (channelId) manager.reset(channelId);
    }, [manager, channelId]);

    const markRead = useCallback(() => {
        if (channelId) manager.markRead(channelId);
    }, [manager, channelId]);

    return { ...state, connect, send, abort, disconnect, reset, markRead };
}
