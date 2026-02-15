# WhichClaw 构建与打包指南

## 快速开始

### 开发模式
```bash
npm run dev
```

### 生产打包（Windows 本地）
```bash
# Windows PowerShell
$env:CSC_IDENTITY_AUTO_DISCOVERY='false'
npm run build
```

> ⚠️ 如果编辑器（VS Code/Cursor）的文件监视器导致构建失败，
> 输出到项目外目录：
> ```bash
> npx electron-builder --win nsis -c.directories.output=d:/build-output
> ```

### 仅打包（跳过编译，前提是 dist/ 和 dist-electron/ 已存在）
```bash
$env:CSC_IDENTITY_AUTO_DISCOVERY='false'
npx electron-builder --win nsis
```

产物输出到 `release/` 目录。

---

## 构建流程

`npm run build` 按顺序执行：

```
copy:config → build:tools → build:main → vite build → electron-builder
```

| 步骤 | 脚本 | 说明 |
|------|------|------|
| 1. `copy:config` | `scripts/copy-config.mjs` | 复制 `electron/config/` → `dist-electron/config/` |
| 2. `build:tools` | `scripts/build-tools.mjs` | 编译 `electron/tools/` 下的工具模块 |
| 3. `build:main` | `scripts/build-main.mjs` | 用 esbuild 编译主进程 + preload |
| 4. `vite build` | — | 编译 React 前端到 `dist/` |
| 5. `electron-builder` | — | 打包为安装包 |

> **注意**：`tsc` 类型检查已从 build 流程中移除（改为独立的 `npm run typecheck`），
> 因为 esbuild 实际编译时不需要 tsc，而 tsc 会因 Buffer 泛型等兼容性问题阻塞打包。

---

## 三平台 CI 构建

通过 GitHub Actions 自动构建三个平台版本。

### 触发方式
- 推送 `v*` tag（如 `v0.1.1`）
- 手动触发（workflow_dispatch）

### 工作流配置
文件：`.github/workflows/build.yml`

| 平台 | 运行环境 | Target | 产物 |
|------|---------|--------|------|
| Windows | `windows-latest` | nsis | `WhichClaw Setup x.x.x.exe` |
| macOS | `macos-latest` | dmg | `WhichClaw-x.x.x.dmg` |
| Linux | `ubuntu-latest` | AppImage | `WhichClaw-x.x.x.AppImage` |

### 构建步骤
```
Checkout → Node.js → npm ci → 生成图标 → build:tools → build:main → vite build → electron-builder → 上传产物
```

> **llama-server 不在 CI 中下载和打包**，改为用户运行时按需下载（见下节）。

---

## 本地推理引擎（llama-server）

### 策略：运行时按需下载

安装包**不捆绑** llama-server，用户首次使用 Local Server 功能时触发下载。

**优势**：
- 安装包体积从 ~600MB 降到 ~78MB
- 中国用户通过镜像自动回退也能正常下载

### 下载流程

```
用户进入 Local Server → 检测引擎 → 未安装 → 点击 SETUP ENGINE → 自动下载 → 安装完成 → START
```

### 技术实现

| 模块 | 文件 | 说明 |
|------|------|------|
| 下载器 | `electron/llamaDownloader.ts` | 下载、解压、安装 llama-server |
| IPC 接口 | `electron/ipc/localModelHandlers.ts` | `model:check-llama-server`、`model:download-llama-server` |
| 前端状态机 | `src/components/LocalModelPlayer.tsx` | `not-installed → downloading → installing → ready` |

### 各平台下载文件

| 平台 | 文件数 | 文件 |
|------|--------|------|
| Windows | 2 | `llama-{ver}-bin-win-cuda-{cuda}-x64.zip` + `cudart-llama-bin-win-cuda-{cuda}-x64.zip` |
| macOS | 1 | `llama-{ver}-bin-macos-arm64.tar.gz` |
| Linux | 1 | `llama-{ver}-bin-ubuntu-x64.tar.gz` |

### 镜像回退（中国用户）

下载器自动尝试多个源，依次回退：

```
GitHub 直连 → ghfast.top 镜像 → gh-proxy.com 镜像 → mirror.ghproxy.com 镜像
```

配置在 `electron/llamaDownloader.ts` 的 `DOWNLOAD_MIRRORS` 数组中。

### 安装位置

下载到 `app.getPath('userData')/llama-server/bin/` 目录（用户数据目录），不在安装目录内。

### 版本管理

llama.cpp 版本号由以下两处统一管理：
- `electron/llamaDownloader.ts` 的 `LLAMA_VERSION` 常量
- `.github/workflows/build.yml` 的 `LLAMA_VERSION` 环境变量（当前仅作参考）

当前版本：`b7981`，CUDA 版本：`13.1`

---

## 依赖管理

### dependencies（打入安装包）

| 包 | 用途 |
|----|------|
| `js-yaml` | 工具模型配置读写 |
| `systeminformation` | GPU 检测 |

### devDependencies（不打入安装包）

前端包（`react`、`react-dom`、`lucide-react`）已由 Vite 打包进 `dist/assets/`，
不需要在 node_modules 中重复打包，因此放在 `devDependencies`。

### 已移除的旧依赖

| 包 | 原因 |
|----|------|
| `node-llama-cpp` | 旧方案，已改用外部 llama-server 进程 |
| `electron-store` | 未使用 |
| `electron-updater` | 自动更新逻辑尚未实现 |
| `cors` / `express` / `glob`(deps) | 未使用 |

