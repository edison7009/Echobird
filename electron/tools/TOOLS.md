# WhichClaw 工具系统架构文档

> **重要**：每次修改工具相关功能前，必须先阅读本文档。

## 核心设计理念

**目录即工具**。每个工具是 `electron/tools/<tool-id>/` 下的一个目录，包含：

```
electron/tools/<tool-id>/
├── paths.json      # 必须 — 元数据 + 路径检测规则
├── config.json     # 必须 — 配置文件读写规则
└── model.cjs/.ts   # 可选 — 自定义模型读写逻辑（config.json 的 custom:true 时使用）
```

添加新工具 = 创建目录 + 填写 JSON。无需修改任何 TypeScript 代码。

---

## paths.json 规范

定义工具的**元数据**和**检测策略**。

```jsonc
{
    // === 元数据 ===
    "name": "OpenClaw",                    // 显示名称
    "category": "AgentOS",                 // 分类：AgentOS | IDE | CLI | AutoTrading
    "docs": "https://docs.openclaw.ai",    // 官网/文档链接
    "apiProtocol": ["openai", "anthropic"],// 支持的 API 协议
    "installUrl": "https://...",           // 安装地址（可选，用于 Install 按钮）

    // === 路径检测 ===
    "command": "openclaw",                 // CLI 命令名（通过 which/where 查找）
    "envVar": "OPENCLAW_PATH",             // 环境变量检测（可选）
    "configDir": "~/.openclaw",            // 配置目录
    "configFile": "~/.openclaw/openclaw.json", // 主配置文件路径
    "requireConfigFile": true,             // 是否要求配置文件存在才算已安装
    "detectByConfigDir": false,            // true = 通过配置目录判断安装（适用于 GUI 程序）

    // 平台特定的安装路径候选（~ 和 %VAR% 会被自动展开）
    "paths": {
        "win32": [
            "%APPDATA%/npm/openclaw.cmd",
            "%LOCALAPPDATA%/Programs/OpenClaw/openclaw.exe"
        ],
        "darwin": [
            "/usr/local/bin/openclaw",
            "/opt/homebrew/bin/openclaw",
            "/Applications/OpenClaw.app/Contents/MacOS/OpenClaw"
        ],
        "linux": [
            "/usr/local/bin/openclaw",
            "/usr/bin/openclaw"
        ]
    },

    // 技能目录检测（可选）
    "skillsPath": {
        "envVar": "OPENCLAW_SKILLS_PATH",
        "win32": ["路径"],
        "npmModule": "openclaw/skills"
    },

    // VS Code 扩展检测路径（可选，支持 * 通配符匹配版本号）
    "extensionPaths": {
        "win32": ["%USERPROFILE%/.vscode/extensions/publisher.extension-*"],
        "darwin": ["~/.vscode/extensions/publisher.extension-*"],
        "linux": ["~/.vscode/extensions/publisher.extension-*"]
    },

    // === 内置工具专用字段 ===
    "alwaysInstalled": true,               // 内置工具，始终视为已安装（跳过所有检测）
    "version": "1.0",                      // 内置工具版本号（无可执行文件时使用）
    "description": "Tool description",      // 工具描述（显示在卡片上）

    // === 可启动工具字段 ===
    "launchable": true,                    // 是否可通过 LAUNCH APP 按钮启动
    "launchType": "html",                  // 启动类型（目前支持 html）
    "launchFile": "game.html"              // 启动文件名（工具目录下的文件）
}
```

### 工具类型与启动方式

| 类型 | 示例 | `command` | `paths` | `detectByConfigDir` | 启动方式 |
|------|------|-----------|---------|---------------------|----------|
| **CLI 工具** | OpenClaw, Claude Code, Codex | ✅ `"openclaw"` | CLI 路径 (.cmd/.exe) | `false` | 终端命令 (`startCommand`) |
| **IDE 扩展** | Roo Code, Continue, Cline, Tabby | ❌ 不填或留空 | — | `true` | `shell.openPath()` |
| **GUI 桌面程序** | CodeBuddy, CodeBuddy CN | ❌ 不填或留空 | exe/app 路径 | `true` | `shell.openPath()` |
| **未安装工具** | TradingAgents, FinGPT | ❌ 不填或留空 | 空数组 `[]` | `false` | — |
| **内置工具** | Reversi | ❌ 不填或留空 | — | — | `launchGame()`（应用内弹窗） |

