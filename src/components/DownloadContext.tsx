// 全局下载状态管理 Context
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

// 下载进度数据结构
export interface DownloadItem {
    fileName: string;
    repo?: string; // 仓库名，用于暂停后继续下载
    progress: number;
    downloaded: number;
    total: number;
    status: 'downloading' | 'completed' | 'error' | 'cancelled' | 'paused';
}

interface DownloadContextValue {
    // 所有下载项
    downloads: Map<string, DownloadItem>;
    // 是否有正在下载的项
    isDownloading: boolean;
    // 当前活跃下载（第一个 downloading 状态的）
    activeDownload: DownloadItem | null;
    // 触发下载
    startDownload: (repo: string, fileName: string) => void;
    // 暂停下载（保留进度，可续传）
    pauseDownload: () => void;
    // 取消下载（删除临时文件，支持传入 fileName 用于暂停后取消）
    cancelDownload: (fileName?: string) => void;
}

const DownloadContext = createContext<DownloadContextValue | null>(null);

export const useDownload = () => {
    const ctx = useContext(DownloadContext);
    if (!ctx) throw new Error('useDownload must be used within DownloadProvider');
    return ctx;
};

export const DownloadProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [downloads, setDownloads] = useState<Map<string, DownloadItem>>(new Map());
    // 自动清理定时器引用
    const cleanupTimers = useRef<Map<string, NodeJS.Timeout>>(new Map());

    // 监听 IPC 下载进度事件
    useEffect(() => {
        if (!window.electron?.onDownloadProgress) return;

        window.electron.onDownloadProgress((data: {
            fileName: string;
            progress: number;
            downloaded: number;
            total: number;
            status: string;
        }) => {
            setDownloads(prev => {
                const next = new Map(prev);
                const existing = prev.get(data.fileName);
                next.set(data.fileName, {
                    fileName: data.fileName,
                    repo: existing?.repo, // 保留已有的 repo 信息
                    progress: data.progress,
                    downloaded: data.downloaded,
                    total: data.total,
                    status: data.status as DownloadItem['status'],
                });
                return next;
            });

            // 完成、失败或取消后 5 秒自动清理（暂停不清理，保留状态）
            if (data.status === 'completed' || data.status === 'error' || data.status === 'cancelled') {
                // 清除之前的定时器（避免重复）
                const existing = cleanupTimers.current.get(data.fileName);
                if (existing) clearTimeout(existing);

                const timer = setTimeout(() => {
                    setDownloads(prev => {
                        const next = new Map(prev);
                        next.delete(data.fileName);
                        return next;
                    });
                    cleanupTimers.current.delete(data.fileName);
                }, 5000);
                cleanupTimers.current.set(data.fileName, timer);
            }
        });

        return () => {
            // 清理所有定时器
            cleanupTimers.current.forEach(t => clearTimeout(t));
            cleanupTimers.current.clear();
        };
    }, []);

    // 触发下载（也用于暂停后继续）
    const startDownload = useCallback(async (repo: string, fileName: string) => {
        // 立即显示 downloading 状态
        setDownloads(prev => {
            const next = new Map(prev);
            next.set(fileName, {
                fileName,
                repo, // 存储 repo 用于暂停后恢复
                progress: 0,
                downloaded: 0,
                total: 0,
                status: 'downloading',
            });
            return next;
        });
        try {
            await window.electron?.downloadModel?.(repo, fileName);
        } catch (e) {
            console.error('[DownloadContext] 下载失败:', e);
        }
    }, []);

    // 暂停下载（保留 .downloading 临时文件，可续传）
    const pauseDownload = useCallback(async () => {
        try {
            await window.electron?.pauseDownload?.();
        } catch (e) {
            console.error('[DownloadContext] 暂停失败:', e);
        }
    }, []);

    // 取消下载（删除 .downloading 临时文件，支持暂停后取消）
    const cancelDownload = useCallback(async (fileName?: string) => {
        try {
            await window.electron?.cancelDownload?.(fileName);
        } catch (e) {
            console.error('[DownloadContext] 取消失败:', e);
        }
    }, []);

    // 计算派生值
    const isDownloading = Array.from(downloads.values()).some(d => d.status === 'downloading');
    const activeDownload = Array.from(downloads.values()).find(d => d.status === 'downloading') || null;

    return (
        <DownloadContext.Provider value={{ downloads, isDownloading, activeDownload, startDownload, pauseDownload, cancelDownload }}>
            {children}
        </DownloadContext.Provider>
    );
};
