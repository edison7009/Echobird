/**
 * WhichClaw Cline 补丁脚本
 * 在已安装的 Cline 扩展的 extension.js 中注入外部配置读取代码
 * 
 * 功能：在 StateManager.populateCache() 调用后注入一段代码，
 * 从 ~/.whichclaw/cline.json 读取配置并覆盖 globalStateCache 和 secretsCache。
 * 
 * 支持 OpenAI Compatible 和 Anthropic 两种 API 协议。
 * 
 * 用法：node patch-cline.cjs [--restore]
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Cline 扩展搜索路径
const VSCODE_EXTENSIONS_DIR = path.join(os.homedir(), '.vscode', 'extensions');
const CLINE_EXTENSION_PREFIX = 'saoudrizwan.claude-dev-';

// WhichClaw 补丁标记
const PATCH_MARKER = '/* [WhichClaw-Patched] */';

// 要注入的代码 — 在 populateCache 后读取外部配置文件
// 适配 Cline 3.61.0+：使用 actModeApiProvider / planModeApiProvider
// 仅支持 OpenAI Compatible 模式
const INJECT_CODE = `
${PATCH_MARKER}
(function(){try{
var _wc_fs=require("fs"),_wc_path=require("path"),_wc_os=require("os");
var _wc_cfg_path=_wc_path.join(_wc_os.homedir(),".whichclaw","cline.json");
if(_wc_fs.existsSync(_wc_cfg_path)){
var _wc_cfg=JSON.parse(_wc_fs.readFileSync(_wc_cfg_path,"utf-8"));
if(_wc_cfg.apiKey&&_wc_cfg.modelId){
var _inst=t.instance,_gs=_inst.globalStateCache,_sc=_inst.secretsCache;
var _mi={maxTokens:8192,contextWindow:128000,supportsImages:true,supportsPromptCache:false,inputPrice:0,outputPrice:0,description:"[WhichClaw] "+(_wc_cfg.modelName||_wc_cfg.modelId)};
_gs.actModeApiProvider="openai";
_gs.planModeApiProvider="openai";
_gs.actModeOpenAiModelId=_wc_cfg.modelId;
_gs.planModeOpenAiModelId=_wc_cfg.modelId;
if(_wc_cfg.baseUrl)_gs.openAiBaseUrl=_wc_cfg.baseUrl;
_gs.actModeOpenAiModelInfo=_mi;
_gs.planModeOpenAiModelInfo=_mi;
_sc.openAiApiKey=_wc_cfg.apiKey;
console.log("[WhichClaw] Loaded: openai-compat, model="+_wc_cfg.modelId);
}}
}catch(_wc_err){console.warn("[WhichClaw] Failed to load config:",_wc_err.message);}})(),
`;

/**
 * 查找已安装的 Cline 扩展目录
 */
function findClineExtension() {
    if (!fs.existsSync(VSCODE_EXTENSIONS_DIR)) {
        console.error('VS Code 扩展目录不存在:', VSCODE_EXTENSIONS_DIR);
        return null;
    }

    const dirs = fs.readdirSync(VSCODE_EXTENSIONS_DIR)
        .filter(d => d.startsWith(CLINE_EXTENSION_PREFIX))
        .sort()
        .reverse(); // 最新版本排前面

    if (dirs.length === 0) {
        console.error('未找到已安装的 Cline 扩展');
        return null;
    }

    console.log(`找到 ${dirs.length} 个 Cline 扩展版本:`, dirs);
    return path.join(VSCODE_EXTENSIONS_DIR, dirs[0]);
}

/**
 * 对 Cline 的 extension.js 打补丁
 */
function patchCline(restore = false) {
    const extDir = findClineExtension();
    if (!extDir) return false;

    const extensionJsPath = path.join(extDir, 'dist', 'extension.js');
    if (!fs.existsSync(extensionJsPath)) {
        console.error('extension.js 不存在:', extensionJsPath);
        return false;
    }

    // 备份原始文件
    const backupPath = extensionJsPath + '.whichclaw-backup';

    if (restore) {
        // 恢复原始文件
        if (fs.existsSync(backupPath)) {
            fs.copyFileSync(backupPath, extensionJsPath);
            console.log('✅ 已恢复原始 extension.js');
            return true;
        } else {
            console.error('备份文件不存在:', backupPath);
            return false;
        }
    }

    // 读取 extension.js
    let content = fs.readFileSync(extensionJsPath, 'utf-8');

    // 检查是否已经打过补丁
    if (content.includes(PATCH_MARKER)) {
        console.log('⚠️ 扩展已经打过补丁，先恢复再重新打补丁');
        if (fs.existsSync(backupPath)) {
            content = fs.readFileSync(backupPath, 'utf-8');
        } else {
            console.error('备份文件不存在，无法重新打补丁');
            return false;
        }
    } else {
        // 首次打补丁，创建备份
        fs.copyFileSync(extensionJsPath, backupPath);
        console.log('📦 已备份原始文件:', backupPath);
    }

    // 查找注入点：t.instance.populateCache(r,n,o)
    const SEARCH_PATTERN = '.populateCache(r,n,o),';
    const idx = content.indexOf(SEARCH_PATTERN);

    if (idx < 0) {
        console.error('❌ 未找到注入点 (.populateCache(r,n,o),)');
        console.error('Cline 版本可能不兼容，请检查 extension.js');
        return false;
    }

    // 在 populateCache(r,n,o), 后面注入代码
    const insertPos = idx + SEARCH_PATTERN.length;
    const patched = content.substring(0, insertPos) + INJECT_CODE + content.substring(insertPos);

    // 写入修补后的文件
    fs.writeFileSync(extensionJsPath, patched);

    console.log('✅ 补丁成功！注入位置:', idx);
    console.log('📁 Cline 扩展路径:', extDir);
    console.log('');
    console.log('💡 下次 VS Code 启动 Cline 时，会自动从 ~/.whichclaw/cline.json 读取配置');
    console.log('');
    console.log('配置文件格式 (~/.whichclaw/cline.json):');
    console.log(JSON.stringify({
        provider: 'openai',
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
    console.log('🔄 恢复原始 Cline 扩展...');
    const success = patchCline(true);
    process.exit(success ? 0 : 1);
} else {
    console.log('🔧 正在为 Cline 打 WhichClaw 补丁...');
    const success = patchCline(false);
    process.exit(success ? 0 : 1);
}
