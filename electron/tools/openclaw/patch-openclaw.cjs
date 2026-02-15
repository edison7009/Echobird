/**
 * WhichClaw OpenClaw 补丁脚本
 * 在已安装的 OpenClaw 的 openclaw.mjs 入口文件中注入 WhichClaw 配置读取代码
 * 
 * 功能：在加载 dist/entry.js 之前注入一段代码，
 * 从 ~/.whichclaw/openclaw.json 读取模型配置，
 * 并将其写入 ~/.openclaw/openclaw.json 的 models.providers 中。
 * 
 * 用法：node patch-openclaw.cjs [--restore]
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// OpenClaw npm 全局安装入口搜索路径
const NPM_GLOBAL_MODULES = [
  path.join(process.env.APPDATA || '', 'npm', 'node_modules', 'openclaw'),
  path.join(os.homedir(), '.npm-global', 'lib', 'node_modules', 'openclaw'),
  '/usr/local/lib/node_modules/openclaw',
  '/usr/lib/node_modules/openclaw',
];

// WhichClaw 补丁标记
const PATCH_MARKER = '/* [WhichClaw-Patched] */';

// 注入代码：在 OpenClaw 启动前读取 ~/.whichclaw/openclaw.json 并合并到 ~/.openclaw/openclaw.json
const INJECT_CODE = `
${PATCH_MARKER}
import { readFileSync as _wc_readFileSync, writeFileSync as _wc_writeFileSync, existsSync as _wc_existsSync, mkdirSync as _wc_mkdirSync } from "node:fs";
import { join as _wc_join } from "node:path";
import { homedir as _wc_homedir } from "node:os";
(function _whichclaw_inject() {
  try {
    const wcConfigPath = _wc_join(_wc_homedir(), ".whichclaw", "openclaw.json");
    if (!_wc_existsSync(wcConfigPath)) return;
    const wcConfig = JSON.parse(_wc_readFileSync(wcConfigPath, "utf-8"));
    if (!wcConfig.modelId || !wcConfig.apiKey) return;

    // 读取 OpenClaw 原始配置
    const ocDir = _wc_join(_wc_homedir(), ".openclaw");
    const ocConfigPath = _wc_join(ocDir, "openclaw.json");
    if (!_wc_existsSync(ocDir)) _wc_mkdirSync(ocDir, { recursive: true });

    let ocConfig = {};
    if (_wc_existsSync(ocConfigPath)) {
      try { ocConfig = JSON.parse(_wc_readFileSync(ocConfigPath, "utf-8")); } catch {}
    }

    // 确保结构存在
    if (!ocConfig.models) ocConfig.models = { providers: {} };
    if (!ocConfig.models.providers) ocConfig.models.providers = {};
    if (!ocConfig.agents) ocConfig.agents = {};
    if (!ocConfig.agents.defaults) ocConfig.agents.defaults = {};
    if (!ocConfig.agents.defaults.model) ocConfig.agents.defaults.model = {};

    // 清理旧的 WhichClaw provider（以 wc_ 开头的都是 WhichClaw 推送的）
    for (const key of Object.keys(ocConfig.models.providers)) {
      if (key.startsWith("wc_")) {
        delete ocConfig.models.providers[key];
      }
    }

    // 根据 protocol 字段决定 API 类型（优先），否则从模型名/URL 推断
    const protocol = wcConfig.protocol || "openai";
    const isAnthropic = protocol === "anthropic" || wcConfig.modelId?.toLowerCase().includes("claude") || wcConfig.baseUrl?.toLowerCase().includes("anthropic");
    const apiType = isAnthropic ? "anthropic-messages" : "openai-completions";

    // 从 URL 提取 provider 名称
    let providerTag = "custom";
    try {
      const hostname = new URL(wcConfig.baseUrl || "").hostname;
      if (hostname === "localhost" || hostname.startsWith("127.") || hostname.startsWith("192.168.")) {
        providerTag = "local";
      } else {
        const parts = hostname.split(".");
        providerTag = parts.length >= 2 ? parts[parts.length - 2] : hostname;
      }
    } catch {}

    const wcProviderName = "wc_" + providerTag;
    let baseUrl = wcConfig.baseUrl || "https://api.openai.com/v1";
    if (baseUrl.endsWith("/")) baseUrl = baseUrl.slice(0, -1);

    ocConfig.models.providers[wcProviderName] = {
      baseUrl: baseUrl,
      apiKey: wcConfig.apiKey,
      api: apiType,
      auth: "api-key",
      authHeader: true,
      models: [{
        id: wcConfig.modelId,
        name: wcConfig.modelName || wcConfig.modelId,
        contextWindow: 128000,
        maxTokens: 8192,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
      }]
    };
    ocConfig.agents.defaults.model.primary = wcProviderName + "/" + wcConfig.modelId;
    console.log("[WhichClaw] Injected " + apiType + " model: " + wcProviderName + "/" + wcConfig.modelId);

    // 写回 openclaw.json
    _wc_writeFileSync(ocConfigPath, JSON.stringify(ocConfig, null, 2), "utf-8");
  } catch (err) {
    console.warn("[WhichClaw] Config injection failed:", err.message);
  }
})();

`;