- **CLI 工具**：优先通过 `command` + `which/where` 查找，`paths` 作为备选。通过 `default-tools.json` 中的 `startCommand` 在终端启动
- **IDE 扩展**：通过 `extensionPaths` 通配符匹配 VS Code 扩展目录，或 `detectByConfigDir` 检测。通过 `shell.openPath(detectedPath)` 打开可执行文件（跨平台）
- **GUI 程序**：没有全局命令，通过 `paths` 中的 exe/app 路径 或 `detectByConfigDir` 检测。同样通过 `shell.openPath()` 启动
- **未安装工具**：只有元数据，前端显示 INSTALL 按钮
- **内置工具**：`alwaysInstalled: true`，跳过所有检测，返回工具目录路径。可配合 `launchable` 实现应用内启动

### 三平台路径规范

路径中支持的变量会在检测时自动展开：

| 变量 | Windows 展开 | macOS/Linux 展开 |
|------|-------------|-----------------|
| `~` | `C:\Users\<user>` | `/Users/<user>` 或 `/home/<user>` |
| `%APPDATA%` | `C:\Users\<user>\AppData\Roaming` | — |
| `%LOCALAPPDATA%` | `C:\Users\<user>\AppData\Local` | — |
| `%USERPROFILE%` | `C:\Users\<user>` | — |

#### 常见路径模式

**Windows (win32)**
```
CLI 全局:  %APPDATA%/npm/<tool>.cmd
CLI Scoop: %USERPROFILE%/scoop/shims/<tool>.exe
GUI 程序:  %LOCALAPPDATA%/Programs/<AppName>/<App>.exe
```

**macOS (darwin)**
```
CLI Homebrew: /opt/homebrew/bin/<tool>
CLI 系统:     /usr/local/bin/<tool>
GUI 程序:     /Applications/<App>.app/Contents/MacOS/<App>
```

**Linux (linux)**
```
CLI 全局: /usr/local/bin/<tool>
CLI 系统: /usr/bin/<tool>
```

### 检测优先级

0. `alwaysInstalled` → 内置工具直接返回工具目录的绝对路径（跳过后续所有步骤）
1. `envVar` 环境变量
2. `command` 通过 which/where 查找
3. `paths[platform]` 固定路径列表（按顺序逐个检查）
4. `detectByConfigDir` → 配置目录存在性判断（GUI/IDE 程序专用）
5. `extensionPaths` → VS Code 扩展目录通配符匹配
6. `requireConfigFile` → 配置文件存在性校验（在步骤 2、3 中作为附加条件）

---

## config.json 规范

定义如何**读写**工具的配置文件。有两种模式：

### 模式 1：字段映射（简单工具）

```jsonc
{
    "configFile": "~/.opencode/config.json",
    "format": "json",                      // json | yaml | toml
    "read": {                              // 配置路径 → ModelInfo 字段
        "providers.openai.apiKey": "apiKey",
        "providers.openai.model": "model"
    },
    "write": {                             // 配置路径 → ModelInfo 字段
        "providers.openai.apiKey": "apiKey",
        "providers.openai.model": "model",
        "providers.openai.baseUrl": "baseUrl"
    },
    "writeProxy": {                        // 代理配置（可选）
        "network.proxy": "proxyUrl"
    }
}
```

### 模式 2：自定义模块（复杂工具）

```jsonc
{
    "configFile": "~/.openclaw/openclaw.json",
    "format": "json",
    "custom": true                         // 启用 model.cjs 自定义逻辑
}
```

当 `custom: true` 时，loader 会加载同目录下的 `model.cjs`，该模块必须导出：

```javascript
module.exports = {
    // 读取当前模型配置
    async getCurrentModelInfo(readConfig) { ... },
    // 写入模型配置
    async applyConfig(modelInfo, readConfig, writeConfig, getConfigFile) { ... }
};
```

