// 跨平台配置文件复制脚本
// 替代 Windows 专用的 xcopy 命令
import fs from 'fs';
import path from 'path';

const src = path.resolve('electron/config');
const dest = path.resolve('dist-electron/config');

function copyDir(s, d) {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
    for (const item of fs.readdirSync(s)) {
        const sp = path.join(s, item);
        const dp = path.join(d, item);
        if (fs.statSync(sp).isDirectory()) {
            copyDir(sp, dp);
        } else {
            fs.copyFileSync(sp, dp);
        }
    }
}

if (fs.existsSync(src)) {
    copyDir(src, dest);
    console.log(`Copied config: ${src} → ${dest}`);
} else {
    console.warn(`Config dir not found: ${src}`);
}
