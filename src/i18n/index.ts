// 轻量级 i18n 入口 — 翻译加载器
// 工具名、API 术语、品牌名保持英文不翻译

// 类型从 types.ts 导入并重导出
export type { TKey, Translations } from './types';
import type { Translations } from './types';
import type { TKey } from './types';
import { en } from './en';

// 按需懒加载语言包
const localeModules: Record<string, () => Promise<{ default: Partial<Translations> }>> = {
    'zh-Hans': () => import('./zh-Hans'),
    'zh-Hant': () => import('./zh-Hant'),
    ja: () => import('./ja'),
    ko: () => import('./ko'),
    de: () => import('./de'),
    fr: () => import('./fr'),
    es: () => import('./es'),
    pt: () => import('./pt'),
    it: () => import('./it'),
    nl: () => import('./nl'),
    ru: () => import('./ru'),
    ar: () => import('./ar'),
    hi: () => import('./hi'),
    bn: () => import('./bn'),
    th: () => import('./th'),
    vi: () => import('./vi'),
    id: () => import('./id'),
    ms: () => import('./ms'),
    tr: () => import('./tr'),
    pl: () => import('./pl'),
    cs: () => import('./cs'),
    hu: () => import('./hu'),
    sv: () => import('./sv'),
    fi: () => import('./fi'),
    el: () => import('./el'),
    he: () => import('./he'),
    fa: () => import('./fa'),
};

// 已加载的语言缓存
const loadedLocales: Record<string, Translations> = { en };

// 预加载语言包
export async function loadLocale(locale: string): Promise<void> {
    if (locale === 'en' || loadedLocales[locale]) return;
    const loader = localeModules[locale];
    if (!loader) return;
    try {
        const mod = await loader();
        loadedLocales[locale] = { ...en, ...mod.default };
    } catch {
        console.warn(`[i18n] Failed to load locale: ${locale}`);
    }
}

// 同步翻译函数（需先调用 loadLocale）
export function translate(key: TKey, locale: string): string {
    const dict = loadedLocales[locale] || en;
    return dict[key] || en[key] || key;
}
