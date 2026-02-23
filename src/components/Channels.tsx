// Channels — OpenClaw Gateway WebSocket chat interface (global GatewayContext)
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Plus, Minus, CornerDownLeft, X, Square, Paperclip, Image as ImageIcon, Trash2, Pencil, KeyRound } from 'lucide-react';
import { MiniSelect } from './MiniSelect';
import { getModelIcon } from './cards/ModelCard';
import { useChannelGateway, useGatewayManager } from '../contexts/GatewayContext';
import { useI18n } from '../hooks/useI18n';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Markdown components config (stable reference, no re-creation per render)
const mdComponents = {
    code: ({ className, children, ...props }: any) => {
        const isInline = !className;
        return isInline ? (
            <code className="bg-cyber-accent/10 text-cyber-accent px-1.5 py-0.5 rounded text-[0.85em] font-mono" {...props}>{children}</code>
        ) : (
            <code className={`block bg-black/40 border border-cyber-border/30 rounded-lg p-3 pr-10 my-2 text-[0.85em] font-mono text-cyber-text-primary overflow-x-auto whitespace-pre ${className || ''}`} {...props}>{children}</code>
        );
    },
    pre: ({ children }: any) => {
        const codeText = String(children?.props?.children || '').replace(/\n$/, '');
        const isBlock = children?.props?.className;
        if (!isBlock) return <>{children}</>;
        return (
            <div className="relative group">
                {children}
                <button
                    onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                        navigator.clipboard.writeText(codeText);
                        const btn = e.currentTarget;
                        const svg = btn.querySelector('svg');
                        if (svg) svg.style.display = 'none';
                        btn.insertAdjacentHTML('beforeend', '<span class="copy-ok" style="color:#00ff9d">✓</span>');
                        setTimeout(() => {
                            const ok = btn.querySelector('.copy-ok');
                            if (ok) ok.remove();
                            if (svg) svg.style.display = '';
                        }, 1500);
                    }}
                    className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center text-cyber-text-muted/40 hover:text-cyber-accent transition-colors"
                ><svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg></button>
            </div>
        );
    },
    a: ({ href, children }: any) => (
        <a href={href} className="text-cyber-accent hover:underline" onClick={(e: React.MouseEvent) => { e.preventDefault(); (window as any).electron?.openExternal(href); }}>{children}</a>
    ),
    strong: ({ children }: any) => <strong className="text-cyber-text-primary font-bold">{children}</strong>,
    em: ({ children }: any) => <em className="text-cyber-accent/80">{children}</em>,
    ul: ({ children }: any) => <ul className="list-disc list-inside my-1 space-y-0.5">{children}</ul>,
    ol: ({ children }: any) => <ol className="list-decimal list-inside my-1 space-y-0.5">{children}</ol>,
    h1: ({ children }: any) => <h1 className="text-lg font-bold text-cyber-text-primary mt-3 mb-1">{children}</h1>,
    h2: ({ children }: any) => <h2 className="text-base font-bold text-cyber-text-primary mt-2 mb-1">{children}</h2>,
    h3: ({ children }: any) => <h3 className="text-sm font-bold text-cyber-text-primary mt-2 mb-1">{children}</h3>,
    blockquote: ({ children }: any) => <blockquote className="border-l-2 border-cyber-accent/40 pl-3 my-1 text-cyber-text-muted/60 italic">{children}</blockquote>,
    hr: () => <hr className="border-cyber-border/30 my-2" />,
    table: ({ children }: any) => <table className="border-collapse my-2 text-sm w-full">{children}</table>,
    th: ({ children }: any) => <th className="border border-cyber-border/30 px-2 py-1 bg-cyber-accent/5 text-left font-bold">{children}</th>,
    td: ({ children }: any) => <td className="border border-cyber-border/30 px-2 py-1">{children}</td>,
};