---

## model.cjs 自定义模块规范

### 入参

- `modelInfo`：来自 WhichClaw 的模型信息
  ```typescript
  interface ModelInfo {
      id: string;        // 内部通信 ID
      name: string;      // 显示名称
      model: string;     // API 模型 ID（如 deepseek-chat）
      baseUrl: string;   // API 地址
      apiKey: string;    // API Key
      proxyUrl?: string; // 代理地址
  }
  ```
- `readConfig`：读取工具配置文件，返回解析后的对象
- `writeConfig`：写入工具配置文件，返回 boolean
- `getConfigFile`：获取配置文件路径

### 关键规则

1. **始终只保留一条模型配置**：每次写入时将模型列表替换为只含当前模型的数组，而非追加。这确保用户始终拥有清爽的配置，不会因反复切换模型而累积垃圾数据。示例：`config.models = [newModel]`
2. **不写入工具不认识的字段**：严格遵守目标工具的配置格式（OpenClaw 的教训）
3. **vendor 从 URL 提取**：`api.deepseek.com` → `deepseek`（如果目标工具需要 vendor 字段）
4. **声明式 write 映射天然安全**：使用固定配置路径覆盖（如 `"providers.openai.model": "model"`），不存在累积问题

---

## 数据流

```
用户在前端选择模型 → 点击 MODIFY ONLY
    ↓
App.tsx: applyModelConfig(toolId, modelInternalId)
    ↓
IPC: applyModelToTool → toolConfigManager.ts
    ↓
loader.ts: DataDrivenToolConfigurator.applyConfig()
    ├── custom:true → 加载 model.cjs 执行自定义逻辑
    └── custom:false → 根据 config.json 的 write 映射直接写入
    ↓
写入工具配置文件（如 ~/.openclaw/openclaw.json）
```

---

## 工具扫描流程

```
toolManager.scanInstalledTools()
    ↓
1. toolLoader.initialize()  → 扫描 electron/tools/*/ 目录
2. 对每个目录：读取 paths.json + config.json → 创建 DataDrivenToolConfigurator
3. 逐个 detect() → 检测安装状态
4. 逐个 getCurrentModelInfo() → 读取当前模型
5. 返回 DetectedTool[] 给前端
```

---

## 添加新工具清单

1. 创建 `electron/tools/<tool-id>/` 目录
2. 编写 `paths.json`（元数据 + 路径检测）
3. 编写 `config.json`（配置读写规则）
4. 如需自定义逻辑：编写 `model.cjs`（设 `custom: true`）
5. 运行 `npm run build:tools`
6. 重启后端 → 工具自动出现在前端

**无需修改**：`main.ts`、`App.tsx`、`toolManager.ts`、`loader.ts`

---

## 未来规划：用户自定义工具

用户将可以通过前端 UI 添加自定义工具：
- 添加本地应用程序/终端命令
- 通过 Logs & Debug 页面的 AI 辅助配置
- AI 根据本文档的规则自动生成 paths.json 和 config.json
- 前提：我们自己的规则必须清晰完善

---

## 补丁注入方案（Patch Injection）

> 适用于：Cline、Roo Code 等不支持纯配置文件方式的 VS Code 扩展

### 通用原理

某些 VS Code 扩展（如 Cline、Roo Code）将 API Key 存储在 VS Code 的 globalState / SecretStorage 中，
无法通过简单的 JSON 配置文件修改。解决方案是在扩展的 `extension.js` 中注入代码，
启动时从 `~/.whichclaw/<tool>.json` 读取外部配置，覆盖内部缓存。

### 文件结构

```
electron/tools/<tool>/
├── paths.json          # 元数据 + 扩展路径检测
├── config.json         # custom: true（使用 model.cjs）
├── model.ts → model.cjs  # Apply 时写入配置文件 + 自动打补丁
└── patch-<tool>.cjs    # 补丁脚本，修改 extension.js
```

### 工作流程

