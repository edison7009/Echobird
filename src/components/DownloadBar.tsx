// 全局下载进度条 — 底部状态栏
import React from 'react';
import { Download, X, Check, AlertTriangle, Pause, Play } from 'lucide-react';
import { useDownload, DownloadItem } from './DownloadContext';
import { useI18n } from '../hooks/useI18n';

// 格式化文件大小
function formatSize(bytes: number): string {
    if (bytes >= 1e9) return (bytes / 1e9).toFixed(1) + ' GB';
    if (bytes >= 1e6) return (bytes / 1e6).toFixed(0) + ' MB';
    if (bytes >= 1e3) return (bytes / 1e3).toFixed(0) + ' KB';
    return bytes + ' B';
}

// 缩短文件名显示
function shortenFileName(name: string, maxLen = 32): string {
    if (name.length <= maxLen) return name;
    const ext = name.lastIndexOf('.');
    if (ext > 0) {
        const base = name.slice(0, ext);
        const extension = name.slice(ext);
        const keep = maxLen - extension.length - 3;
        return base.slice(0, keep) + '...' + extension;
    }
    return name.slice(0, maxLen - 3) + '...';
}

// 单个下载项
const DownloadItemRow: React.FC<{
    item: DownloadItem;
    onPause?: () => void;
    onResume?: () => void;
    onCancel?: (fileName?: string) => void;
}> = ({ item, onPause, onResume, onCancel }) => {
    const { t } = useI18n();
    const isActive = item.status === 'downloading';
    const isDone = item.status === 'completed';
    const isError = item.status === 'error';
    const isPaused = item.status === 'paused';

    return (
        <div className="flex items-center gap-3 h-full min-w-0">
            {/* 图标 */}
            {isActive && <Download className="w-3.5 h-3.5 text-cyber-accent flex-shrink-0 animate-pulse" />}
            {isPaused && <Pause className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" />}
            {isDone && <Check className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />}
            {isError && <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />}

            {/* 文件名 */}
            <span className={`text-[11px] font-mono truncate min-w-0 ${isDone ? 'text-green-400' : isError ? 'text-red-400' : isPaused ? 'text-yellow-400' : 'text-cyber-text'
                }`}>
                {shortenFileName(item.fileName)}
            </span>

            {/* 进度条（下载中或暂停时显示） */}
            {(isActive || isPaused) && (
                <div className="flex items-center gap-2 flex-shrink-0">
                    {/* 进度条轨道 */}
                    <div className="w-24 h-1.5 bg-cyber-border/50 rounded-full overflow-hidden">
                        <div
                            className={`h-full rounded-full transition-all duration-300 ${isPaused ? 'bg-yellow-400' : 'bg-cyber-accent'}`}
                            style={{ width: `${item.progress}%` }}
                        />
                    </div>
                    {/* 百分比 */}
                    <span className={`text-[10px] font-mono w-8 text-right ${isPaused ? 'text-yellow-400' : 'text-cyber-accent'}`}>
                        {item.progress}%
                    </span>
                    {/* 已下载/总大小 */}
                    <span className="text-[10px] font-mono text-cyber-text-secondary">
                        {formatSize(item.downloaded)}/{formatSize(item.total)}
                    </span>
                </div>
            )}

            {/* 完成状态文字 */}
            {isDone && (
                <span className="text-[10px] font-mono text-green-400/70 flex-shrink-0">
                    {t('status.complete')}
                </span>
            )}

            {/* 暂停状态文字 */}
            {isPaused && (
                <span className="text-[10px] font-mono text-yellow-400/70 flex-shrink-0">
                    {t('status.paused')}
                </span>
            )}

            {/* 错误状态文字 */}
            {isError && (
                <span className="text-[10px] font-mono text-red-400/70 flex-shrink-0">
                    {t('status.failed')}
                </span>
            )}

            {/* 操作按钮 */}
            <div className="flex items-center gap-1 flex-shrink-0 ml-auto">
                {/* 下载中：暂停按钮 */}
                {isActive && onPause && (
                    <button
                        onClick={onPause}
                        className="text-cyber-text-secondary/50 hover:text-yellow-400 transition-colors"

                    >
                        <Pause className="w-3.5 h-3.5" />
                    </button>
                )}
                {/* 暂停中：继续按钮 */}
                {isPaused && onResume && (
                    <button
                        onClick={onResume}
                        className="text-cyber-text-secondary/50 hover:text-green-400 transition-colors"

                    >
                        <Play className="w-3.5 h-3.5" />
                    </button>
                )}
                {/* 下载中或暂停中：取消按钮 */}
                {(isActive || isPaused) && onCancel && (
                    <button
                        onClick={() => onCancel(item.fileName)}
                        className="text-cyber-text-secondary/50 hover:text-red-400 transition-colors"

                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                )}
            </div>
        </div>
    );
};

export const DownloadBar: React.FC = () => {
    const { downloads, startDownload, pauseDownload, cancelDownload } = useDownload();
    const { t } = useI18n();

    // 无下载任务时完全隐藏
    if (downloads.size === 0) return null;

    // 获取所有下载项，按状态排序：downloading > paused > error > completed
    const items = Array.from(downloads.values()).sort((a, b) => {
        const order: Record<string, number> = { downloading: 0, paused: 1, error: 2, completed: 3, cancelled: 4 };
        return (order[a.status] ?? 9) - (order[b.status] ?? 9);
    });

    // 显示第一个项（当前最重要的）
    const primary = items[0];
    const queueCount = items.filter(i => i.status === 'downloading').length;

    // 恢复下载（用存储的 repo + fileName 重新调 startDownload）
    const handleResume = () => {
        if (primary?.repo) {
            startDownload(primary.repo, primary.fileName);
        }
    };

    return (
        <div className="
            h-7 flex items-center px-4 
            bg-cyber-bg/80 backdrop-blur-sm
            border-t border-cyber-border/30
            transition-all duration-300
        ">
            {/* 主下载项 */}
            <div className="flex-1 min-w-0">
                <DownloadItemRow
                    item={primary}
                    onPause={pauseDownload}
                    onResume={handleResume}
                    onCancel={cancelDownload}
                />
            </div>

            {/* 队列计数（多个下载时显示） */}
            {queueCount > 1 && (
                <span className="text-[10px] font-mono text-cyber-text-secondary ml-3 flex-shrink-0">
                    +{queueCount - 1} {t('download.inQueue')}
                </span>
            )}
        </div>
    );
};
