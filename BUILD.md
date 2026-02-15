# WhichClaw 构建与打包指南

## 快速开始

### 开发模式
```bash
npm run dev
```

### 生产打包（Windows）
```bash
# Windows PowerShell
$env:CSC_IDENTITY_AUTO_DISCOVERY='false'
npm run build
```

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

## 环境变量

| 变量 | 值 | 说明 |
|------|-----|------|
| `CSC_IDENTITY_AUTO_DISCOVERY` | `false` | **必须设置**。跳过代码签名证书发现，否则 winCodeSign 会因 symlink 权限崩溃 |

如果不设置此环境变量，`electron-builder` 会尝试下载 `winCodeSign` 工具，
该工具的缓存包含 macOS 的 `.dylib` 符号链接文件，Windows 非管理员用户无权创建符号链接，
导致 7-Zip 解压失败：`ERROR: Cannot create symbolic link : 客户端没有所需的特权`。

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

## 三平台配置

| 平台 | Target | 产物 | 图标 |
|------|--------|------|------|
| Windows | nsis | `WhichClaw Setup x.x.x.exe` | `build/icon.ico` |
| macOS | dmg | `WhichClaw-x.x.x.dmg` | `build/icon.png`（自动转 icns） |
| Linux | AppImage | `WhichClaw-x.x.x.AppImage` | `build/icon.png` |

> macOS 和 Linux 暂未实际测试，需在对应系统验证。

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

> 自动更新的代码逻辑（`electron-updater` 调用）尚未在 `main.ts` 中实现。

---

## 跨平台兼容

### copy:config 脚本
原来用 Windows 的 `xcopy`，已改为 `scripts/copy-config.mjs`（纯 Node.js），macOS/Linux 通用。

### node-llama-cpp 排除
`package.json` → `build.files` 中排除了 darwin/linux 的二进制文件，
避免 Windows 打包时因 symlink 失败。

---

## 踩坑记录

### 1. winCodeSign 符号链接错误
- **现象**：`ERROR: Cannot create symbolic link : 客户端没有所需的特权`
- **原因**：`electron-builder` 的 `winCodeSign` 缓存含 macOS `.dylib` 符号链接，Windows 非管理员无法创建
- **解决**：`CSC_IDENTITY_AUTO_DISCOVERY=false` + `signAndEditExecutable: false`
- **替代方案**：启用 Windows 开发者模式（允许非管理员创建 symlink），或以管理员运行

### 2. signAndEditExecutable 导致图标丢失
- **现象**：`WhichClaw.exe` 显示默认 Electron 图标
- **原因**：`signAndEditExecutable: false` 同时跳过了 rcedit 图标嵌入
- **解决**：`afterPack` 钩子手动调用 `rcedit` 嵌入图标

### 3. rcedit API 调用方式
- **现象**：`afterPack` 报错 "rcedit is not a function"
- **原因**：`rcedit` npm 包导出的是 `{ rcedit }` 对象，不是函数
- **解决**：`const { rcedit } = require('rcedit')`

### 4. tsc 类型检查阻塞
- **现象**：`npm run build` 因 TS6133（未使用变量）和 Buffer 泛型错误失败
- **原因**：`tsconfig.json` 的 `noUnusedLocals/Parameters` 太严格；Node.js 新版 Buffer 泛型不兼容
- **解决**：从 build 流程移除 tsc，改为独立的 `npm run typecheck`

### 5. xcopy 不跨平台
- **现象**：`copy:config` 在 macOS/Linux 失败
- **原因**：`xcopy` 是 Windows 专有命令
- **解决**：改为 `scripts/copy-config.mjs`（Node.js 原生 fs）

---

## 版本号管理

版本号在 `package.json` → `version` 字段。打包时 `electron-builder` 自动读取。

当前版本：`0.1.0`

更新版本：
```bash
npm version patch  # 0.1.0 → 0.1.1
npm version minor  # 0.1.0 → 0.2.0
npm version major  # 0.1.0 → 1.0.0
```

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

release/                  # 打包产物（gitignore）
├── WhichClaw Setup 0.1.0.exe       # NSIS 安装包
├── WhichClaw Setup 0.1.0.exe.blockmap  # 增量更新
├── latest.yml            # 自动更新描述
└── win-unpacked/         # 解压版（可直接运行）
```