```
用户点击 Apply → model.cjs
  ├── 1. 写入 ~/.whichclaw/<tool>.json（API Key、模型 ID、Base URL）
  ├── 2. ensurePatch() 检测补丁标记
  │     ├── 已打补丁 → 跳过
  │     └── 未打补丁 → 自动执行 patch-<tool>.cjs
  └── 3. 返回结果，提示用户重启 VS Code

VS Code 启动 → 扩展加载 extension.js
  └── 注入代码读取 ~/.whichclaw/<tool>.json → 覆盖 stateCache / secretCache
```

### 补丁脚本规范（patch-\<tool\>.cjs）

```bash
# 打补丁
node patch-<tool>.cjs

# 恢复原始文件
node patch-<tool>.cjs --restore
```

**关键要素：**
- `PATCH_MARKER`：唯一标记（如 `[WhichClaw-Patched]`），用于检测是否已打补丁
- 自动备份原始 `extension.js`（`.whichclaw-backup` 后缀）
- 重复打补丁时先从 backup 恢复再重新注入
- 注入代码用 IIFE + try/catch 包裹，失败时静默降级

### Cline 具体实现

**注入点**：`extension.js` 中 `.populateCache(r,n,o),` 之后

**配置文件**：`~/.whichclaw/cline.json`

```json
{
  "provider": "openai",
  "apiKey": "sk-xxx",
  "baseUrl": "https://api.example.com/v1",
  "modelId": "gpt-4o",
  "modelName": "GPT-4o"
}
```

**字段映射（Cline 3.61.0+，per-mode provider）**：

| Cache | 字段名 | 值 |
|-------|--------|-----|
| globalStateCache | `actModeApiProvider` | `"openai"` |
| globalStateCache | `planModeApiProvider` | `"openai"` |
| globalStateCache | `actModeOpenAiModelId` | Model ID |
| globalStateCache | `planModeOpenAiModelId` | Model ID |
| globalStateCache | `openAiBaseUrl` | API Base URL |
| globalStateCache | `actModeOpenAiModelInfo` | `{ maxTokens, contextWindow, ... }` |
| globalStateCache | `planModeOpenAiModelInfo` | (same) |
| secretsCache | `openAiApiKey` | API Key |

> ⚠️ Cline 3.61.0 改为 per-mode provider：`actModeApiProvider` / `planModeApiProvider`，旧版 `apiProvider` 已失效。

**字段来源**：`cline/cline` → `src/shared/storage/state-keys.ts`

### Roo Code 具体实现

**注入点**：`extension.js` 中 `this._isInitialized=!0` 之前（StateManager.initialize() 末尾）

**配置文件**：`~/.whichclaw/roocode.json`

```json
{
  "apiKey": "sk-xxx",
  "baseUrl": "https://api.example.com/v1",
  "modelId": "model-name",
  "modelName": "Model Name"
}
```

**字段映射**：

| 写入目标 | 字段名 | 值 |
|----------|--------|-----|
| stateCache | `apiProvider` | `"openai"` |
| stateCache | `openAiModelId` | Model ID |
| stateCache | `openAiBaseUrl` | API Base URL |
| secretCache | `openAiApiKey` | API Key |
| originalContext.globalState | apiProvider / openAiModelId / openAiBaseUrl | (持久化) |
| originalContext.secrets | openAiApiKey | (持久化到 VS Code SecretStorage) |

> ⚠️ Roo Code（Cline fork）需要**双重写入**：内存缓存 + VS Code 存储 API。仅写内存缓存会导致 API Key 丢失。

### 不适用补丁的工具

以下工具使用封闭式服务器代理模式，无法通过本地补丁集成：
- **Cursor** — AI 请求通过 `api2.cursor.sh` 代理，API Key 绑定 Cursor Pro 账号
- **GitHub Copilot** — AI 请求通过 GitHub API 代理，API Key 绑定 Copilot 订阅

### 注意事项

