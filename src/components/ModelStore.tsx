
import React, { useState, useEffect, useCallback } from 'react';
import { Download, X, Loader, HardDrive, Pause, Play } from 'lucide-react';
import { useConfirm } from './ConfirmDialog';
import { useDownload } from './DownloadContext';
import { useI18n } from '../hooks/useI18n';

// Quantization variant info
interface ModelVariant {
    quantization: string;
    fileName: string;
    fileSize: number;
    recommendedVRAM: string;
}

// Store model item
interface StoreModel {
    id: string;
    name: string;
    icon: string;
    description: string;
    huggingfaceRepo: string;
    variants: ModelVariant[];
}

// Downloaded model
interface DownloadedModel {
    fileName: string;
    filePath: string;
    fileSize: number;
}



interface ModelStoreProps {
    onSelectModel?: (filePath: string) => void;
}

// Format file size
function formatSize(bytes: number): string {
    if (bytes >= 1e9) return (bytes / 1e9).toFixed(1) + ' GB';
    if (bytes >= 1e6) return (bytes / 1e6).toFixed(0) + ' MB';
    return (bytes / 1e3).toFixed(0) + ' KB';
}

// Parse VRAM string to number (GB)
function parseVRAM(vram: string): number {
    const match = vram.match(/([\d.]+)\s*GB/i);
    return match ? parseFloat(match[1]) : 0;
}

// VRAM adaptation label - dynamically calculated based on user's actual GPU VRAM
function getVRAMLabel(vramStr: string, userVRAM: number, t: (key: any) => string): { label: string; color: string } {
    const required = parseVRAM(vramStr);
    if (userVRAM <= 0 || required <= 0) return { label: '—', color: 'text-cyber-text-muted' };
    const ratio = required / userVRAM;
    if (ratio <= 0.6) return { label: t('vram.easy'), color: 'text-green-500' };
    if (ratio <= 0.85) return { label: t('vram.good'), color: 'text-yellow-500' };
    if (ratio <= 1.0) return { label: t('vram.tight'), color: 'text-red-500' };
    return { label: t('vram.heavy'), color: 'text-red-500' };
}

// Known model names (for automatic icon detection)
const KNOWN_MODELS = ['qwen', 'llama', 'deepseek', 'mistral', 'phi', 'gemma', 'yi', 'internlm', 'glm', 'chatglm', 'baichuan', 'codestral', 'mixtral', 'wizardlm', 'vicuna', 'falcon'];

// Guess icon from file name
function guessIconFromFileName(fileName: string): string | null {
    const lower = fileName.toLowerCase();
    for (const name of KNOWN_MODELS) {
        if (lower.includes(name)) return name;
    }
    return null;
}

// Local model group structure (for LOCAL tab)
interface LocalModelGroup {
    modelName: string;        // Displayed model name (e.g. "Qwen3 8B")
    icon: string | null;      // Icon name
    description: string;      // Description
    sourceDir: string;        // Parent directory
    variants: {
        quantization: string; // Quantization name
        fileName: string;
        filePath: string;
        fileSize: number;
        recommendedVRAM: string;
    }[];
}

