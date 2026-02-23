/**
 * Echobird OpenClaw Patch Script
 * Injects Echobird config reading code into the installed OpenClaw's openclaw.mjs entry file
 * 
 * Functionality: Before loading dist/entry.js, injects code that
 * reads model config from ~/.echobird/openclaw.json
 * and writes it into ~/.openclaw/openclaw.json's models.providers.
 * 
 * Usage: node patch-openclaw.cjs [--restore]
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// OpenClaw npm global install entry search paths
const NPM_GLOBAL_MODULES = [
  path.join(process.env.APPDATA || '', 'npm', 'node_modules', 'openclaw'),
  path.join(os.homedir(), '.npm-global', 'lib', 'node_modules', 'openclaw'),
  '/usr/local/lib/node_modules/openclaw',
  '/usr/lib/node_modules/openclaw',
];

// Echobird patch marker
const PATCH_MARKER = '/* [Echobird-Patched] */';

// Injection code: read ~/.echobird/openclaw.json and merge into ~/.openclaw/openclaw.json before OpenClaw starts
const INJECT_CODE = `
${PATCH_MARKER}
import { readFileSync as _wc_readFileSync, writeFileSync as _wc_writeFileSync, existsSync as _wc_existsSync, mkdirSync as _wc_mkdirSync } from "node:fs";
import { join as _wc_join } from "node:path";
import { homedir as _wc_homedir } from "node:os";
(function _Echobird_inject() {
  try {
    const wcConfigPath = _wc_join(_wc_homedir(), ".echobird", "openclaw.json");
    if (!_wc_existsSync(wcConfigPath)) return;
    const wcConfig = JSON.parse(_wc_readFileSync(wcConfigPath, "utf-8"));
    if (!wcConfig.modelId || !wcConfig.apiKey) return;

    // Read OpenClaw original config
    const ocDir = _wc_join(_wc_homedir(), ".openclaw");
    const ocConfigPath = _wc_join(ocDir, "openclaw.json");
    if (!_wc_existsSync(ocDir)) _wc_mkdirSync(ocDir, { recursive: true });

    let ocConfig = {};
    if (_wc_existsSync(ocConfigPath)) {
      try { ocConfig = JSON.parse(_wc_readFileSync(ocConfigPath, "utf-8")); } catch {}
    }

    // Ensure structure exists
    if (!ocConfig.models) ocConfig.models = { providers: {} };
    if (!ocConfig.models.providers) ocConfig.models.providers = {};
    if (!ocConfig.agents) ocConfig.agents = {};
    if (!ocConfig.agents.defaults) ocConfig.agents.defaults = {};
    if (!ocConfig.agents.defaults.model) ocConfig.agents.defaults.model = {};

    // Clean up old Echobird providers (keys starting with wc_ are pushed by Echobird)
    for (const key of Object.keys(ocConfig.models.providers)) {
      if (key.startsWith("wc_")) {
        delete ocConfig.models.providers[key];
      }
    }

    // Determine API type from protocol field (priority), otherwise infer from model name/URL
    const protocol = wcConfig.protocol || "openai";
    const isAnthropic = protocol === "anthropic" || wcConfig.modelId?.toLowerCase().includes("claude") || wcConfig.baseUrl?.toLowerCase().includes("anthropic");
    const apiType = isAnthropic ? "anthropic-messages" : "openai-completions";

    // Extract provider name from URL
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
    console.log("[Echobird] Injected " + apiType + " model: " + wcProviderName + "/" + wcConfig.modelId);

    // Write back openclaw.json
    _wc_writeFileSync(ocConfigPath, JSON.stringify(ocConfig, null, 2), "utf-8");
  } catch (err) {
    console.warn("[Echobird] Config injection failed:", err.message);
  }
})();

`;

/**
 * Find the OpenClaw global installation directory
 */