1. Apply 后必须**重启 VS Code** 才能生效（注入代码仅在扩展加载时执行一次）
2. 扩展更新后补丁自动重打（`ensurePatch()` 每次 Apply 时检测）
3. Cline 仅支持 OpenAI Compatible（Anthropic 不支持自定义 base URL）
4. Roo Code 仅支持 OpenAI Compatible（同上）
5. 有 `extensionPaths` 的工具应设 `detectByConfigDir: false`，避免卸载后配置目录残留导致误判

---

## OpenClaw 补丁注入方案

> 适用于：OpenClaw（npm 全局安装的 CLI 工具）

### 与 VS Code 扩展补丁的差异

| 对比项 | VS Code 扩展（Cline 等） | OpenClaw |
|--------|------------------------|----------|
| 补丁目标 | `extension.js` | `openclaw.mjs`（ESM 入口） |
| 注入语法 | CommonJS（`require`） | ESM（`import ... from "node:fs"`） |
| 配置影响 | 覆盖扩展内存缓存 | 修改 `~/.openclaw/openclaw.json` 的 `models.providers` |
| 认证方式 | 直接写入 API Key 到缓存 | 通过自定义 provider 的 `apiKey` 字段 |
| 协议支持 | 仅 OpenAI Compatible | OpenAI + Anthropic（通过 `api` 字段切换） |

### 工作流程

```
用户点击 Apply → model.cjs（新版补丁注入模式）
  ├── 1. 写入 ~/.whichclaw/openclaw.json（API Key、模型 ID、Base URL、protocol）
  ├── 2. ensurePatch() 检测 openclaw.mjs 是否已打补丁
  │     ├── 已打补丁 → 跳过
  │     └── 未打补丁 → 自动执行 patch-openclaw.cjs
  └── 3. 返回结果

OpenClaw 启动 → 执行 openclaw.mjs
  └── 注入代码读取 ~/.whichclaw/openclaw.json
      ├── 清理旧的 wc_ 前缀 provider
      ├── 根据 protocol 决定 api 字段（openai-completions / anthropic-messages）
      ├── 创建新的 wc_<providerTag> 自定义 provider
      ├── 设置 agents.defaults.model.primary 指向新 provider
      └── 写回 ~/.openclaw/openclaw.json
```

### 协议处理

OpenAI 和 Anthropic **统一走自定义 provider**，区别只在 `api` 字段：

```jsonc
// protocol = "openai" → api: "openai-completions"
// protocol = "anthropic" → api: "anthropic-messages"
{
  "models": {
    "providers": {
      "wc_xiaomimimo": {
        "baseUrl": "https://api.xiaomimimo.com/anthropic",
        "apiKey": "sk-xxx",
        "api": "anthropic-messages",  // ← 唯一区别
        "auth": "api-key",
        "authHeader": true,
        "models": [{ "id": "mimo-v2-flash", "name": "mimo-v2-flash", ... }]
      }
    }
  },
  "agents": { "defaults": { "model": { "primary": "wc_xiaomimimo/mimo-v2-flash" } } }
}
```

### 踩坑记录

> ⚠️ 以下是调试过程中实际遇到的问题，务必注意。

1. **编译流程不完整导致代码不生效**
   - `start.bat` 原来只调 `esbuild main.ts preload.ts`，**不调 `build:tools`**
   - 导致 `electron/tools/` 下的所有修改（`.ts`、`.json`、`.cjs`）都不会编译到 `dist-electron/tools/`
   - 已修复：`start.bat` 现在调用完整流程 `copy:config → build:tools → build:main`
   - **永远用 `start.bat` 或 `npm run dev` 启动**，不要手动 esbuild

2. **不能用 OpenClaw 内置 Anthropic provider**
   - OpenClaw 内置 `anthropic/` 前缀只认 Claude 系列模型名（`claude-sonnet-4-20250514` 等）
   - 非 Claude 模型（如 `mimo-v2-flash`）用 `anthropic/` 前缀会报 `Unknown model`
   - 解决：统一走自定义 provider `wc_xxx`，通过 `api: "anthropic-messages"` 区分协议

3. **OpenClaw 严格校验 JSON Schema**
   - 自定义 provider 中不能有 OpenClaw 不认识的字段（如我们加的 `_whichclaw: true`）
   - 会导致 `Unrecognized key` 错误，配置被判定为 invalid
   - 解决：用 `wc_` 命名前缀识别 WhichClaw 推送的 provider，不加额外标记字段

