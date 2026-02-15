// ToolCard component
import { useI18n } from '../../hooks/useI18n';

export interface ToolCardProps {
    id: string;
    name: string;
    version: string;
    installed: boolean;
    path?: string;
    configPath?: string;
    skillsCount?: number;
    activeModel?: string;
    website?: string;
    iconBase64?: string;
    names?: Record<string, string>;  // i18n 名称
    selected?: boolean;
    onClick?: () => void;
}

export const ToolCard = ({ id, name, version, installed, path, configPath, skillsCount = 0, activeModel, website, iconBase64, names, selected = false, onClick }: ToolCardProps) => {
    const { t, locale } = useI18n();
    // 使用 names i18n 字段显示本地化名称（内置应用如 Reversi → 黑白棋）
    const displayName = (names && locale !== 'en' && names[locale]) || name;
    return (
        <div
            className={`p-5 border ${selected ? 'border-cyber-accent shadow-[0_0_10px_rgba(0,255,157,0.3)]' : 'border-cyber-border shadow-cyber-card'} relative overflow-hidden rounded-card ${installed ? 'cursor-pointer hover:bg-black/40' : 'cursor-default opacity-80'} transition-all bg-black/20 flex flex-col`}
            onClick={installed ? onClick : undefined}
        >
            {/* 工具图标：右上角 */}
            <img
                src={`./icons/tools/${id}.svg`}
                alt={name}
                className={`absolute top-4 right-4 w-10 h-10 rounded-lg ${selected ? 'opacity-100' : installed ? 'opacity-60' : 'opacity-20'}`}
                onError={(e) => {
                    const img = e.target as HTMLImageElement;
                    if (img.src.endsWith('.svg')) {
                        img.src = `./icons/tools/${id}.png`;
                    } else if (!img.src.startsWith('data:') && iconBase64) {
                        img.src = iconBase64;
                    } else {
                        img.style.display = 'none';
                    }
                }}
            />
            <div className={`text-lg font-bold truncate pr-12 ${installed ? 'text-cyber-accent' : 'text-cyber-text-secondary'}`}>{displayName}</div>
            <div className={`text-[11px] space-y-1.5 mt-3 ${installed ? 'text-cyber-accent/60' : 'text-cyber-text-muted/70'}`}>
                <div className="truncate">{t('tool.models')}: {installed ? (activeModel || '-') : '-'}</div>
                <div className="truncate">{t('tool.skills')}: {installed ? `${skillsCount} ${t('tool.skillsInstalled')}` : '-'}</div>
                <div className="truncate">{t('tool.app')}: {installed ? (path || '-') : '-'}</div>
                <div className="truncate">{t('tool.config')}: {installed ? (configPath || '-') : '-'}</div>
            </div>
        </div>
    );
};
