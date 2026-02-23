/**
 * Echobird Cline Patch Script
 * Injects external config reading code into the installed Cline extension's extension.js
 * 
 * Functionality: After the StateManager.populateCache() call, injects code that
 * reads config from ~/.echobird/cline.json and overrides globalStateCache and secretsCache.
 * 
 * Supports OpenAI Compatible and Anthropic API protocols.
 * 
 * Usage: node patch-cline.cjs [--restore]
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Cline extension search paths
const VSCODE_EXTENSIONS_DIR = path.join(os.homedir(), '.vscode', 'extensions');
const CLINE_EXTENSION_PREFIX = 'saoudrizwan.claude-dev-';

// Echobird patch marker
const PATCH_MARKER = '/* [Echobird-Patched] */';

// Code to inject — reads external config file after populateCache
// Compatible with Cline 3.61.0+: uses actModeApiProvider / planModeApiProvider
// Only OpenAI Compatible mode currently supported
const INJECT_CODE = `
${PATCH_MARKER}
(function(){try{
var _wc_fs=require("fs"),_wc_path=require("path"),_wc_os=require("os");
var _wc_cfg_path=_wc_path.join(_wc_os.homedir(),".echobird","cline.json");
if(_wc_fs.existsSync(_wc_cfg_path)){
var _wc_cfg=JSON.parse(_wc_fs.readFileSync(_wc_cfg_path,"utf-8"));
if(_wc_cfg.apiKey&&_wc_cfg.modelId){
var _inst=t.instance,_gs=_inst.globalStateCache,_sc=_inst.secretsCache;
var _mi={maxTokens:8192,contextWindow:128000,supportsImages:true,supportsPromptCache:false,inputPrice:0,outputPrice:0,description:"[Echobird] "+(_wc_cfg.modelName||_wc_cfg.modelId)};
_gs.actModeApiProvider="openai";
_gs.planModeApiProvider="openai";
_gs.actModeOpenAiModelId=_wc_cfg.modelId;
_gs.planModeOpenAiModelId=_wc_cfg.modelId;
if(_wc_cfg.baseUrl)_gs.openAiBaseUrl=_wc_cfg.baseUrl;
_gs.actModeOpenAiModelInfo=_mi;
_gs.planModeOpenAiModelInfo=_mi;
_sc.openAiApiKey=_wc_cfg.apiKey;
console.log("[Echobird] Loaded: openai-compat, model="+_wc_cfg.modelId);
}}
}catch(_wc_err){console.warn("[Echobird] Failed to load config:",_wc_err.message);}})(),
`;

/**
 * Find the installed Cline extension directory
 */
function findClineExtension() {
    if (!fs.existsSync(VSCODE_EXTENSIONS_DIR)) {
        console.error('VS Code extensions directory not found:', VSCODE_EXTENSIONS_DIR);
        return null;
    }

    const dirs = fs.readdirSync(VSCODE_EXTENSIONS_DIR)
        .filter(d => d.startsWith(CLINE_EXTENSION_PREFIX))
        .sort()
        .reverse(); // Latest version first

    if (dirs.length === 0) {
        console.error('No installed Cline extension found');
        return null;
    }

    console.log(`Found ${dirs.length} Cline extension versions:`, dirs);
    return path.join(VSCODE_EXTENSIONS_DIR, dirs[0]);
}

/**
 * Patch Cline's extension.js entry file
 */
function patchCline(restore = false) {
    const extDir = findClineExtension();
    if (!extDir) return false;

    const extensionJsPath = path.join(extDir, 'dist', 'extension.js');
    if (!fs.existsSync(extensionJsPath)) {
        console.error('extension.js does not exist:', extensionJsPath);
        return false;
    }

    // Backup original file
    const backupPath = extensionJsPath + '.echobird-backup';

    if (restore) {
        // Restore original file
        if (fs.existsSync(backupPath)) {
            fs.copyFileSync(backupPath, extensionJsPath);
            console.log('Original extension.js restored');
            return true;
        } else {
            console.error('Backup file does not exist:', backupPath);
            return false;
        }
    }

    // Read extension.js
    let content = fs.readFileSync(extensionJsPath, 'utf-8');

    // Check if already patched
    if (content.includes(PATCH_MARKER)) {
        console.log('Extension already patched, restoring before re-patching');
        if (fs.existsSync(backupPath)) {
            content = fs.readFileSync(backupPath, 'utf-8');
        } else {
            console.error('Backup file does not exist, cannot re-patch');
            return false;
        }
    } else {
        // First time patching, create backup
        fs.copyFileSync(extensionJsPath, backupPath);
        console.log('Original file backed up:', backupPath);
    }

    // Injection point: t.instance.populateCache(r,n,o)
    const SEARCH_PATTERN = '.populateCache(r,n,o),';
    const idx = content.indexOf(SEARCH_PATTERN);

    if (idx < 0) {
        console.error('Injection point not found (.populateCache(r,n,o),)');
        console.error('Cline version might be incompatible, please check extension.js');
        return false;
    }

    // Inject code after populateCache(r,n,o),
    const insertPos = idx + SEARCH_PATTERN.length;
    const patched = content.substring(0, insertPos) + INJECT_CODE + content.substring(insertPos);

    // Write patched file
    fs.writeFileSync(extensionJsPath, patched);

    console.log('Patch applied successfully! Injection position:', idx);
    console.log('Cline extension path:', extDir);
    console.log('');
    console.log('On next Cline startup within VS Code, configuration will be read from ~/.echobird/cline.json');
    console.log('');
    console.log('Config file format (~/.echobird/cline.json):');
    console.log(JSON.stringify({
        provider: 'openai',
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
    console.log('Restoring original Cline extension...');
    const success = patchCline(true);
    process.exit(success ? 0 : 1);
} else {
    console.log('Applying Echobird patch to Cline...');
    const success = patchCline(false);
    process.exit(success ? 0 : 1);
}
