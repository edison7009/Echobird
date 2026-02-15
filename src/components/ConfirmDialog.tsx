// ConfirmDialog — Global confirm dialog with cyber theme
// Usage: const confirm = useConfirm(); const ok = await confirm({ title, message });

import React, { useState, useCallback, createContext, useContext, useEffect, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useI18n } from '../hooks/useI18n';

// Dialog options
export interface ConfirmOptions {
    title?: string;
    message?: string;
    confirmText?: string;
    cancelText?: string;
    type?: 'danger' | 'normal';  // danger = red confirm button, normal = green
}

// Context type — single function returning Promise<boolean>
interface ConfirmContextType {
    confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextType | undefined>(undefined);

export const useConfirm = () => {
    const context = useContext(ConfirmContext);
    if (!context) {
        throw new Error('useConfirm must be used within a ConfirmDialogProvider');
    }
    return context.confirm;
};

// Provider + Dialog UI
export const ConfirmDialogProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { t } = useI18n();
    const [isOpen, setIsOpen] = useState(false);
    const [isAnimatingOut, setIsAnimatingOut] = useState(false);
    const [options, setOptions] = useState<ConfirmOptions>({});
    const resolveRef = useRef<((value: boolean) => void) | null>(null);

    const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
        setOptions(opts);
        setIsOpen(true);
        setIsAnimatingOut(false);
        return new Promise<boolean>((resolve) => {
            resolveRef.current = resolve;
        });
    }, []);

    // Animate out then close
    const closeWith = useCallback((result: boolean) => {
        setIsAnimatingOut(true);
        setTimeout(() => {
            setIsOpen(false);
            setIsAnimatingOut(false);
            resolveRef.current?.(result);
            resolveRef.current = null;
        }, 200);
    }, []);

    // ESC key support
    useEffect(() => {
        if (!isOpen) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') closeWith(false);
            if (e.key === 'Enter') closeWith(true);
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [isOpen, closeWith]);

    const isDanger = options.type === 'danger';

    return (
        <ConfirmContext.Provider value={{ confirm }}>
            {children}
            {isOpen && (
                <div
                    className={`fixed inset-0 z-[9998] flex items-center justify-center transition-all duration-200 ${isAnimatingOut ? 'opacity-0' : 'opacity-100'
                        }`}
                >
                    {/* Backdrop */}
                    <div
                        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                        onClick={() => closeWith(false)}
                    />

                    {/* Dialog box */}
                    <div
                        className={`relative w-[360px] max-w-[90vw] border bg-cyber-bg shadow-lg rounded-xl overflow-hidden transition-all duration-200 ${isAnimatingOut
                            ? 'scale-95 opacity-0'
                            : 'scale-100 opacity-100'
                            } ${isDanger
                                ? 'border-red-500/40 shadow-[0_0_20px_rgba(255,60,60,0.1)]'
                                : 'border-cyber-accent/40 shadow-[0_0_20px_rgba(0,255,157,0.1)]'
                            }`}
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Top accent line */}
                        <div className={`h-[2px] w-full ${isDanger ? 'bg-red-500/60' : 'bg-cyber-accent/60'}`} />

                        {/* Header */}
                        <div className="px-5 pt-4 pb-2 flex items-center gap-2">
                            {isDanger && (
                                <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
                            )}
                            <span className={`text-sm font-mono font-bold tracking-wider ${isDanger ? 'text-red-400' : 'text-cyber-accent'
                                }`}>
                                {options.title || t('common.confirm')}
                            </span>
                        </div>

                        {/* Message */}
                        <div className="px-5 pb-5">
                            <p className="text-xs text-cyber-text-secondary leading-relaxed font-mono">
                                {options.message || t('common.areYouSure')}
                            </p>
                        </div>

                        {/* Actions */}
                        <div className="flex border-t border-cyber-border">
                            <button
                                onClick={() => closeWith(false)}
                                className="flex-1 px-4 py-2.5 text-xs font-mono font-bold tracking-wider text-cyber-text-secondary hover:text-cyber-text hover:bg-white/5 transition-all border-r border-cyber-border"
                            >
                                {options.cancelText || t('btn.cancel')}
                            </button>
                            <button
                                onClick={() => closeWith(true)}
                                className={`flex-1 px-4 py-2.5 text-xs font-mono font-bold tracking-wider transition-all ${isDanger
                                    ? 'text-red-400 hover:bg-red-500/10 hover:text-red-300'
                                    : 'text-cyber-accent hover:bg-cyber-accent/10'
                                    }`}
                            >
                                {options.confirmText || t('common.confirm')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </ConfirmContext.Provider>
    );
};