// Memoized message component — only re-renders when msg content/role changes
const ChannelMessage = React.memo(({ role, content }: { role: string; content: string }) => {
    if (role === 'user') {
        return <p className="break-words whitespace-pre-wrap text-white">{`> ${content}`}</p>;
    }
    if (role === 'system') {
        return <p className="break-words whitespace-pre-wrap text-red-400">{content}</p>;
    }
    return (
        <div className="break-words text-cyber-text-muted/80 channel-markdown">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>{content}</ReactMarkdown>
        </div>
    );
});
ChannelMessage.displayName = 'ChannelMessage';

// WebSocket-only protocols
const PROTOCOLS = [
    { id: 'ws://', label: 'ws://' },
    { id: 'wss://', label: 'wss://' },
];

// Channel data
// Attachment type
interface Attachment {
    type: 'image' | 'file';
    name: string;
    data: string; // base64 data URL (image) or text content (file)
    preview?: string; // Image thumbnail URL
}

interface Channel {
    id: number;
    name: string;
    address: string;
    protocol: string;
}

// Default channel count
const DEFAULT_CHANNEL_COUNT = 6;

// Create default empty channel
const createChannel = (id: number): Channel => ({
    id,
    name: '',
    address: '',
    protocol: 'ws://',
});

// Parse address into wsUrl + token + password
const parseAddress = (channel: Channel) => {
    let addr = channel.address.trim();
    // Strip protocol prefix if user pasted a full URL
    addr = addr.replace(/^wss?:\/\//i, '');
    const fullUrl = `${channel.protocol}${addr}`;
    const urlObj = (() => {
        try { return new URL(fullUrl); } catch { return null; }
    })();
    const token = urlObj?.searchParams.get('token')
        || urlObj?.searchParams.get('Token')
        || addr.match(/[?&]token=([^&]+)/i)?.[1]
        || '';
    const password = urlObj?.searchParams.get('password')
        || urlObj?.searchParams.get('Password')
        || addr.match(/[?&]password=([^&]+)/i)?.[1]
        || '';
    // Keep full URL (with query params) — OpenClaw requires token in URL for scope auth
    const wsUrl = `${channel.protocol}${addr}`;
    return { wsUrl, token, password };
};

// Image compression params (ref: webclaw)
const MAX_IMAGE_DIMENSION = 1280;
const IMAGE_QUALITY = 0.75;
const TARGET_IMAGE_SIZE = 300 * 1024; // WebSocket limit 512KB, base64 adds ~33%

// Compress image to dataURL (Canvas API)
async function compressImageToDataURL(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const objectUrl = URL.createObjectURL(file);
        img.onload = () => {
            try {
                let width = img.width;
                let height = img.height;
                // Scale down to max dimension
                if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
                    if (width > height) {
                        height = Math.round((height * MAX_IMAGE_DIMENSION) / width);
                        width = MAX_IMAGE_DIMENSION;
                    } else {
                        width = Math.round((width * MAX_IMAGE_DIMENSION) / height);
                        height = MAX_IMAGE_DIMENSION;
                    }
                }
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                if (!ctx) { URL.revokeObjectURL(objectUrl); reject(new Error('Canvas error')); return; }
                ctx.drawImage(img, 0, 0, width, height);
                // Keep PNG for transparency, use JPEG otherwise
                const outputType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
                let quality = IMAGE_QUALITY;
                let dataUrl = canvas.toDataURL(outputType, quality);
                // Progressively reduce quality until size limit met
                if (outputType === 'image/jpeg') {
                    const targetSize = TARGET_IMAGE_SIZE * 1.37; // base64 overhead
                    while (dataUrl.length > targetSize && quality > 0.3) {
                        quality -= 0.1;
                        dataUrl = canvas.toDataURL(outputType, quality);
                    }
                }
                URL.revokeObjectURL(objectUrl);
                resolve(dataUrl);
            } catch (e) {
                URL.revokeObjectURL(objectUrl);
                reject(e);
            }
        };
        img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('Image load failed')); };
        img.src = objectUrl;
    });
}

