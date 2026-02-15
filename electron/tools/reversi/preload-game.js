// 游戏窗口 preload — 窗口控制 + 模型信息写入 + 默认技能安装
const { contextBridge, ipcRenderer } = require('electron');

// --- 最优先：暴露窗口控制 API（纯 IPC，不依赖 Node 模块） ---
contextBridge.exposeInMainWorld('gameWindow', {
    minimize: () => ipcRenderer.send('game-window-minimize'),
    close: () => ipcRenderer.send('game-window-close'),
});

// --- 以下功能需要 Node.js 模块，沙箱模式下可能不可用 ---
try {
    const fs = require('fs');
    const path = require('path');
    const os = require('os');

    // 暴露配置写入 API
    contextBridge.exposeInMainWorld('gameConfig', {
        saveModelInfo: (modelData) => {
            try {
                const configDir = path.join(os.homedir(), '.whichclaw');
                if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });
                const configPath = path.join(configDir, 'reversi.json');
                fs.writeFileSync(configPath, JSON.stringify(modelData, null, 2), 'utf-8');
            } catch (e) {
                console.error('[Reversi Preload] Failed to save model info:', e);
            }
        }
    });

    // 自动安装默认技能（首次运行）
    const userSkillsDir = path.join(os.homedir(), '.whichclaw', 'reversi-skills');
    if (!fs.existsSync(userSkillsDir)) {
        const defaultSkillsDir = path.join(__dirname, 'default-skills');
        if (fs.existsSync(defaultSkillsDir)) {
            fs.mkdirSync(userSkillsDir, { recursive: true });
            (function copyDir(src, dest) {
                for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
                    const s = path.join(src, entry.name), d = path.join(dest, entry.name);
                    entry.isDirectory() ? (fs.mkdirSync(d, { recursive: true }), copyDir(s, d)) : fs.copyFileSync(s, d);
                }
            })(defaultSkillsDir, userSkillsDir);
        }
    }
} catch (e) {
    // 沙箱模式：Node 模块不可用，仅窗口控制可用
    console.warn('[Reversi Preload] Node modules unavailable (sandbox mode):', e.message);
}
