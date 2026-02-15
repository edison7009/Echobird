/**
 * WhichClaw Codex 补丁脚本
 * 在 Codex 的 codex.js 启动器中注入 WhichClaw 配置读取代码
 * 
 * 功能：在 spawn codex.exe 之前注入一段代码，
 * 从 ~/.whichclaw/codex.json 读取 API Key，
 * 并设置 OPENAI_API_KEY 环境变量。
 * 
 * 用法：node patch-codex.cjs [--restore]
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Codex npm 全局安装入口搜索路径
const NPM_GLOBAL_MODULES = [
    path.join(process.env.APPDATA || '', 'npm', 'node_modules', '@openai', 'codex'),
    path.join(os.homedir(), '.npm-global', 'lib', 'node_modules', '@openai', 'codex'),
    '/usr/local/lib/node_modules/@openai/codex',
    '/usr/lib/node_modules/@openai/codex',
];

// WhichClaw 补丁标记
const PATCH_MARKER = '/* [WhichClaw-Codex-Patched] */';

// 注入代码：在 Codex 启动前读取 ~/.whichclaw/codex.json 并设置环境变量
const INJECT_CODE = `
${PATCH_MARKER}
import { readFileSync as _wc_rf, existsSync as _wc_ex } from "fs";
import { join as _wc_j } from "path";
import { homedir as _wc_h } from "os";
(function _whichclaw_codex() {
  try {
    const p = _wc_j(_wc_h(), ".whichclaw", "codex.json");
    if (!_wc_ex(p)) return;
    const c = JSON.parse(_wc_rf(p, "utf-8"));
    if (c.apiKey) process.env.OPENAI_API_KEY = c.apiKey;
    console.log("[WhichClaw] Codex API Key injected from", p);
  } catch {}
})();

`;

/**
 * 查找 Codex 全局安装目录
 */
function findCodexDir() {
    // 1. 尝试从 npm root -g 获取
    try {
        const { execSync } = require('child_process');
        const npmRoot = execSync('npm root -g', { encoding: 'utf-8', timeout: 5000 }).trim();
        const candidate = path.join(npmRoot, '@openai', 'codex');
        if (fs.existsSync(path.join(candidate, 'bin', 'codex.js'))) {
            return candidate;
        }
    } catch { }

    // 2. 尝试已知路径
    for (const dir of NPM_GLOBAL_MODULES) {
        if (fs.existsSync(path.join(dir, 'bin', 'codex.js'))) {
            return dir;
        }
    }

    return null;
}

/**
 * 对 Codex 的 codex.js 打补丁
 */
function patchCodex(restore = false) {
    const codexDir = findCodexDir();
    if (!codexDir) {
        console.error('❌ Codex installation not found');
        return false;
    }

    const entryPath = path.join(codexDir, 'bin', 'codex.js');
    if (!fs.existsSync(entryPath)) {
        console.error('❌ codex.js not found:', entryPath);
        return false;
    }

    const backupPath = entryPath + '.whichclaw-backup';

    if (restore) {
        if (fs.existsSync(backupPath)) {
            fs.copyFileSync(backupPath, entryPath);
            console.log('✅ Restored original codex.js');
            return true;
        } else {
            console.error('❌ Backup file not found:', backupPath);
            return false;
        }
    }

    // 读取入口文件
    let content = fs.readFileSync(entryPath, 'utf-8');

    // 已打过补丁？先恢复再重打
    if (content.includes(PATCH_MARKER)) {
        console.log('⚠️ Patch exists, restoring before re-patching');
        if (fs.existsSync(backupPath)) {
            content = fs.readFileSync(backupPath, 'utf-8');
        } else {
            console.error('❌ Backup file not found, cannot re-patch');
            return false;
        }
    } else {
        // 首次打补丁，备份原始文件
        fs.copyFileSync(entryPath, backupPath);
        console.log('📦 Backed up original file:', backupPath);
    }

    // 注入点：在 "const env = { ...process.env" 之前注入
    // 这样注入的代码设置的 process.env.OPENAI_API_KEY 会被 env 对象继承
    const SEARCH_PATTERN = 'const env = { ...process.env';
    const idx = content.indexOf(SEARCH_PATTERN);

    if (idx < 0) {
        // 备用方案：在 spawn 调用前注入
        const altPattern = 'const child = spawn(';
        const altIdx = content.indexOf(altPattern);
        if (altIdx < 0) {
            console.error('❌ Injection point not found in codex.js');
            return false;
        }
        const patched = content.substring(0, altIdx) + INJECT_CODE + content.substring(altIdx);
        fs.writeFileSync(entryPath, patched);
    } else {
        // 在 env 构造之前注入
        const patched = content.substring(0, idx) + INJECT_CODE + content.substring(idx);
        fs.writeFileSync(entryPath, patched);
    }

    console.log('✅ Patch applied! Codex entry:', entryPath);
    console.log('');
    console.log('💡 Codex will now read API Key from ~/.whichclaw/codex.json on startup');

    return true;
}

// 主入口
const args = process.argv.slice(2);
const isRestore = args.includes('--restore');

if (isRestore) {
    console.log('🔄 Restoring original Codex entry...');
    const success = patchCodex(true);
    process.exit(success ? 0 : 1);
} else {
    console.log('🔧 Patching Codex for WhichClaw...');
    const success = patchCodex(false);
    process.exit(success ? 0 : 1);
}