---

## 环境变量

| 变量 | 值 | 说明 |
|------|-----|------|
| `CSC_IDENTITY_AUTO_DISCOVERY` | `false` | **必须设置**。跳过代码签名证书发现，否则 winCodeSign 会因 symlink 权限崩溃 |

---

## 代码签名（当前跳过）

### 为什么跳过
- Windows EV 证书 ~$300/年，macOS Apple Developer $99/年
- 开源项目不值得花这个钱
- 用户手动信任即可（类似早期 Obsidian、VS Code）

### 跳过签名的配置
`package.json` → `build.win.signAndEditExecutable: false`

这会同时跳过：
1. ❌ 代码签名（不需要）
2. ❌ rcedit 图标嵌入（需要，所以用 afterPack 补偿）

### afterPack 钩子（补偿图标嵌入）
`scripts/afterPack.cjs` 在打包后用 `rcedit` 手动嵌入图标和版本信息。

> ⚠️ 如果以后购买了签名证书，删除 `signAndEditExecutable: false`，
> 同时可以删除 `afterPack.cjs`（electron-builder 会自动嵌入图标）。

---

## 图标文件

源文件：`public/ico.svg`（多爪子小怪兽）

生成脚本：`scripts/generate-icons.mjs`

```bash
node scripts/generate-icons.mjs
```

产物：
| 文件 | 用途 |
|------|------|
| `build/icon.ico` | Windows（256x256） |
| `build/icon.png` | macOS / Linux（1024x1024） |

依赖：`sharp`、`png-to-ico`（devDependencies）

---

## 自动更新

配置了 `electron-updater` 的 Generic Provider：

```json
"publish": {
  "provider": "generic",
  "url": "https://whichclaw.com/update/"
}
```

自动更新服务需要在 `whichclaw.com/update/` 放置：
- `latest.yml`（electron-builder 自动生成）
- `WhichClaw Setup x.x.x.exe`
- `WhichClaw Setup x.x.x.exe.blockmap`（增量更新用）

> ⚠️ `electron-updater` 已从 dependencies 移除。如需启用自动更新，需重新安装并在 `main.ts` 中实现调用逻辑。

---

## 版本号管理

版本号在 `package.json` → `version` 字段。打包时 `electron-builder` 自动读取。

当前版本：`0.1.1`

更新版本：
```bash
npm version patch  # 0.1.1 → 0.1.2
npm version minor  # 0.1.1 → 0.2.0
npm version major  # 0.1.1 → 1.0.0
```

---

## 安装包体积

| 组件 | 说明 |
|------|------|
| Electron + Chromium | ~177MB（压缩前），框架刚需 |
| app.asar | ~5MB，业务代码 + js-yaml + systeminformation |
| NSIS 压缩安装包 | **~78MB** |

---

## 踩坑记录

### 1. winCodeSign 符号链接错误
- **现象**：`ERROR: Cannot create symbolic link : 客户端没有所需的特权`
- **原因**：`electron-builder` 的 `winCodeSign` 缓存含 macOS `.dylib` 符号链接，Windows 非管理员无法创建
- **解决**：`CSC_IDENTITY_AUTO_DISCOVERY=false` + `signAndEditExecutable: false`

### 2. signAndEditExecutable 导致图标丢失
- **现象**：`WhichClaw.exe` 显示默认 Electron 图标
- **原因**：`signAndEditExecutable: false` 同时跳过了 rcedit 图标嵌入
- **解决**：`afterPack` 钩子手动调用 `rcedit` 嵌入图标

### 3. 编辑器文件监视器导致构建失败
- **现象**：`app.asar: The process cannot access the file because it is being used by another process`
- **原因**：VS Code/Cursor 或 GitHub Actions 插件的文件监视器锁定新创建的文件
- **解决**：输出到项目外目录 `-c.directories.output=d:/build-output`，或禁用相关插件

### 4. bin_backup 被打入安装包
- **现象**：安装包从 ~78MB 暴涨到 ~598MB
- **原因**：`electron/local/bin_backup/` 目录有旧的 llama-server 文件，`!bin/**` 排除规则无法匹配 `bin_backup`
- **解决**：删除 `bin_backup/` 目录，确保 `electron/local/` 下无大文件残留

---

## 文件结构

```
build/                    # 构建资源（图标等）
├── icon.ico              # Windows 图标
└── icon.png              # macOS/Linux 图标

scripts/
├── build-main.mjs        # 主进程编译（esbuild）
├── build-tools.mjs       # 工具模块编译
├── copy-config.mjs       # 跨平台配置复制
├── generate-icons.mjs    # SVG → ico/png 图标生成
└── afterPack.cjs         # electron-builder 钩子（图标嵌入）

.github/workflows/
└── build.yml             # 三平台 CI 构建

electron/
├── llamaDownloader.ts    # llama-server 运行时下载器（含镜像回退）
└── local/
    ├── tools/            # 工具配置（打入安装包）
    └── models/           # 模型目录（不打入安装包）

release/                  # 打包产物（gitignore）
├── WhichClaw Setup x.x.x.exe       # NSIS 安装包
├── WhichClaw Setup x.x.x.exe.blockmap  # 增量更新
├── latest.yml            # 自动更新描述
└── win-unpacked/         # 解压版（可直接运行）
```
