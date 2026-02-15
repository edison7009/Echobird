/**
 * WhichClaw Roo Code Patch Script
 * Injects external config reading code into installed Roo Code extension's extension.js
 * 
 * Injects after initialize() fills stateCache/secretCache,
 * reads ~/.whichclaw/roocode.json and overrides API provider settings.
 *
 * Usage: node patch-roocode.cjs [--restore]
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Roo Code extension search path
const VSCODE_EXTENSIONS_DIR = path.join(os.homedir(), '.vscode', 'extensions');
const ROOCODE_EXTENSION_PREFIX = 'rooveterinaryinc.roo-cline-';

// WhichClaw patch marker
const PATCH_MARKER = '/* [WhichClaw-RooCode-Patched] */';

// Injection code — override stateCache/secretCache after initialize()
// Roo Code uses: stateCache for globalState, secretCache for secrets
const INJECT_CODE = `
${PATCH_MARKER}
(function(){try{
var _wc_fs=require("fs"),_wc_path=require("path"),_wc_os=require("os");
var _wc_cfg_path=_wc_path.join(_wc_os.homedir(),".whichclaw","roocode.json");
if(_wc_fs.existsSync(_wc_cfg_path)){
var _wc_cfg=JSON.parse(_wc_fs.readFileSync(_wc_cfg_path,"utf-8"));
if(_wc_cfg.apiKey&&_wc_cfg.modelId){
var _gs=this.stateCache,_sc=this.secretCache,_ctx=this.originalContext;
_gs.apiProvider="openai";
_gs.openAiModelId=_wc_cfg.modelId;
if(_wc_cfg.baseUrl)_gs.openAiBaseUrl=_wc_cfg.baseUrl;
_sc.openAiApiKey=_wc_cfg.apiKey;
_ctx.globalState.update("apiProvider","openai");
_ctx.globalState.update("openAiModelId",_wc_cfg.modelId);
if(_wc_cfg.baseUrl)_ctx.globalState.update("openAiBaseUrl",_wc_cfg.baseUrl);
_ctx.secrets.store("openAiApiKey",_wc_cfg.apiKey);
console.log("[WhichClaw] RooCode loaded: model="+_wc_cfg.modelId);
}}
}catch(_wc_err){console.warn("[WhichClaw] RooCode config error:",_wc_err.message);}}).call(this),
`;

/**
 * Find installed Roo Code extension directory
 */
function findRooCodeExtension() {
    if (!fs.existsSync(VSCODE_EXTENSIONS_DIR)) {
        console.error('VS Code extensions directory not found:', VSCODE_EXTENSIONS_DIR);
        return null;
    }

    const dirs = fs.readdirSync(VSCODE_EXTENSIONS_DIR)
        .filter(d => d.startsWith(ROOCODE_EXTENSION_PREFIX))
        .sort()
        .reverse(); // latest version first

    if (dirs.length === 0) {
        console.error('Roo Code extension not found');
        return null;
    }

    console.log(`Found ${dirs.length} Roo Code version(s):`, dirs);
    return path.join(VSCODE_EXTENSIONS_DIR, dirs[0]);
}

/**
 * Patch Roo Code's extension.js
 */
function patchRooCode(restore = false) {
    const extDir = findRooCodeExtension();
    if (!extDir) return false;

    const extensionJsPath = path.join(extDir, 'dist', 'extension.js');
    if (!fs.existsSync(extensionJsPath)) {
        console.error('extension.js not found:', extensionJsPath);
        return false;
    }

    // Backup original file
    const backupPath = extensionJsPath + '.whichclaw-backup';

    if (restore) {
        if (fs.existsSync(backupPath)) {
            fs.copyFileSync(backupPath, extensionJsPath);
            console.log('Restored original extension.js');
            return true;
        } else {
            console.error('Backup file not found:', backupPath);
            return false;
        }
    }

    // Read extension.js
    let content = fs.readFileSync(extensionJsPath, 'utf-8');

    // Check if already patched
    if (content.includes(PATCH_MARKER)) {
        console.log('Extension already patched, restoring before re-patch');
        if (fs.existsSync(backupPath)) {
            content = fs.readFileSync(backupPath, 'utf-8');
        } else {
            console.error('Backup not found, cannot re-patch');
            return false;
        }
    } else {
        // First patch, create backup
        fs.copyFileSync(extensionJsPath, backupPath);
        console.log('Backed up original file:', backupPath);
    }

    // Find injection point: this._isInitialized=!0 in the initialize() method
    // Unique anchor: migrateOldDefaultCondensingPrompt(),this._isInitialized=!0
    const SEARCH_PATTERN = 'this._isInitialized=!0';

    // Find all occurrences
    const indices = [];
    let searchFrom = 0;
    while (true) {
        const idx = content.indexOf(SEARCH_PATTERN, searchFrom);
        if (idx < 0) break;
        indices.push(idx);
        searchFrom = idx + SEARCH_PATTERN.length;
    }

    if (indices.length === 0) {
        console.error('Injection point not found (this._isInitialized=!0)');
        console.error('Roo Code version may not be compatible');
        return false;
    }

    // Find the one near stateCache (in the StateManager class)
    let targetIdx = -1;
    for (const idx of indices) {
        const nearby = content.substring(Math.max(0, idx - 2000), idx);
        if (nearby.includes('stateCache') && nearby.includes('secretCache')) {
            targetIdx = idx;
            break;
        }
    }

    if (targetIdx < 0) {
        console.error('Could not find injection point near stateCache/secretCache');
        return false;
    }

    // Insert before this._isInitialized=!0
    const patched = content.substring(0, targetIdx) + INJECT_CODE + content.substring(targetIdx);

    // Write patched file
    fs.writeFileSync(extensionJsPath, patched);

    console.log('Patch successful! Injection at:', targetIdx);
    console.log('Roo Code extension path:', extDir);
    console.log('');
    console.log('Roo Code will read config from ~/.whichclaw/roocode.json on next VS Code start');
    console.log('');
    console.log('Config format (~/.whichclaw/roocode.json):');
    console.log(JSON.stringify({
        apiKey: 'sk-xxx',
        baseUrl: 'https://api.example.com/v1',
        modelId: 'model-name',
        modelName: 'Model Name'
    }, null, 2));

    return true;
}

// Main entry
const args = process.argv.slice(2);
const isRestore = args.includes('--restore');

if (isRestore) {
    console.log('Restoring original Roo Code extension...');
    const success = patchRooCode(true);
    process.exit(success ? 0 : 1);
} else {
    console.log('Patching Roo Code for WhichClaw...');
    const success = patchRooCode(false);
    process.exit(success ? 0 : 1);
}