function findOpenClawDir() {
  // 1. Try to get path from npm root -g
  try {
    const { execSync } = require('child_process');
    const npmRoot = execSync('npm root -g', { encoding: 'utf-8', timeout: 5000 }).trim();
    const candidate = path.join(npmRoot, 'openclaw');
    if (fs.existsSync(path.join(candidate, 'openclaw.mjs'))) {
      return candidate;
    }
  } catch { }

  // 2. Try known paths
  for (const dir of NPM_GLOBAL_MODULES) {
    if (fs.existsSync(path.join(dir, 'openclaw.mjs'))) {
      return dir;
    }
  }

  return null;
}

/**
 * Patch OpenClaw's openclaw.mjs entry file
 */
function patchOpenClaw(restore = false) {
  const openclawDir = findOpenClawDir();
  if (!openclawDir) {
    console.error('OpenClaw installation directory not found');
    return false;
  }

  const entryPath = path.join(openclawDir, 'openclaw.mjs');
  if (!fs.existsSync(entryPath)) {
    console.error('openclaw.mjs does not exist:', entryPath);
    return false;
  }

  const backupPath = entryPath + '.echobird-backup';

  if (restore) {
    if (fs.existsSync(backupPath)) {
      fs.copyFileSync(backupPath, entryPath);
      console.log('Original openclaw.mjs restored');
      return true;
    } else {
      console.error('Backup file does not exist:', backupPath);
      return false;
    }
  }

  // Read entry file
  let content = fs.readFileSync(entryPath, 'utf-8');

  // Already patched? Restore first then re-patch
  if (content.includes(PATCH_MARKER)) {
    console.log('Existing patch found, restoring before re-patching');
    if (fs.existsSync(backupPath)) {
      content = fs.readFileSync(backupPath, 'utf-8');
    } else {
      console.error('Backup file does not exist, cannot re-patch');
      return false;
    }
  } else {
    // First time patching, backup original file
    fs.copyFileSync(entryPath, backupPath);
    console.log('Original file backed up:', backupPath);
  }

  // Injection point: after shebang and import module lines, before installProcessWarningFilter
  // Find "await installProcessWarningFilter();" and inject before it
  const SEARCH_PATTERN = 'await installProcessWarningFilter();';
  const idx = content.indexOf(SEARCH_PATTERN);

  if (idx < 0) {
    // Fallback: find tryImport call
    const altPattern = 'if (await tryImport(';
    const altIdx = content.indexOf(altPattern);
    if (altIdx < 0) {
      console.error('Injection point not found');
      return false;
    }
    const patched = content.substring(0, altIdx) + INJECT_CODE + content.substring(altIdx);
    fs.writeFileSync(entryPath, patched);
  } else {
    // Inject after installProcessWarningFilter
    const insertPos = idx + SEARCH_PATTERN.length;
    const patched = content.substring(0, insertPos) + '\n' + INJECT_CODE + content.substring(insertPos);
    fs.writeFileSync(entryPath, patched);
  }

  console.log('Patch applied successfully! OpenClaw entry file:', entryPath);
  console.log('');
  console.log('On each OpenClaw startup, model config will be read from ~/.echobird/openclaw.json');
  console.log('and injected into ~/.openclaw/openclaw.json providers');
  console.log('');
  console.log('Config file format (~/.echobird/openclaw.json):');
  console.log(JSON.stringify({
    apiKey: 'sk-xxx',
    baseUrl: 'https://api.example.com/v1',
    modelId: 'gpt-4o',
    modelName: 'GPT-4o'
  }, null, 2));

  return true;
}

// Main entry
const args = process.argv.slice(2);
const isRestore = args.includes('--restore');

if (isRestore) {
  console.log('Restoring original OpenClaw entry...');
  const success = patchOpenClaw(true);
  process.exit(success ? 0 : 1);
} else {
  console.log('Applying Echobird patch to OpenClaw...');
  const success = patchOpenClaw(false);
  process.exit(success ? 0 : 1);
}
