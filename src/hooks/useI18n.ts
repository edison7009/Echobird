// 轻量级 i18n React Hook + Context（支持懒加载语言包）
import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { translate, loadLocale, TKey } from '../i18n';

interface I18nContextValue {
    locale: string;
    setLocale: (locale: string) => void;
    t: (key: TKey) => string;
}

const I18nContext = createContext<I18nContextValue>({
    locale: 'en',
    setLocale: () => { },
    t: (key) => key,
});

const STORAGE_KEY = 'whichclaw-locale';

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [locale, setLocaleState] = useState(() => {
        try { return localStorage.getItem(STORAGE_KEY) || 'en'; } catch { return 'en'; }
    });
    // 语言包是否已加载
    const [ready, setReady] = useState(locale === 'en');

    // 初始化 / 切换语言时加载对应语言包
    useEffect(() => {
        if (locale === 'en') { setReady(true); return; }
        setReady(false);
        loadLocale(locale).then(() => setReady(true));
    }, [locale]);

    const setLocale = useCallback((newLocale: string) => {
        setLocaleState(newLocale);
        try { localStorage.setItem(STORAGE_KEY, newLocale); } catch { }
        // 同步到主进程（更新托盘菜单语言）
        (window as any).electron?.setLocale?.(newLocale);
    }, []);

    // 初始化时同步当前语言到主进程
    useEffect(() => {
        (window as any).electron?.setLocale?.(locale);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // 翻译函数（语言包未加载时返回英文）
    const t = useCallback((key: TKey) => translate(key, ready ? locale : 'en'), [locale, ready]);

    // 同步 document lang 属性
    useEffect(() => {
        document.documentElement.lang = locale;
    }, [locale]);

    return React.createElement(I18nContext.Provider, { value: { locale, setLocale, t } }, children);
};

export function useI18n() {
    return useContext(I18nContext);
}