4. **OpenClaw 进程自动重启（daemon 自救）**
   - OpenClaw 有 heartbeat 机制，进程被杀后会自动重启
   - 测试补丁时必须确保**杀掉所有相关进程**后再启动
   - Windows：`taskkill /f /im openclaw.exe` 或在任务管理器中手动结束

5. **补丁更新需要重新打**
   - 修改 `patch-openclaw.cjs` 后，`openclaw.mjs` 中注入的是旧代码
   - 必须重新执行 `node patch-openclaw.cjs` 更新注入内容
   - `model.ts` 的 `ensurePatch()` 只检测补丁标记是否存在，不检测内容是否最新

---

## Codex 诈骗方案（Responses→Chat 代理）

> 适用于：Codex CLI（本地安装的编码代理工具）

### 问题背景

Codex 新版**只支持 `wire_api = "responses"`**（`/v1/responses` 格式），已移除 `chat` 支持。
但所有第三方模型（DeepSeek、Qwen、MiniMax 等）**只支持 `/v1/chat/completions`**。

由于 Codex 的 API 请求逻辑在**编译好的 Rust 二进制文件**（`codex.exe`）中，无法通过 JS 补丁修改请求格式。

### 解决方案：本地代理双向格式转换

```
Codex（发 /v1/responses）
    ↓
WhichClaw 本地代理（127.0.0.1:自动端口）
    ├── 请求：Responses → Chat Completions
    ├── 响应：Chat Completions → Responses
    └── 流式：Chat SSE → Responses SSE
    ↓
第三方 API（收 /v1/chat/completions）
```

**Codex 以为在跟 OpenAI 对话，第三方 API 以为收到了标准请求。两边都被"骗"了。**

### 核心文件

| 文件 | 用途 |
|------|------|
| `codex/responsesProxy.ts` | 代理核心：格式转换 + HTTP 代理服务器 |
| `codex/model.ts` | 配置逻辑：自动判断是否需要代理 |

### 工作流程

```
用户点击 Apply → model.ts applyConfig()
  ├── 判断 baseUrl 是否为 api.openai.com
  │     ├── 是 OpenAI → 直连，停止旧代理，base_url = 原始地址
  │     └── 非 OpenAI → 启动诈骗代理
  │           ├── startCodexProxy(realBaseUrl, apiKey)
  │           ├── 获得代理端口（系统自动分配）
  │           └── base_url = http://127.0.0.1:<port>/v1
  ├── 写入 config.toml（base_url 指向代理或原始地址）
  ├── 写入 codex.json（API Key，补丁注入用）
  └── ensurePatch()

Codex 运行时 → 请求 http://127.0.0.1:<port>/v1/responses
  └── 代理收到 → responsesToChatCompletions() 转换 → 发给真实 API
      └── 真实 API 响应 → chatCompletionsToResponses() 转换 → 返回 Codex
```

### 格式映射

**请求转换**：

| Responses API 字段 | Chat Completions 映射 |
|------|------|
| `instructions` | `messages[0] = {role: "system", content: ...}` |
| `input`（字符串） | `messages[n] = {role: "user", content: ...}` |
| `input`（数组） | 遍历 item，按 type/role 映射到 messages |
| `max_output_tokens` | `max_tokens` |
| `temperature` | `temperature` |

**流式 SSE 事件映射**：

| Chat Completions SSE | → 转换为 Responses SSE |
|-----|-----|
| 首次连接 | `response.created` → `response.in_progress` → `output_item.added` → `content_part.added` |
| `delta.content` | `response.output_text.delta` |
| `[DONE]` | `output_text.done` → `content_part.done` → `output_item.done` → `response.completed` |

### 与补丁方案的对比