export const Channels: React.FC = () => {
    const { t } = useI18n();
    const [channels, setChannels] = useState<Channel[]>(
        () => Array.from({ length: DEFAULT_CHANNEL_COUNT }, (_, i) => createChannel(i + 1))
    );
    const [activeId, setActiveId] = useState<number | null>(1);
    const [input, setInput] = useState('');
    const [arrowIndex, setArrowIndex] = useState(0);
    const [attachments, setAttachments] = useState<Attachment[]>([]);
    const [selectedModel, setSelectedModel] = useState<ModelConfig | null>(null);
    const [showModelPicker, setShowModelPicker] = useState(false);
    const [modelList, setModelList] = useState<ModelConfig[]>([]);
    const modelPickerRef = useRef<HTMLDivElement>(null);

    const inputRef = useRef<HTMLTextAreaElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);

    // Global Gateway manager
    const manager = useGatewayManager();

    // Current channel gateway connection
    const gateway = useChannelGateway(activeId);

    const activeChannel = channels.find(c => c.id === activeId);
    const isActiveConnected = gateway.status === 'connected';
    const messages = gateway.messages;

    // Load channel data from config file on startup
    useEffect(() => {
        window.electron?.getChannels?.().then((saved: any[]) => {
            if (saved && saved.length > 0) {
                // Backward compatible: fill in possibly missing name field
                setChannels(saved.map(c => ({ ...c, name: c.name || '' })));
            }
        });
    }, []);

    // Save to config file on channel changes
    const channelsRef = useRef(channels);
    channelsRef.current = channels;
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
        // Debounced save: avoid frequent file writes
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => {
            window.electron?.saveChannels?.(channels.map(c => ({ id: c.id, name: c.name, protocol: c.protocol, address: c.address })));
        }, 500);
        return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
    }, [channels]);

    // Smart scroll: auto-follow unless user scrolls up
    const autoFollowRef = useRef(true);
    const [showScrollBtn, setShowScrollBtn] = useState(false);
    const chatContainerRef = useRef<HTMLDivElement>(null);

    const handleChatScroll = () => {
        const container = chatContainerRef.current;
        if (!container) return;
        const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 40;
        autoFollowRef.current = isAtBottom;
        setShowScrollBtn(!isAtBottom && messages.length > 0);
    };

    useEffect(() => {
        if (autoFollowRef.current && scrollRef.current) {
            scrollRef.current.scrollIntoView({ behavior: 'auto' });
        }
    }, [messages]);

    useEffect(() => {
        autoFollowRef.current = true;
        setShowScrollBtn(false);
        scrollRef.current?.scrollIntoView({ behavior: 'instant' as any });
    }, [activeId]);

    const scrollToBottom = () => {
        autoFollowRef.current = true;
        setShowScrollBtn(false);
        scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    // Loading animation
    useEffect(() => {
        if (!gateway.isLoading) return;
        const timer = setInterval(() => {
            setArrowIndex(prev => (prev + 1) % 4);
        }, 200);
        return () => clearInterval(timer);
    }, [gateway.isLoading]);

    // Focus input on connect
    useEffect(() => {
        if (isActiveConnected) inputRef.current?.focus();
    }, [isActiveConnected]);

    // Mark read on channel switch
    useEffect(() => {
        if (activeId) gateway.markRead();
    }, [activeId]);

    // Channel ID currently being renamed
    const [editingNameId, setEditingNameId] = useState<number | null>(null);
    const nameInputRef = useRef<HTMLInputElement>(null);

    // Update channel name
    const updateName = (id: number, name: string) => {
        setChannels(prev => prev.map(c =>
            c.id === id ? { ...c, name } : c
        ));
    };

    // Switch channel (view only, no disconnect)
    const selectChannel = useCallback((id: number) => {
        if (id === activeId) return;
        setActiveId(id);
    }, [activeId]);

    // Connect to Gateway
    const handleConnect = useCallback(async () => {
        if (!activeChannel) return;
        const { wsUrl, token, password } = parseAddress(activeChannel);
        const label = activeChannel.name || `Channel #${String(activeChannel.id).padStart(2, '0')}`;
        try {
            await gateway.connect({ url: wsUrl, token, password });
            window.electron?.addAppLog?.('CHANNEL', `Connected: ${label} (${wsUrl})`);
        } catch (e) {
            const errMsg = e instanceof Error ? e.message : String(e);
            window.electron?.addAppLog?.('CHANNEL', `Connection failed: ${label} (${wsUrl}) — ${errMsg}`);
        }
    }, [activeChannel, gateway]);

    // Full reset: disconnect + clear messages + clear address
    const handleReset = useCallback(() => {
        if (!activeId) return;
        const ch = channels.find(c => c.id === activeId);
        const label = ch?.name || `Channel #${String(activeId).padStart(2, '0')}`;
        window.electron?.addAppLog?.('CHANNEL', `Reset: ${label}`);
        gateway.reset();
        setChannels(prev => prev.map(c =>
            c.id === activeId ? { ...c, address: '' } : c
        ));
    }, [activeId, gateway, channels]);

    // Add new channel
    const addChannel = () => {
        const nextId = channels.length + 1;
        setChannels(prev => [...prev, createChannel(nextId)]);
    };

    // Remove last channel (keep at least 1)
    const removeChannel = () => {
        if (channels.length <= 1) return;
        const lastCh = channels[channels.length - 1];
        if (activeId === lastCh.id) {
            setActiveId(channels[channels.length - 2].id);
        }
        manager.destroyChannel(lastCh.id);
        setChannels(prev => prev.slice(0, -1));
    };

    // Update channel address
    const updateAddress = (id: number, address: string) => {
        setChannels(prev => prev.map(c =>
            c.id === id ? { ...c, address } : c
        ));
    };

    // Update channel protocol
    const updateProtocol = (id: number, protocol: string) => {
        setChannels(prev => prev.map(c =>
            c.id === id ? { ...c, protocol } : c
        ));
    };

    // Handle address input Enter key
    const handleAddressKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && gateway.status !== 'connected' && gateway.status !== 'connecting') {
            e.preventDefault();
            handleConnect();
        }
    }, [gateway.status, handleConnect]);

    // Handle paste image
    const handlePaste = useCallback((e: React.ClipboardEvent) => {
        const items = e.clipboardData?.items;
        if (!items) return;
        for (const item of items) {
            if (item.type.startsWith('image/')) {
                e.preventDefault();
                const file = item.getAsFile();
                if (!file) continue;
                // Compress image asynchronously
                compressImageToDataURL(file).then(dataUrl => {
                    setAttachments(prev => [...prev, {
                        type: 'image',
                        name: file.name || `paste-${Date.now()}.png`,
                        data: dataUrl,
                        preview: dataUrl,
                    }]);
                }).catch(err => {
                    console.error('[Channels] Image compression failed:', err);
                });
            }
        }
    }, []);

    // Select file (any type)
    const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files) return;
        for (const file of files) {
            if (file.type.startsWith('image/')) {
                // Compress image before adding as attachment
                compressImageToDataURL(file).then(dataUrl => {
                    setAttachments(prev => [...prev, {
                        type: 'image',
                        name: file.name,
                        data: dataUrl,
                        preview: dataUrl,
                    }]);
                }).catch(err => {
                    console.error('[Channels] Image compression failed:', err);
                });
            } else {
                // Read non-image file as text
                const reader = new FileReader();
                reader.onload = () => {
                    setAttachments(prev => [...prev, {
                        type: 'file',
                        name: file.name,
                        data: reader.result as string,
                    }]);
                };
                reader.readAsText(file);
            }
        }
        e.target.value = ''; // Reset input
    }, []);

    // Select image
    const handleImageSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files) return;
        for (const file of files) {
            compressImageToDataURL(file).then(dataUrl => {
                setAttachments(prev => [...prev, {
                    type: 'image',
                    name: file.name,
                    data: dataUrl,
                    preview: dataUrl,
                }]);
            }).catch(err => {
                console.error('[Channels] Image compression failed:', err);
            });
        }
        e.target.value = '';
    }, []);

    // Remove attachment
    const removeAttachment = useCallback((index: number) => {
        setAttachments(prev => prev.filter((_, i) => i !== index));
    }, []);

    // Open model picker
    const openModelPicker = useCallback(async () => {
        try {
            const models = await window.electron?.getModelsDecrypted?.();
            if (models && models.length > 0) {
                setModelList(models);
                setShowModelPicker(true);
            }
        } catch { /* ignore */ }
    }, []);

    // Close model picker on outside click
    useEffect(() => {
        if (!showModelPicker) return;
        const handler = (e: MouseEvent) => {
            if (modelPickerRef.current && !modelPickerRef.current.contains(e.target as Node)) {
                setShowModelPicker(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showModelPicker]);

    // Format model config as plain text for sending
    const formatModelText = (m: ModelConfig): string => {
        const lines = [
            `[MODEL CONFIG]`,
            `Name: ${m.name}`,
            `Model: ${m.modelId || 'N/A'}`,
            `Base URL: ${m.baseUrl}`,
        ];
        if (m.anthropicUrl) lines.push(`Anthropic URL: ${m.anthropicUrl}`);
        lines.push(`API Key: ${m.apiKey}`);
        if (m.proxyUrl) lines.push(`Proxy URL: ${m.proxyUrl}`);
        lines.push(`[/MODEL CONFIG]`);
        return lines.join('\n');
    };

    // Send message
    const handleSend = useCallback(async () => {
        if (!activeId || gateway.isLoading || !isActiveConnected) return;
        if (!input.trim() && attachments.length === 0 && !selectedModel) return;
        let text = input.trim();
        // Append model config as text
        if (selectedModel) {
            const modelText = formatModelText(selectedModel);
            text = text ? `${text}\n\n${modelText}` : modelText;
        }
        const atts = attachments.length > 0 ? [...attachments] : undefined;
        setInput('');
        setAttachments([]);
        setSelectedModel(null);
        await gateway.send(text, atts);
        inputRef.current?.focus();
    }, [activeId, input, attachments, selectedModel, gateway, isActiveConnected]);

    // Abort current request
    const handleAbort = useCallback(() => {
        gateway.abort();
    }, [gateway]);

    return (
        <div className="flex h-full gap-0 overflow-hidden">
            {/* ======== Left: Channel list ======== */}
            <div className="w-56 flex-shrink-0 flex flex-col">
                <div className="flex-1 overflow-y-auto pr-2 py-2 space-y-2 custom-scrollbar">
                    {channels.map(ch => {
                        const isActive = activeId === ch.id;
                        const chState = manager.getChannelState(ch.id);
                        const isLinked = chState.status === 'connected';
                        const isError = chState.status === 'error';
                        const hasNew = chState.hasNewMessage && !isActive;

                        return (
                            <div
                                key={ch.id}
                                onClick={() => selectChannel(ch.id)}
                                className={`w-full text-left p-3 transition-all font-mono border rounded-card cursor-pointer ${isActive
                                    ? 'border-cyber-accent bg-cyber-accent/10 shadow-cyber-card'
                                    : 'border-cyber-border/40 bg-black/80 hover:border-cyber-accent/30 hover:bg-black/90'
                                    }`}
                            >
                                {/* Status */}
                                <div className="flex items-center gap-1.5 mb-1.5">
                                    <div className={`w-2 h-2 rounded-full ${isLinked ? 'bg-cyber-accent animate-pulse' : isError ? 'bg-red-400' : 'bg-cyber-text-muted/30'}`} />
                                    <span className={`text-xs tracking-wide ${isLinked ? 'text-cyber-accent' : isError ? 'text-red-400' : 'text-cyber-text-muted/40'}`}>
                                        [{isLinked ? t('channel.linked') : isError ? 'FAILED' : t('channel.standby')}]
                                    </span>
                                    {/* Unread badge */}
                                    {hasNew && (
                                        <span className="ml-auto w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                                    )}
                                </div>
                                {/* Name */}
                                <div className="flex items-center gap-1 h-5">
                                    {editingNameId === ch.id ? (
                                        <input
                                            ref={nameInputRef}
                                            type="text"
                                            defaultValue={ch.name}
                                            placeholder={`Agent Channel #${String(ch.id).padStart(2, '0')}`}
                                            onBlur={(e) => {
                                                updateName(ch.id, e.target.value.trim());
                                                setEditingNameId(null);
                                            }}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    (e.target as HTMLInputElement).blur();
                                                }
                                            }}
                                            onClick={(e) => e.stopPropagation()}
                                            className="flex-1 min-w-0 bg-transparent border-b border-cyber-accent/40 text-sm font-bold text-cyber-accent outline-none py-0 px-0 font-mono h-5 leading-tight"
                                            autoFocus
                                        />
                                    ) : (
                                        <>
                                            <span className={`text-sm font-bold whitespace-nowrap truncate ${isActive ? 'text-cyber-accent' : 'text-cyber-accent/70'}`}>
                                                {ch.name || `Agent Channel #${String(ch.id).padStart(2, '0')}`}
                                            </span>
                                            {isActive && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setEditingNameId(ch.id);
                                                    }}
                                                    className="p-0.5 text-cyber-accent/30 hover:text-cyber-accent transition-colors flex-shrink-0"
                                                >
                                                    <Pencil size={11} />
                                                </button>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* + / - buttons */}
                <div className="p-2 flex gap-2">
                    <button
                        onClick={addChannel}
                        className="flex-1 py-2 border border-dashed border-cyber-accent/25 hover:border-cyber-accent/60 text-cyber-accent/40 hover:text-cyber-accent transition-all flex items-center justify-center text-xs font-mono rounded-card"
                    >
                        <Plus size={14} />
                    </button>
                    <button
                        onClick={removeChannel}
                        disabled={channels.length <= 1}
                        className="flex-1 py-2 border border-dashed border-red-400/25 hover:border-red-400/60 text-red-400/40 hover:text-red-400 transition-all flex items-center justify-center text-xs font-mono rounded-card disabled:opacity-20 disabled:cursor-not-allowed"
                    >
                        <Minus size={14} />
                    </button>
                </div>
            </div>


            {/* ======== Right: Address bar + Chat area ======== */}
            <div className="flex-1 flex flex-col min-w-0">
                {activeChannel && (
                    <>
                        {/* Address bar */}
                        <div className="px-4 pt-2 pb-2 flex items-center gap-2 flex-shrink-0">
                            <MiniSelect
                                value={activeChannel.protocol}
                                onChange={(v) => updateProtocol(activeChannel.id, v)}
                                options={PROTOCOLS}
                                className="min-w-[100px]"
                            />
                            <input
                                type="text"
                                value={activeChannel.address}
                                onChange={(e) => updateAddress(activeChannel.id, e.target.value)}
                                onKeyDown={handleAddressKeyDown}
                                placeholder="e.g. 127.0.0.1:18789?token=xxx or ?password=xxx"
                                className="flex-1 bg-black border border-cyber-border px-2 py-1.5 text-xs text-cyber-text font-mono focus:border-cyber-accent focus:outline-none rounded-button min-w-0"
                                disabled={gateway.status === 'connected'}
                            />
                            {/* Connect (Enter) / Reset (Trash) */}
                            {gateway.status !== 'connected' ? (
                                <button
                                    onClick={handleConnect}
                                    disabled={gateway.status === 'connecting' || !activeChannel.address.trim()}
                                    className="p-1.5 border border-cyber-accent hover:bg-cyber-accent/10 text-cyber-accent transition-all rounded-md disabled:opacity-50"
                                >
                                    <CornerDownLeft size={16} strokeWidth={2} />
                                </button>
                            ) : (
                                <button
                                    onClick={handleReset}
                                    className="p-1.5 border border-red-400/60 hover:bg-red-400/10 text-red-400/60 hover:text-red-400 transition-all rounded-md"
                                >
                                    <Trash2 size={16} strokeWidth={2} />
                                </button>
                            )}
                        </div>

                        {/* Terminal chat area */}
                        <div className="relative flex-1 mx-4 mt-1">
                            <div ref={chatContainerRef} onScroll={handleChatScroll} className="absolute inset-0 overflow-y-auto bg-cyber-terminal font-mono text-xs space-y-1 custom-scrollbar p-4 rounded-lg">
                                {/* System info — always visible */}
                                <div className="space-y-1 select-none">
                                    <p className="text-cyber-accent">[SYS] Channels online</p>
                                    <p className="text-cyber-text-secondary">$ echo $CHANNEL</p>
                                    <p className="text-cyber-accent/80">Agent Channel #{String(activeChannel.id).padStart(2, '0')}</p>
                                    <p className="text-cyber-text-secondary">$ echo $PROTOCOL</p>
                                    <p className="text-cyber-accent/80">{activeChannel.protocol.replace('://', '').toUpperCase()} · {activeChannel.address}</p>
                                    <p className="text-cyber-text-secondary mt-2">$ connect --handshake</p>
                                    {gateway.status === 'connecting' && (
                                        <p className="text-yellow-400">[SYS] Connecting...</p>
                                    )}
                                    {isActiveConnected && (
                                        <p className="text-cyber-accent">[SYS] Connected to Gateway · {activeChannel.protocol.replace('://', '').toUpperCase()}</p>
                                    )}
                                    {gateway.status === 'error' && (
                                        <p className="text-red-400">[SYS] Connection failed</p>
                                    )}
                                </div>

                                {messages.map((msg, i) => (
                                    <ChannelMessage key={i} role={msg.role} content={msg.content} />
                                ))}

                                {gateway.isLoading ? (
                                    <p className="text-cyber-accent font-mono">[EXEC] <span className="inline-block w-8 text-left">{['>', '>>', '>>>', ''][arrowIndex]}</span> transmitting...</p>
                                ) : isActiveConnected && (
                                    <p className="text-cyber-accent">_ ready</p>
                                )}
                                <div ref={scrollRef} />
                            </div>
                            {showScrollBtn && (
                                <button
                                    onClick={scrollToBottom}
                                    className="absolute bottom-3 right-3 w-7 h-7 flex items-center justify-center bg-cyber-bg/90 border border-cyber-border/50 rounded text-cyber-text-secondary hover:text-cyber-accent hover:border-cyber-accent/50 transition-colors z-10"
                                ><svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg></button>
                            )}
                        </div>

                        {/* Input area */}
                        <div className="flex-shrink-0 mx-4 mt-3 mb-2">
                            <div className="bg-cyber-terminal rounded-lg">
                                {/* Attachment preview */}
                                {(attachments.length > 0 || selectedModel) && (
                                    <div className="flex flex-wrap gap-2 px-3 pt-2">
                                        {/* Model config card */}
                                        {selectedModel && (
                                            <div className="relative group flex items-center gap-1.5 bg-cyber-accent/5 border border-cyber-accent/30 rounded px-2 py-1 min-h-[2.5rem] text-xs font-mono text-cyber-accent">
                                                {getModelIcon(selectedModel.name, selectedModel.modelId) ? (
                                                    <img src={getModelIcon(selectedModel.name, selectedModel.modelId)!} alt="" className="w-6 h-6" />
                                                ) : (
                                                    <KeyRound size={16} className="text-cyber-accent/60" />
                                                )}
                                                <span className="max-w-[160px] truncate">{selectedModel.name}</span>
                                                <button
                                                    onClick={() => setSelectedModel(null)}
                                                    className="ml-0.5 text-cyber-accent/40 hover:text-red-400 transition-colors"
                                                >
                                                    <X size={12} />
                                                </button>
                                            </div>
                                        )}
                                        {/* File/image attachments */}
                                        {attachments.map((att, i) => (
                                            <div key={i} className="relative group flex items-center gap-1.5 bg-cyber-bg/60 border border-cyber-border/30 rounded px-2 py-1 text-xs font-mono text-cyber-text-muted">
                                                {att.type === 'image' && att.preview ? (
                                                    <img src={att.preview} alt={att.name} className="w-8 h-8 object-cover rounded" />
                                                ) : (
                                                    <Paperclip size={12} className="text-cyber-accent/60" />
                                                )}
                                                <span className="max-w-[120px] truncate">{att.name}</span>
                                                <button
                                                    onClick={() => removeAttachment(i)}
                                                    className="ml-0.5 text-cyber-text-muted/40 hover:text-red-400 transition-colors"
                                                >
                                                    <X size={12} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                <textarea
                                    ref={inputRef}
                                    value={input}
                                    onChange={e => setInput(e.target.value)}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            handleSend();
                                        }
                                    }}
                                    onPaste={handlePaste}
                                    placeholder={gateway.isLoading ? t('channel.awaitingResponse') : t('channel.enterMessage')}
                                    disabled={gateway.isLoading || !isActiveConnected}
                                    rows={3}
                                    className="w-full bg-transparent px-4 py-2 text-sm text-cyber-text font-mono outline-none placeholder:text-cyber-text-muted/50 disabled:opacity-30 resize-none"
                                />
                                {/* Bottom toolbar */}
                                <div className="flex items-center justify-between px-3 py-1.5 border-t border-cyber-border/10">
                                    <div className="flex items-center gap-1 relative">
                                        <button
                                            onClick={() => fileInputRef.current?.click()}
                                            disabled={gateway.isLoading || !isActiveConnected}
                                            className="p-1 text-cyber-accent/40 hover:text-cyber-accent transition-colors disabled:opacity-20"
                                        >
                                            <Paperclip size={15} />
                                        </button>
                                        <button
                                            onClick={() => imageInputRef.current?.click()}
                                            disabled={gateway.isLoading || !isActiveConnected}
                                            className="p-1 text-cyber-accent/40 hover:text-cyber-accent transition-colors disabled:opacity-20"
                                        >
                                            <ImageIcon size={15} />
                                        </button>
                                        <button
                                            onClick={openModelPicker}
                                            disabled={gateway.isLoading || !isActiveConnected}
                                            className={`p-1 transition-colors disabled:opacity-20 ${selectedModel ? 'text-cyber-accent' : 'text-cyber-accent/40 hover:text-cyber-accent'}`}
                                        >
                                            <KeyRound size={15} />
                                        </button>
                                        {/* Model picker popover (upward) */}
                                        {showModelPicker && (
                                            <div
                                                ref={modelPickerRef}
                                                className="absolute bottom-full left-0 mb-2 w-64 max-h-48 overflow-y-auto bg-cyber-bg border border-cyber-border/60 rounded-lg shadow-lg z-50 custom-scrollbar"
                                            >
                                                {modelList.length === 0 ? (
                                                    <div className="px-3 py-2 text-xs text-cyber-text-muted/50 font-mono">No models available</div>
                                                ) : (
                                                    modelList.map(m => (
                                                        <button
                                                            key={m.internalId}
                                                            onClick={() => { setSelectedModel(m); setShowModelPicker(false); }}
                                                            className="w-full text-left px-3 py-2 text-xs font-mono hover:bg-cyber-accent/10 transition-colors border-b border-cyber-border/10 last:border-b-0 flex items-center gap-2"
                                                        >
                                                            {getModelIcon(m.name, m.modelId) ? (
                                                                <img src={getModelIcon(m.name, m.modelId)!} alt="" className="w-5 h-5 flex-shrink-0" />
                                                            ) : (
                                                                <KeyRound size={14} className="text-cyber-accent/40 flex-shrink-0" />
                                                            )}
                                                            <div className="min-w-0">
                                                                <div className="text-cyber-accent font-bold truncate">{m.name}</div>
                                                                <div className="text-cyber-text-muted/50 truncate">{m.modelId || m.baseUrl}</div>
                                                            </div>
                                                        </button>
                                                    ))
                                                )}
                                            </div>
                                        )}
                                    </div>
                                    {gateway.isLoading ? (
                                        <button
                                            onClick={handleAbort}
                                            className="p-1 text-red-400 hover:text-red-300 transition-colors"
                                        >
                                            <Square size={16} fill="currentColor" />
                                        </button>
                                    ) : (
                                        <button
                                            onClick={handleSend}
                                            disabled={(!input.trim() && attachments.length === 0 && !selectedModel) || !isActiveConnected}
                                            className="p-1 text-cyber-accent/60 hover:text-cyber-accent transition-colors disabled:opacity-15"
                                        >
                                            <Send size={16} />
                                        </button>
                                    )}
                                </div>
                                {/* Hidden file inputs */}
                                <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileSelect} />
                                <input ref={imageInputRef} type="file" multiple accept="image/*" className="hidden" onChange={handleImageSelect} />
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};
