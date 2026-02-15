
import React, { useState, useEffect, useRef } from 'react';
import { Play, Square, Terminal, ChevronDown } from 'lucide-react';
import { MiniSelect } from './MiniSelect';
import { useI18n } from '../hooks/useI18n';

interface LocalModelPlayerProps {
    className?: string;
    onBack?: () => void;
    modelFilePath?: string; // Selected model path from ModelStore
}

export const LocalModelPlayer: React.FC<LocalModelPlayerProps> = ({ className, modelFilePath }) => {
    const { t } = useI18n();
    // Configuration state
    const [serverPort, setServerPort] = useState<number>(11434);
    const [gpuLayers, setGpuLayers] = useState<number>(-1);
    const [gpuName, setGpuName] = useState<string>('');
    const [isNvidia, setIsNvidia] = useState<boolean>(true); // 默认允许，检测后更新
    const [contextSize, setContextSize] = useState<number>(4096);

    // Server state
    const [isRunning, setIsRunning] = useState(false);
    const [logs, setLogs] = useState<string[]>([]);
    const [pid, setPid] = useState<number | undefined>(undefined);
    const logsEndRef = useRef<HTMLDivElement>(null);
    const logsContainerRef = useRef<HTMLDivElement>(null);

    // Copy feedback
    const [copied, setCopied] = useState<string>('');

    // Extract model name and quantization from file path
    const parseModelInfo = (filePath: string) => {
        if (!filePath) return { name: 'NO MODEL SELECTED', quant: '', shortPath: '' };
        const fileName = filePath.replace(/\\/g, '/').split('/').pop() || '';
        // e.g.: qwen2.5-coder-1.5b-instruct-q4_k_m.gguf -> name=qwen2.5-coder-1.5b-instruct, quant=Q4_K_M
        const base = fileName.replace(/\.gguf$/i, '');
        const quantMatch = base.match(/[-_](q\d[_a-z0-9]*|f16|f32|fp16|fp32|bf16)$/i);
        const quant = quantMatch ? quantMatch[1].toUpperCase() : '';
        const name = quantMatch ? base.slice(0, quantMatch.index) : base;
        return { name, quant, shortPath: fileName };
    };

    const modelInfo = parseModelInfo(modelFilePath || '');

    // Init + Polling
    useEffect(() => {
        const checkStatus = async () => {
            if (window.electron?.getLocalModelServerStatus) {
                const status = await window.electron.getLocalModelServerStatus();
                setIsRunning(status.running);
                if (status.pid) setPid(status.pid);
            }
        };
        checkStatus();

        // 检测 GPU 类型，非 NVIDIA 锁死 CPU 模式
        const checkGpu = async () => {
            if (window.electron?.getGpuInfo) {
                const info = await window.electron.getGpuInfo();
                const name = info?.name || 'Unknown';
                setGpuName(name);
                // 检测是否为 NVIDIA 显卡（包含 GeForce/RTX/GTX/Tesla/A100/H100/H200 等）
                const nvidia = /nvidia|geforce|rtx|gtx|tesla|quadro|a100|h100|h200|l40|titan/i.test(name);
                setIsNvidia(nvidia);
                if (!nvidia) {
                    setGpuLayers(0); // 非 NVIDIA 强制 CPU
                    console.log(`[LocalModel] Non-NVIDIA GPU detected: ${name}, forced CPU mode`);
                }
            }
        };
        checkGpu();

        const interval = setInterval(async () => {
            if (window.electron?.getLocalModelServerLogs) {
                const serverLogs = await window.electron.getLocalModelServerLogs();
                setLogs(serverLogs);
            }
            if (window.electron?.getLocalModelServerStatus) {
                const status = await window.electron.getLocalModelServerStatus();
                setIsRunning(status.running);
            }
        }, 1000);

        return () => clearInterval(interval);
    }, []);

    // 自动跟随：默认始终滚到底部，用户手动上滚时取消，滚回底部或点按钮恢复
    const autoFollowRef = useRef(true);
    const [showScrollBtn, setShowScrollBtn] = useState(false);

    // 监听用户滚动：判断是否在底部附近
    const handleScroll = () => {
        const container = logsContainerRef.current;
        if (!container) return;
        const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 40;
        autoFollowRef.current = isAtBottom;
        setShowScrollBtn(!isAtBottom && logs.length > 0);
    };

    // 日志更新时，如果在跟随模式就滚到底部
    useEffect(() => {
        if (autoFollowRef.current && logsEndRef.current) {
            logsEndRef.current.scrollIntoView({ behavior: 'auto' });
        }
    }, [logs]);

    // 点击按钮回到底部并恢复跟随
    const scrollToBottom = () => {
        autoFollowRef.current = true;
        setShowScrollBtn(false);
        logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    // Start/Stop server
    const handleToggleServer = async () => {
        if (isRunning) {
            if (window.electron?.stopLocalModelServer) {
                await window.electron.stopLocalModelServer();
                setIsRunning(false);
            }
        } else {
            if (!modelFilePath) return;
            if (window.electron?.startLocalModelServer) {
                // 启动新服务：清空日志并重置自动滚动
                setLogs([]);
                autoFollowRef.current = true;
                setShowScrollBtn(false);
                const result = await window.electron.startLocalModelServer({
                    modelPath: modelFilePath,
                    port: serverPort,
                    gpuLayers,
                    contextSize
                });
                if (result.success) {
                    setIsRunning(true);
                } else {
                    setLogs(prev => [...prev, `[Error] ${result.error}`]);
                }
            }
        }
    };

    // 复制指定 endpoint
    const handleCopyEndpoint = (path: string) => {
        navigator.clipboard.writeText(`http://127.0.0.1:${serverPort}${path}`);
        setCopied(path);
        setTimeout(() => setCopied(''), 2000);
    };

    return (
        <div className={`flex flex-col h-full ${className || ''}`}>


            {/* ===== Control Area ===== */}
            <div className="px-4 py-4 border-b border-cyber-border/50 space-y-4">
                {/* Current model display */}
                <div className="flex items-center gap-2 font-mono text-base">
                    <span className="text-cyber-text-secondary">{t('server.selectModel')}</span>
                    {modelFilePath ? (
                        <>
                            <span className="text-cyber-accent font-bold truncate">{modelInfo.name}</span>
                            {modelInfo.quant && (
                                <span className="text-cyber-accent font-bold flex-shrink-0">{modelInfo.quant}</span>
                            )}
                        </>
                    ) : (
                        <span className="text-cyber-text-muted/70 italic">{t('server.selectFromPanel')} →</span>
                    )}
                </div>

                {/* Parameter row */}
                <div className="grid grid-cols-3 gap-3">
                    <div className="flex items-center gap-2">
                        <label className="text-sm text-cyber-text-secondary font-mono font-bold tracking-wider flex-shrink-0">{t('server.compute')}</label>
                        <MiniSelect
                            value={String(gpuLayers)}
                            onChange={(v) => setGpuLayers(Number(v))}
                            disabled={isRunning || !isNvidia}
                            options={isNvidia ? [
                                { id: '-1', label: t('server.gpuFull') },
                                { id: '0', label: t('server.cpuOnly') },
                            ] : [
                                { id: '0', label: `🚫 ${t('server.cpuOnly')}` },
                            ]}
                            className="flex-1"
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <label className="text-sm text-cyber-text-secondary font-mono font-bold tracking-wider flex-shrink-0">{t('server.context')}</label>
                        <MiniSelect
                            value={String(contextSize)}
                            onChange={(v) => setContextSize(Number(v))}
                            disabled={isRunning}
                            options={[
                                { id: '2048', label: `2K · ${t('quant.light')}` },
                                { id: '4096', label: `4K · ${t('quant.standard')}` },
                                { id: '8192', label: `8K · ${t('quant.extended')}` },
                                { id: '16384', label: `16K · ${t('quant.large')}` },
                                { id: '32768', label: `32K · ${t('quant.maximum')}` },
                            ]}
                            className="flex-1"
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <label className="text-sm text-cyber-text-secondary font-mono font-bold tracking-wider flex-shrink-0">{t('server.port')}</label>
                        <MiniSelect
                            value={String(serverPort)}
                            onChange={(v) => {
                                if (v === 'random') {
                                    setServerPort(10000 + Math.floor(Math.random() * 50000));
                                } else {
                                    setServerPort(Number(v));
                                }
                            }}
                            disabled={isRunning}
                            options={[
                                { id: String(serverPort), label: String(serverPort) },
                                { id: 'random', label: '🎲 Random' },
                            ]}
                            className="flex-1"
                        />
                    </div>
                </div>

                {/* Start button */}
                <button
                    onClick={handleToggleServer}
                    disabled={!modelFilePath}
                    className={`w-full py-3 font-bold text-base tracking-[0.3em] font-mono transition-all flex items-center justify-center gap-2 ${!modelFilePath
                        ? 'bg-cyber-border/30 text-cyber-text-muted/50 cursor-not-allowed border border-cyber-border/30'
                        : isRunning
                            ? 'bg-red-500/10 text-red-400 border border-red-500/50 hover:bg-red-500/20 shadow-[0_0_15px_rgba(239,68,68,0.15)]'
                            : 'bg-cyber-accent/10 text-cyber-accent border border-cyber-accent/50 hover:bg-cyber-accent/20 shadow-[0_0_15px_rgba(0,255,157,0.15)]'
                        }`}
                >
                    {isRunning ? (
                        <><Square className="w-3.5 h-3.5 fill-current" /> {t('btn.stop')}</>
                    ) : (
                        <><Play className="w-3.5 h-3.5 fill-current" /> {t('btn.start')}</>
                    )}
                </button>
            </div>

            {/* ===== Terminal Output ===== */}
            <div className="flex-1 flex flex-col overflow-hidden">
                {/* Terminal header */}
                <div className="flex items-center justify-between px-4 py-2 border-b border-cyber-border/30 flex-shrink-0">
                    <div className="flex items-center gap-2 text-sm font-mono text-cyber-text-secondary">
                        <Terminal className="w-3 h-3" />
                        <span>{t('server.stdout')}</span>
                    </div>

                </div>

                {/* Log area */}
                <div className="relative flex-1">
                    <div ref={logsContainerRef} onScroll={handleScroll} className="absolute inset-0 overflow-y-auto px-4 py-3 bg-cyber-terminal font-mono text-sm space-y-0.5 custom-scrollbar">
                        {logs.length === 0 && (
                            <div className="flex items-center justify-center h-full">
                                <div className="font-mono text-center space-y-3">
                                    <div className="text-lg text-cyber-text-secondary/80">{'>'} {t('server.awaitingInit')}</div>
                                    <div className="text-base text-cyber-text-muted/70">{t('server.selectConfigStart')}</div>
                                </div>
                            </div>
                        )}
                        {logs.map((log, i) => (
                            <div key={i} className="leading-relaxed">
                                <span className="text-cyber-text-muted/60 select-none mr-2">$</span>
                                <span className={log.includes('[Error]') || log.includes('[ERR]') ? 'text-red-400' : 'text-cyber-text/80'}>
                                    {log}
                                </span>
                            </div>
                        ))}
                        <div ref={logsEndRef} />
                    </div>
                    {/* 回到底部按钮 */}
                    {showScrollBtn && (
                        <button
                            onClick={scrollToBottom}
                            className="absolute bottom-3 right-3 w-7 h-7 flex items-center justify-center bg-cyber-bg/90 border border-cyber-border/50 rounded text-cyber-text-secondary hover:text-cyber-accent hover:border-cyber-accent/50 transition-colors"
                        >
                            <ChevronDown className="w-4 h-4" />
                        </button>
                    )}
                </div>
            </div>

            {/* ===== Runtime Status Bar ===== */}
            {isRunning && (
                <div className="flex items-center gap-4 px-4 py-2 border-t border-cyber-border/20 text-xs font-mono">
                    <div
                        className="flex items-center gap-1.5 cursor-pointer hover:text-cyber-accent transition-colors"
                        onClick={() => handleCopyEndpoint('/v1')}
                    >
                        <span className="text-cyber-text-secondary/80">OpenAI:</span>
                        <code className="text-cyber-accent/80">127.0.0.1:{serverPort}/v1</code>
                        <span className="text-cyber-accent ml-1">{copied === '/v1' ? t('btn.copied') : t('btn.copy')}</span>
                    </div>
                    <span className="text-cyber-border">|</span>
                    <div
                        className="flex items-center gap-1.5 cursor-pointer hover:text-cyber-accent transition-colors"
                        onClick={() => handleCopyEndpoint('/anthropic')}
                    >
                        <span className="text-cyber-text-secondary/80">Anthropic:</span>
                        <code className="text-cyber-accent/80">127.0.0.1:{serverPort}/anthropic</code>
                        <span className="text-cyber-accent ml-1">{copied === '/anthropic' ? t('btn.copied') : t('btn.copy')}</span>
                    </div>
                </div>
            )}
        </div>
    );
};