| 对比项 | 补丁方案（Cline/OpenClaw） | 诈骗方案（Codex） |
|--------|--------------------------|-------------------|
| 修改对象 | 工具内的 JS 源码 | 不修改任何代码 |
| 原理 | 注入代码覆盖配置 | 本地代理格式转换 |
| 升级影响 | 工具升级后需重新打补丁 | 完全不受影响 |
| 适用场景 | API 格式兼容的情况 | API 格式不兼容的情况 |
| 已知限制 | — | 不支持 Codex 的工具调用（function_call） |

### 踩坑记录

> ⚠️ 以下是调试过程中实际遇到的问题，务必注意。

1. **esbuild `bundle: false` + `.cjs` 后缀 = require 解析失败**
   - `build-tools.mjs` 用 `bundle: false` + `outExtension: { '.js': '.cjs' }` 编译
   - TypeScript 的 `import { foo } from './bar'` 编译为 `require("./bar")`
   - **Node.js `require()` 只自动尝试 `.js`/`.json`/`.node`，不尝试 `.cjs`**
   - 所以 `require("./bar")` 找不到 `bar.cjs`，加载失败，`customModelModule` 为 undefined
   - 解决：**所有代码必须合并到单个 `.ts` 文件**，不能有跨文件 import
   - 这就是为什么代理代码直接写在 `model.ts` 里，而不是独立的 `responsesProxy.ts`

2. **旧 config.toml 残留 `wire_api = "chat"`**
   - 之前尝试直接用 `wire_api = "chat"` 的旧配置会残留在 `~/.codex/config.toml`
   - Codex 新版会直接报错：`'wire_api = "chat"' is no longer supported`
   - 解决：重新 Apply 模型让代码覆盖 config.toml，或手动改为 `wire_api = "responses"`

3. **代理端口动态分配**
   - 代理用 `server.listen(0)` 让系统自动分配空闲端口
   - 不要用固定端口，避免与应用自带的代理（localModelHandlers）冲突
   - 端口号写入 config.toml 的 `base_url = "http://127.0.0.1:<port>/v1"`

4. **Codex 二进制不可修改**
   - 不同于 Cline/OpenClaw 的 JS 入口，Codex 的 API 逻辑在编译好的 Rust 二进制 `codex.exe` 中
   - 无法通过补丁修改请求格式，只能用代理方案"骗"
   - 这也是为什么诈骗方案比补丁方案更适合 Codex

5. **`developer` 角色不被第三方 API 识别**
   - OpenAI 新版 API 用 `developer` 角色替代 `system`
   - Codex 发送的消息里会包含 `role: "developer"`
   - 第三方 API（如 MiniMax、DeepSeek）不认这个角色，返回 400 错误
   - 解决：代理中将 `developer` 映射为 `system`

6. **部分 API 完全不支持 `system` 角色**
   - MiniMax M2.5 也不认 `system` 角色，返回 `invalid message role: system`
   - 解决：将 `system` 消息内容合并到下一条 `user` 消息中，加 `[System Instructions]` 前缀
   - 这样所有 API 都只会收到 `user` + `assistant` 角色，最大兼容性

7. **流式响应必须检查 statusCode**
   - 上游返回非 200 时（如 401/400），若直接进入流式处理会静默返回空文本
   - Codex 收到空的 `response.completed`，表现为"没回复"（无报错）
   - 解决：进入流式/非流式处理前统一检查 statusCode，非 200 直接返回错误正文

8. **本地模型的 `modelId` 可能为空**
   - 云端模型有明确的 `modelId`（如 `deepseek-chat`），但本地模型没有
   - Codex 显示的模型名来自 config.toml 的 `model` 字段
   - 解决：`model = modelInfo.model || modelInfo.name || 'unknown'` 做 fallback

### 验证结果

| 模型类型 | 示例 | 状态 |
|---------|------|------|
| 第三方云端 | xiaomimo (mimo-v2-flash)、DeepSeek (deepseek-chat) | ✅ 正常 |
| 第三方云端（思维链） | MiniMax (MiniMax-M2.5) | ✅ 正常（输出含 think 标签） |
| 本地模型 | qwen2.5-coder-1.5b-instruct | ✅ 正常 |
| OpenAI 官方 | 直连不走代理 | ✅ 设计如此 |

