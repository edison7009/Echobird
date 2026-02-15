/**
 * AI Translate — preload script
 * 提供窗口控制 API 给 app.html
 */
const { contextBridge, ipcRenderer } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');

// 窗口控制
contextBridge.exposeInMainWorld('gameWindow', {
    close: () => ipcRenderer.send('game-window-close'),
    minimize: () => ipcRenderer.send('game-window-minimize'),
});

// 配置文件读写
const configPath = path.join(os.homedir(), '.whichclaw', 'translator.json');
contextBridge.exposeInMainWorld('gameConfig', {
    saveModelInfo: (info) => {
        try {
            const dir = path.dirname(configPath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

            let config = {};
            if (fs.existsSync(configPath)) {
                try { config = JSON.parse(fs.readFileSync(configPath, 'utf-8')); } catch { }
            }
            config.model = info.model || config.model;
            config.baseUrl = info.baseUrl || config.baseUrl;
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
        } catch (e) {
            console.error('[Translator] Failed to save config:', e);
        }
    }
});
