import { BrowserWindow } from 'electron';

// ============================================================
// 全局应用日志系统
// 用于收集用户操作日志并推送到前端 Logs & Debug 页面
// ============================================================

export type LogCategory = 'ERROR' | 'MODEL' | 'DOWNLOAD' | 'TOOL' | 'SECURITY';

export interface AppLogEntry {
    timestamp: string;
    category: LogCategory;
    message: string;
}

// 日志存储
const appLogs: AppLogEntry[] = [];
const MAX_APP_LOGS = 500;

/**
 * 添加一条应用日志，同时推送到前端
 */
export function addAppLog(category: LogCategory, message: string) {
    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
    const entry: AppLogEntry = { timestamp, category, message };

    appLogs.push(entry);
    if (appLogs.length > MAX_APP_LOGS) {
        appLogs.shift();
    }

    // 推送到所有渲染进程窗口
    BrowserWindow.getAllWindows().forEach(win => {
        if (!win.isDestroyed()) {
            win.webContents.send('app-log', entry);
        }
    });
}

/**
 * 获取所有日志
 */
export function getAppLogs(): AppLogEntry[] {
    return [...appLogs];
}

/**
 * 清空日志
 */
export function clearAppLogs() {
    appLogs.length = 0;
}