export const ModelStore: React.FC<ModelStoreProps> = ({ onSelectModel }) => {
    const { t } = useI18n();
    const confirm = useConfirm();
    const { downloads, startDownload, pauseDownload, cancelDownload } = useDownload();
    const [storeModels, setStoreModels] = useState<StoreModel[]>([]);
    const [downloadedModels, setDownloadedModels] = useState<DownloadedModel[]>([]);
    const [expandedModelId, setExpandedModelId] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'local' | 'store'>('local');

    // 切换到 LOCAL tab 时刷新已下载列表（手动删除文件后能即时反映）
    useEffect(() => {
        if (activeTab === 'local') {
            window.electron?.getDownloadedModels?.().then((downloaded: DownloadedModel[]) => {
                setDownloadedModels(downloaded);
            });
        }
    }, [activeTab]);
    const [modelsDirs, setModelsDirs] = useState<string[]>([]);
    // GPU VRAM (Auto-detect + Cache)
    const [gpuInfo, setGpuInfo] = useState<{ name: string; vramGB: number }>({ name: '', vramGB: 0 });
    // Currently selected model filename (Single selection)
    const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
    // LOCAL tab expanded group
    const [expandedLocalGroup, setExpandedLocalGroup] = useState<string | null>(null);
    // Delete mode (Directory level operation)
    const [isDeleteMode, setIsDeleteMode] = useState(false);
    const [deleteSelection, setDeleteSelection] = useState<Set<string>>(new Set());
    // 下载保存目录（独立于扫描目录）
    const [downloadDir, setDownloadDir] = useState<string>('');

    // Load model list and downloaded models
    const loadData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [models, downloaded] = await Promise.all([
                window.electron?.getStoreModels?.() || [],
                window.electron?.getDownloadedModels?.() || []
            ]);
            setStoreModels(models);
            setDownloadedModels(downloaded);
            const dirs = await window.electron?.getModelsDir?.() || [];
            setModelsDirs(dirs);
            // 加载下载保存目录
            const dlDir = await window.electron?.getDownloadDir?.() || '';
            setDownloadDir(dlDir);
            // Auto-detect GPU info (First time via systeminformation, then cache)
            const gpu = await window.electron?.getGpuInfo?.() || { name: 'Unknown', vramGB: 0 };
            setGpuInfo(gpu);
        } catch (e) {
            console.error('[ModelStore] 加载失败:', e);
        }
        setIsLoading(false);
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // 下载状态变化时刷新已下载列表
    useEffect(() => {
        const hasStateChange = Array.from(downloads.values()).some(
            d => d.status === 'completed' || d.status === 'cancelled'
        );
        if (hasStateChange) {
            window.electron?.getDownloadedModels?.().then((downloaded: DownloadedModel[]) => {
                setDownloadedModels(downloaded);
            });
        }
    }, [downloads]);

    // Check if file is downloaded
    const isDownloaded = (fileName: string) => downloadedModels.some(d => d.fileName === fileName);

    // Get downloaded file path
    const getDownloadedPath = (fileName: string) =>
        downloadedModels.find(d => d.fileName === fileName)?.filePath || '';

    // Select a variant and notify parent
    const handleSelectVariant = (fileName: string) => {
        setSelectedFileName(fileName);
        const filePath = getDownloadedPath(fileName);
        if (filePath) onSelectModel?.(filePath);
    };

    // ========== LOCAL Tab: Group downloaded models by model name ==========
    const buildLocalGroups = (): LocalModelGroup[] => {
        const groups: Record<string, LocalModelGroup> = {};

        for (const dm of downloadedModels) {
            // Find which directory the file belongs to
            const sourceDir = modelsDirs.find(d => dm.filePath.replace(/\\/g, '/').startsWith(d.replace(/\\/g, '/'))) || '';

            // Try to match from store config
            let matched = false;
            for (const model of storeModels) {
                const variant = model.variants.find(v => v.fileName === dm.fileName);
                if (variant) {
                    if (!groups[model.id]) {
                        groups[model.id] = {
                            modelName: model.name,
                            icon: model.icon,
                            description: model.description,
                            sourceDir,
                            variants: []
                        };
                    }
                    groups[model.id].variants.push({
                        quantization: variant.quantization,
                        fileName: dm.fileName,
                        filePath: dm.filePath,
                        fileSize: dm.fileSize,
                        recommendedVRAM: variant.recommendedVRAM,
                    });
                    matched = true;
                    break;
                }
            }

            // No match in store -> Group by filename automatically
            if (!matched) {
                const baseName = dm.fileName
                    .replace(/\.gguf$/i, '')
                    .replace(/[-.](?:q[0-9_]+[a-z_]*|f16|f32|fp16|bf16)$/i, '');
                const groupKey = `local_${baseName}`;
                const qMatch = dm.fileName.match(/[-.]([Qq][0-9_]+[A-Za-z_]*)/);
                const quantization = qMatch ? qMatch[1].toUpperCase() : 'Unknown';

                if (!groups[groupKey]) {
                    const displayName = baseName
                        .replace(/[-_]/g, ' ')
                        .replace(/\b\w/g, c => c.toUpperCase());
                    groups[groupKey] = {
                        modelName: displayName,
                        icon: guessIconFromFileName(dm.fileName),
                        description: dm.fileName,
                        sourceDir,
                        variants: []
                    };
                }
                const estimatedVRAM = (dm.fileSize / 1024 / 1024 / 1024 + 0.5).toFixed(1) + ' GB';
                groups[groupKey].variants.push({
                    quantization,
                    fileName: dm.fileName,
                    filePath: dm.filePath,
                    fileSize: dm.fileSize,
                    recommendedVRAM: estimatedVRAM,
                });
            }
        }

        return Object.values(groups);
    };

    if (isLoading) {
        return (
            <div className="flex flex-col h-full">
                <div className="p-2 border-b border-cyber-border bg-cyber-surface flex items-center gap-2">
                    <HardDrive className="w-4 h-4 text-cyber-accent" />
                    <span className="text-xs font-bold text-cyber-accent">MODEL STORE</span>
                </div>
                <div className="flex-1 flex items-center justify-center">
                    <Loader className="w-5 h-5 text-cyber-accent animate-spin" />
                </div>
            </div>
        );
    }

    const localGroups = buildLocalGroups();

    return (
        <div className="flex flex-col h-full">
            {/* Tab Header */}
            <div className="p-2 flex items-center justify-between bg-transparent">
                <div className="flex gap-1">
                    <button
                        onClick={() => setActiveTab('local')}
                        className={`px-3 py-1.5 text-xs font-bold rounded transition-colors ${activeTab === 'local'
                            ? 'bg-cyber-accent text-black'
                            : 'text-cyber-text-secondary hover:text-cyber-text'
                            }`}
                    >
                        {t('server.local')}
                    </button>
                    <button
                        onClick={() => setActiveTab('store')}
                        className={`px-3 py-1.5 text-xs font-bold rounded transition-colors ${activeTab === 'store'
                            ? 'bg-cyan-400 text-black'
                            : 'text-cyber-text-secondary hover:text-cyber-text'
                            }`}
                    >
                        {t('server.store')}
                    </button>
                </div>
                {/* GPU Info */}
                {gpuInfo.vramGB > 0 && (
                    <span className="text-[10px] text-green-500 font-mono truncate max-w-[140px]">
                        {gpuInfo.name} {gpuInfo.vramGB}G
                    </span>
                )}
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-4">

                {/* ===== LOCAL Tab: Group by model + Variant single selection ===== */}
                {activeTab === 'local' && (
                    <>
                        {/* Directory Management Toolbar */}
                        <div className="flex items-center gap-2 mb-3">
                            {!isDeleteMode ? (
                                <>
                                    <button
                                        onClick={async () => {
                                            const result = await window.electron?.addModelsDir?.();
                                            if (result?.success) {
                                                setModelsDirs(result.dirs || []);
                                                loadData();
                                            }
                                        }}
                                        className="text-[10px] font-mono font-bold text-green-500/70 hover:text-green-400 transition-colors"
                                    >
                                        {t('store.add')}
                                    </button>
                                    {localGroups.length > 0 && (
                                        <button
                                            onClick={() => {
                                                setIsDeleteMode(true);
                                                setDeleteSelection(new Set());
                                            }}
                                            className="text-[10px] font-mono font-bold text-red-500/50 hover:text-red-400 transition-colors ml-auto"
                                        >
                                            {t('store.del')}
                                        </button>
                                    )}
                                </>
                            ) : (
                                <>
                                    <button
                                        onClick={() => {
                                            setIsDeleteMode(false);
                                            setDeleteSelection(new Set());
                                        }}
                                        className="text-[10px] font-mono font-bold text-cyber-text-secondary hover:text-cyber-text transition-colors"
                                    >
                                        {t('store.cancel')}
                                    </button>
                                    <button
                                        onClick={async () => {
                                            if (deleteSelection.size === 0) return;
                                            const ok = await confirm({
                                                title: t('server.removeDirectories'),
                                                message: `${t('server.removeDirectoryConfirm')}`,
                                                confirmText: t('btn.remove'),
                                                cancelText: t('btn.cancel'),
                                                type: 'danger'
                                            });
                                            if (!ok) return;
                                            for (const dir of deleteSelection) {
                                                await window.electron?.removeModelsDir?.(dir);
                                            }
                                            const dirs = await window.electron?.getModelsDir?.() || [];
                                            setModelsDirs(dirs);
                                            setIsDeleteMode(false);
                                            setDeleteSelection(new Set());
                                            loadData();
                                        }}
                                        disabled={deleteSelection.size === 0}
                                        className={`text-[10px] font-mono font-bold transition-colors ml-auto ${deleteSelection.size > 0
                                            ? 'text-red-400 hover:text-red-300'
                                            : 'text-cyber-text-secondary/50 cursor-not-allowed'
                                            }`}
                                    >
                                        [{t('store.remove')}({deleteSelection.size})]
                                    </button>
                                </>
                            )}
                        </div>

                        {localGroups.length > 0 ? (
                            <div className="space-y-2">
                                {localGroups.map(group => {
                                    const groupKey = group.modelName;
                                    const isExpanded = expandedLocalGroup === groupKey;
                                    const selected = group.variants.find(v => v.fileName === selectedFileName);
                                    const isGroupSelected = isDeleteMode && deleteSelection.has(group.sourceDir);

                                    return (
                                        <div
                                            key={groupKey}
                                            className={`p-3 border rounded transition-all ${isDeleteMode
                                                ? (isGroupSelected
                                                    ? 'border-red-500/50 bg-red-500/5'
                                                    : 'border-cyber-border hover:border-red-500/30')
                                                : (selected
                                                    ? 'border-green-500/50 bg-green-500/5'
                                                    : 'border-cyber-border hover:border-green-500/30')
                                                }`}
                                        >
                                            {/* Card Header */}
                                            <div
                                                className="flex items-center gap-3 cursor-pointer"
                                                onClick={() => {
                                                    if (isDeleteMode) {
                                                        // Delete mode: Toggle directory selection
                                                        if (group.sourceDir) {
                                                            setDeleteSelection(prev => {
                                                                const next = new Set(prev);
                                                                if (next.has(group.sourceDir)) next.delete(group.sourceDir);
                                                                else next.add(group.sourceDir);
                                                                return next;
                                                            });
                                                        }
                                                    } else {
                                                        // Normal mode: Expand/Collapse
                                                        setExpandedLocalGroup(isExpanded ? null : groupKey);
                                                    }
                                                }}
                                            >
                                                {/* Card selector: Normal=Green Circle / Delete=Red Square */}
                                                {isDeleteMode ? (
                                                    <div className={`w-4 h-4 rounded-sm border-2 flex items-center justify-center flex-shrink-0 transition-colors ${isGroupSelected ? 'border-red-400 bg-red-400' : 'border-cyber-border hover:border-red-400/50'
                                                        }`}>
                                                        {isGroupSelected && (
                                                            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                            </svg>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${selected ? 'border-green-400' : 'border-cyber-border'
                                                        }`}>
                                                        {selected && <div className="w-2 h-2 rounded-full bg-green-400" />}
                                                    </div>
                                                )}

                                                {/* Icon */}
                                                {group.icon ? (
                                                    <img
                                                        src={`./icons/models/${group.icon}.svg`}
                                                        alt={group.modelName}
                                                        className="w-6 h-6 flex-shrink-0"
                                                        onError={(e) => {
                                                            (e.target as HTMLImageElement).style.display = 'none';
                                                        }}
                                                    />
                                                ) : (
                                                    <HardDrive className="w-6 h-6 text-cyber-text-secondary flex-shrink-0" />
                                                )}

                                                {/* Name + Description */}
                                                <div className="flex-1 min-w-0 flex flex-col justify-center h-10">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <div className={`text-sm font-bold truncate leading-none ${isDeleteMode ? 'text-red-400/80' : ''}`}>
                                                            {group.modelName}
                                                        </div>
                                                        {!isDeleteMode && (
                                                            selected ? (
                                                                <span className="text-[10px] text-green-400 flex-shrink-0 font-mono font-bold">
                                                                    {selected.quantization}
                                                                </span>
                                                            ) : (
                                                                <span className="text-[10px] text-cyber-text-secondary flex-shrink-0">
                                                                    {group.variants.length} {t('store.ver')}
                                                                </span>
                                                            )
                                                        )}
                                                    </div>
                                                    <div className="text-[10px] text-cyber-text-secondary truncate leading-tight mt-1 opacity-70">
                                                        {group.sourceDir}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Expand: Variant List (Normal Mode Only) */}
                                            {isExpanded && !isDeleteMode && (
                                                <div className="mt-3 pt-3 border-t border-cyber-border/30 space-y-1">
                                                    {group.variants.map(v => {
                                                        const isSelected = selectedFileName === v.fileName;
                                                        const vramInfo = v.recommendedVRAM ? getVRAMLabel(v.recommendedVRAM, gpuInfo.vramGB, t) : null;

                                                        return (
                                                            <div
                                                                key={v.fileName}
                                                                className={`flex items-center gap-3 p-2 rounded cursor-pointer transition-colors ${isSelected ? 'bg-green-500/10' : 'hover:bg-cyber-surface/30'
                                                                    }`}
                                                                onClick={() => handleSelectVariant(v.fileName)}
                                                            >
                                                                {/* Quantization Name */}
                                                                <span className={`text-xs font-mono font-bold w-14 flex-shrink-0 ${isSelected ? 'text-green-400' : 'text-cyber-accent'}`}>
                                                                    {v.quantization}
                                                                </span>

                                                                {/* VRAM · 大小 */}
                                                                <span className="text-[10px] text-cyber-text-secondary flex-1 whitespace-nowrap">
                                                                    {v.recommendedVRAM ? `${v.recommendedVRAM} · ` : ''}{formatSize(v.fileSize)}
                                                                </span>

                                                                {/* VRAM Adaptation Label */}
                                                                {vramInfo && (
                                                                    <span className={`text-[10px] font-bold flex-shrink-0 w-12 text-center ${vramInfo.color}`}>
                                                                        {vramInfo.label}
                                                                    </span>
                                                                )}

                                                                {/* Radio Button */}
                                                                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${isSelected ? 'border-green-400' : 'border-cyber-border hover:border-green-400/50'
                                                                    }`}>
                                                                    {isSelected && <div className="w-2 h-2 rounded-full bg-green-400" />}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="text-center py-10">
                                <HardDrive className="w-8 h-8 text-cyber-text-secondary mx-auto mb-3 opacity-50" />
                                <p className="text-sm text-cyber-text-secondary">{t('server.selectModelDir')}</p>
                                <p className="text-[10px] text-cyber-text-secondary mt-1 opacity-70">{t('server.downloadFromStore')}</p>
                            </div>
                        )}
                    </>
                )}

                {/* ===== STORE Tab: Model Store (Focus on size and VRAM) ===== */}
                {activeTab === 'store' && (
                    <>
                        {/* Download directory path */}
                        {downloadDir && (
                            <div
                                className="mb-3 text-[10px] text-cyber-accent-secondary p-2 bg-cyber-accent-secondary/10 rounded truncate cursor-pointer hover:bg-cyber-accent-secondary/20 transition-colors"
                                onClick={async () => {
                                    const ok = await confirm({
                                        title: t('download.changePath'),
                                        message: t('download.selectNewDir'),
                                        confirmText: t('btn.select'),
                                        cancelText: t('btn.cancel'),
                                    });
                                    if (!ok) return;
                                    const result = await window.electron?.setDownloadDir?.();
                                    if (result?.success && result.dir) {
                                        setDownloadDir(result.dir);
                                    }
                                }}
                            >
                                {t('download.location')} {downloadDir}
                            </div>
                        )}
                        <div className="space-y-2">
                            {storeModels.map(model => {
                                const isExpanded = expandedModelId === model.id;
                                const hasDownloaded = model.variants.some(v => isDownloaded(v.fileName));

                                return (
                                    <div
                                        key={model.id}
                                        className={`p-3 border rounded cursor-pointer transition-all ${isExpanded
                                            ? 'border-cyber-accent-secondary bg-cyber-accent-secondary/5'
                                            : hasDownloaded
                                                ? 'border-cyber-accent-secondary/30 hover:border-cyber-accent-secondary/50'
                                                : 'border-cyber-border hover:border-cyber-accent-secondary/50'
                                            }`}
                                        onClick={() => setExpandedModelId(isExpanded ? null : model.id)}
                                    >
                                        {/* Card Header */}
                                        <div className="flex items-center gap-3">
                                            <img
                                                src={`./icons/models/${model.icon}.svg`}
                                                alt={model.name}
                                                className="w-6 h-6 flex-shrink-0"
                                                onError={(e) => {
                                                    const target = e.target as HTMLImageElement;
                                                    target.style.display = 'none';
                                                    target.parentElement!.insertAdjacentHTML('afterbegin',
                                                        `<span class="w-6 h-6 flex items-center justify-center text-xs font-bold text-cyber-accent-secondary bg-cyber-surface rounded">${model.name[0]}</span>`
                                                    );
                                                }}
                                            />
                                            <div className="flex-1 min-w-0 flex flex-col justify-center">
                                                <div className="flex items-center justify-between gap-2">
                                                    <div className="text-sm font-bold truncate leading-none text-cyber-accent-secondary flex-1 min-w-0">{model.name}</div>
                                                    {hasDownloaded && (
                                                        <span className="text-[10px] text-cyber-accent-secondary flex-shrink-0">{t('store.ready')}</span>
                                                    )}
                                                </div>
                                                <div className="text-[10px] text-cyber-text-secondary truncate leading-tight mt-1 opacity-70">
                                                    {model.description}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Expand Area: Quantization Variants + Download */}
                                        {isExpanded && (
                                            <div className="mt-3 pt-3 border-t border-cyber-border/30 space-y-1">
                                                {model.variants.map(variant => {
                                                    const variantDownloaded = isDownloaded(variant.fileName);
                                                    const dlItem = downloads.get(variant.fileName);
                                                    const isActiveDownload = dlItem?.status === 'downloading';
                                                    const isPaused = dlItem?.status === 'paused';
                                                    const vramInfo = getVRAMLabel(variant.recommendedVRAM, gpuInfo.vramGB, t);

                                                    return (
                                                        <div
                                                            key={variant.quantization}
                                                            className={`flex items-center gap-3 p-2 rounded transition-colors ${variantDownloaded
                                                                ? 'bg-cyber-accent-secondary/5' : 'hover:bg-cyber-surface/30'
                                                                }`}
                                                        >
                                                            {/* 量化版本 — 固定列宽 */}
                                                            <span className="text-xs font-mono font-bold text-cyber-accent-secondary w-14 flex-shrink-0">
                                                                {variant.quantization}
                                                            </span>

                                                            {/* 显存 + 大小 — 弹性填充 */}
                                                            <span className="text-[10px] text-cyber-text-secondary flex-1 whitespace-nowrap">
                                                                {variant.recommendedVRAM} · {formatSize(variant.fileSize)}
                                                            </span>

                                                            {/* VRAM 适配标签 — 固定列宽，居中 */}
                                                            <span className={`text-[10px] font-bold flex-shrink-0 w-10 text-center ${vramInfo.color}`}>
                                                                {vramInfo.label}
                                                            </span>

                                                            {/* 操作按钮 — 固定列宽，居中对齐 */}
                                                            <div className="flex-shrink-0 w-5 flex items-center justify-center">
                                                                {variantDownloaded ? (
                                                                    <span className="text-cyber-accent-secondary text-sm">✓</span>
                                                                ) : isActiveDownload ? (
                                                                    /* 下载中：暂停 + 取消 */
                                                                    <div className="flex items-center gap-1">
                                                                        <button
                                                                            onClick={(e) => { e.stopPropagation(); pauseDownload(); }}
                                                                            className="text-cyber-accent-secondary hover:text-yellow-400 transition-colors"

                                                                        >
                                                                            <Pause className="w-3.5 h-3.5" />
                                                                        </button>
                                                                        <button
                                                                            onClick={(e) => { e.stopPropagation(); cancelDownload(); }}
                                                                            className="text-cyber-text-muted hover:text-red-400 transition-colors"

                                                                        >
                                                                            <X className="w-3.5 h-3.5" />
                                                                        </button>
                                                                    </div>
                                                                ) : isPaused ? (
                                                                    /* 暂停中：继续 + 取消 */
                                                                    <div className="flex items-center gap-1">
                                                                        <button
                                                                            onClick={(e) => { e.stopPropagation(); startDownload(model.huggingfaceRepo, variant.fileName); }}
                                                                            className="text-cyber-accent-secondary hover:text-green-400 transition-colors"

                                                                        >
                                                                            <Play className="w-3.5 h-3.5" />
                                                                        </button>
                                                                        <button
                                                                            onClick={(e) => { e.stopPropagation(); cancelDownload(variant.fileName); }}
                                                                            className="text-cyber-text-muted hover:text-red-400 transition-colors"

                                                                        >
                                                                            <X className="w-3.5 h-3.5" />
                                                                        </button>
                                                                    </div>
                                                                ) : dlItem?.status === 'error' ? (
                                                                    <button
                                                                        onClick={(e) => { e.stopPropagation(); startDownload(model.huggingfaceRepo, variant.fileName); }}
                                                                        className="text-red-400 hover:text-red-300 transition-colors"

                                                                    >
                                                                        <Download className="w-4 h-4" />
                                                                    </button>
                                                                ) : (
                                                                    <button
                                                                        onClick={(e) => { e.stopPropagation(); startDownload(model.huggingfaceRepo, variant.fileName); }}
                                                                        className="text-cyber-text-secondary hover:text-cyber-accent-secondary transition-colors"
                                                                    >
                                                                        <Download className="w-4 h-4" />
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </>
                )}
            </div >
        </div >
    );
};
