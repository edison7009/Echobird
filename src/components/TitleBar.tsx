// 自定义无边框窗口标题栏
import React, { useState } from 'react';
import { Settings, Minus, X } from 'lucide-react';
import { useI18n } from '../hooks/useI18n';

const CLOSE_BEHAVIOR_KEY = 'whichclaw-close-behavior';

interface TitleBarProps {
    onSettingsClick?: () => void;
}

export const TitleBar: React.FC<TitleBarProps> = ({ onSettingsClick }) => {
    const { t } = useI18n();
    const handleMinimize = () => window.electron?.windowMinimize();

    // 关闭确认弹窗状态
    const [showCloseDialog, setShowCloseDialog] = useState(false);
    const [rememberChoice, setRememberChoice] = useState(false);
    const [isAnimatingOut, setIsAnimatingOut] = useState(false);

    const closeDialog = () => {
        setIsAnimatingOut(true);
        setTimeout(() => {
            setShowCloseDialog(false);
            setIsAnimatingOut(false);
            setRememberChoice(false);
        }, 200);
    };

    const handleClose = () => {
        const saved = localStorage.getItem(CLOSE_BEHAVIOR_KEY);
        if (saved === 'minimize') {
            window.electron?.windowClose();
            return;
        }
        if (saved === 'quit') {
            (window as any).electron?.quitApp?.();
            return;
        }
        // 首次：显示确认弹窗
        setShowCloseDialog(true);
    };

    const handleMinimizeToTray = () => {
        if (rememberChoice) localStorage.setItem(CLOSE_BEHAVIOR_KEY, 'minimize');
        closeDialog();
        window.electron?.windowClose();
    };

    const handleQuit = () => {
        if (rememberChoice) localStorage.setItem(CLOSE_BEHAVIOR_KEY, 'quit');
        closeDialog();
        (window as any).electron?.quitApp?.();
    };

    return (
        <>
            <div
                className="h-8 bg-cyber-bg flex items-center justify-end select-none flex-shrink-0"
                style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
            >
                {/* 窗口控制按钮 */}
                <div
                    className="flex items-center h-full"
                    style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                >
                    <button
                        onClick={onSettingsClick}
                        className="h-full px-4 flex items-center justify-center text-cyber-text-secondary hover:bg-cyber-accent/20 hover:text-cyber-accent transition-colors"
                    >
                        <Settings size={13} />
                    </button>
                    <button
                        onClick={handleMinimize}
                        className="h-full px-4 flex items-center justify-center text-cyber-text-secondary hover:bg-cyber-accent/20 hover:text-cyber-accent transition-colors"
                    >
                        <Minus size={14} />
                    </button>
                    <button
                        onClick={handleClose}
                        className="h-full px-4 flex items-center justify-center text-cyber-text-secondary hover:bg-red-500/20 hover:text-red-400 transition-colors"
                    >
                        <X size={14} />
                    </button>
                </div>
            </div>

            {/* 关闭行为确认弹窗 */}
            {showCloseDialog && (
                <div
                    className={`fixed inset-0 z-[9999] flex items-center justify-center transition-all duration-200 ${isAnimatingOut ? 'opacity-0' : 'opacity-100'}`}
                >
                    {/* 背景遮罩 */}
                    <div
                        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                        onClick={closeDialog}
                    />

                    {/* 弹窗 */}
                    <div
                        className={`relative w-[380px] max-w-[90vw] border border-cyber-accent/40 bg-cyber-bg shadow-lg rounded-xl overflow-hidden transition-all duration-200 shadow-[0_0_20px_rgba(0,255,157,0.1)] ${isAnimatingOut ? 'scale-95 opacity-0' : 'scale-100 opacity-100'}`}
                        onClick={e => e.stopPropagation()}
                    >
                        {/* 顶部装饰线 */}
                        <div className="h-[2px] w-full bg-cyber-accent/60" />

                        {/* 标题 */}
                        <div className="px-5 pt-4 pb-2">
                            <span className="text-sm font-mono font-bold tracking-wider text-cyber-accent">
                                {t('close.title')}
                            </span>
                        </div>

                        {/* 提示信息 */}
                        <div className="px-5 pb-3">
                            <p className="text-xs text-cyber-text-secondary leading-relaxed font-mono">
                                {t('close.message')}
                            </p>
                        </div>

                        {/* 记住选择 */}
                        <div className="px-5 pb-4">
                            <label className="flex items-center gap-2 cursor-pointer group">
                                <div
                                    className={`w-3.5 h-3.5 rounded border transition-all flex items-center justify-center ${rememberChoice
                                        ? 'bg-cyber-accent/20 border-cyber-accent'
                                        : 'border-cyber-border hover:border-cyber-accent/50'
                                        }`}
                                    onClick={() => setRememberChoice(!rememberChoice)}
                                >
                                    {rememberChoice && <span className="text-[9px] text-cyber-accent">✓</span>}
                                </div>
                                <span
                                    className="text-[11px] text-cyber-text-secondary font-mono group-hover:text-cyber-text transition-colors"
                                    onClick={() => setRememberChoice(!rememberChoice)}
                                >
                                    {t('close.remember')}
                                </span>
                            </label>
                        </div>

                        {/* 操作按钮 */}
                        <div className="flex border-t border-cyber-border">
                            <button
                                onClick={handleMinimizeToTray}
                                className="flex-1 px-4 py-2.5 text-xs font-mono font-bold tracking-wider text-cyber-accent hover:bg-cyber-accent/10 transition-all border-r border-cyber-border"
                            >
                                {t('close.minimize')}
                            </button>
                            <button
                                onClick={handleQuit}
                                className="flex-1 px-4 py-2.5 text-xs font-mono font-bold tracking-wider text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-all"
                            >
                                {t('close.quit')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};