/**
 * 查找 OpenClaw 全局安装目录
 */
function findOpenClawDir() {
  // 1. 尝试从 npm root -g 获取
  try {
    const { execSync } = require('child_process');
    const npmRoot = execSync('npm root -g', { encoding: 'utf-8', timeout: 5000 }).trim();
    const candidate = path.join(npmRoot, 'openclaw');
    if (fs.existsSync(path.join(candidate, 'openclaw.mjs'))) {
      return candidate;
    }
  } catch { }

  // 2. 尝试已知路径
  for (const dir of NPM_GLOBAL_MODULES) {
    if (fs.existsSync(path.join(dir, 'openclaw.mjs'))) {
      return dir;
    }
  }

  return null;
}

/**
 * 对 OpenClaw 的 openclaw.mjs 打补丁
 */
function patchOpenClaw(restore = false) {
  const openclawDir = findOpenClawDir();
  if (!openclawDir) {
    console.error('❌ 未找到 OpenClaw 安装目录');
    return false;
  }

  const entryPath = path.join(openclawDir, 'openclaw.mjs');
  if (!fs.existsSync(entryPath)) {
    console.error('❌ openclaw.mjs 不存在:', entryPath);
    return false;
  }

  const backupPath = entryPath + '.whichclaw-backup';

  if (restore) {
    if (fs.existsSync(backupPath)) {
      fs.copyFileSync(backupPath, entryPath);
      console.log('✅ 已恢复原始 openclaw.mjs');
      return true;
    } else {
      console.error('❌ 备份文件不存在:', backupPath);
      return false;
    }
  }

  // 读取入口文件
  let content = fs.readFileSync(entryPath, 'utf-8');

  // 已打过补丁？先恢复再重打
  if (content.includes(PATCH_MARKER)) {
    console.log('⚠️ 已有补丁，先恢复再重新打补丁');
    if (fs.existsSync(backupPath)) {
      content = fs.readFileSync(backupPath, 'utf-8');
    } else {
      console.error('❌ 备份文件不存在，无法重新打补丁');
      return false;
    }
  } else {
    // 首次打补丁，备份原始文件
    fs.copyFileSync(entryPath, backupPath);
    console.log('📦 已备份原始文件:', backupPath);
  }

  // 注入点：在 shebang 行和 import module 之后，installProcessWarningFilter 之前
  // 找到 "await installProcessWarningFilter();" 行，在其前面注入
  const SEARCH_PATTERN = 'await installProcessWarningFilter();';
  const idx = content.indexOf(SEARCH_PATTERN);

  if (idx < 0) {
    // 备用方案：找 tryImport 调用
    const altPattern = 'if (await tryImport(';
    const altIdx = content.indexOf(altPattern);
    if (altIdx < 0) {
      console.error('❌ 未找到注入点');
      return false;
    }
    const patched = content.substring(0, altIdx) + INJECT_CODE + content.substring(altIdx);
    fs.writeFileSync(entryPath, patched);
  } else {
    // 在 installProcessWarningFilter 之后注入
    const insertPos = idx + SEARCH_PATTERN.length;
    const patched = content.substring(0, insertPos) + '\n' + INJECT_CODE + content.substring(insertPos);
    fs.writeFileSync(entryPath, patched);
  }

  console.log('✅ 补丁成功！OpenClaw 入口文件:', entryPath);
  console.log('');
  console.log('💡 每次 OpenClaw 启动时，会自动从 ~/.whichclaw/openclaw.json 读取模型配置');
  console.log('   然后注入到 ~/.openclaw/openclaw.json 的 providers 中');
  console.log('');
  console.log('📁 配置文件格式 (~/.whichclaw/openclaw.json):');
  console.log(JSON.stringify({
    apiKey: 'sk-xxx',
    baseUrl: 'https://api.example.com/v1',
    modelId: 'gpt-4o',
    modelName: 'GPT-4o'
  }, null, 2));

  return true;
}

// 主入口
const args = process.argv.slice(2);
const isRestore = args.includes('--restore');

if (isRestore) {
  console.log('🔄 恢复原始 OpenClaw 入口...');
  const success = patchOpenClaw(true);
  process.exit(success ? 0 : 1);
} else {
  console.log('🔧 正在为 OpenClaw 打 WhichClaw 补丁...');
  const success = patchOpenClaw(false);
  process.exit(success ? 0 : 1);
}
