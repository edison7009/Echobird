<p align="center">
  <img src="../build/icon.png" alt="WhichClaw" width="120" />
</p>

<h1 align="center">WhichClaw</h1>

<p align="center">
  <strong>コーディングツール向け AI モデル切替＆設定管理ハブ</strong>
</p>

<p align="center">
  <a href="https://github.com/ebenxp707-boop/WhichClaw/releases">
    <img src="https://img.shields.io/github/v/release/ebenxp707-boop/WhichClaw?style=flat-square&color=00FF9D" alt="Release" />
  </a>
  <img src="https://img.shields.io/badge/対応-Windows%20%7C%20macOS%20%7C%20Linux-blue?style=flat-square" alt="Platform" />
</p>

<p align="center">
  <a href="../README.md">English</a> ·
  <a href="./README.zh-CN.md">简体中文</a> ·
  <a href="./README.ja.md">日本語</a> ·
  <a href="./README.ko.md">한국어</a>
</p>

---

## ✨ WhichClaw とは？

WhichClaw は、コーディングツール全体で AI モデルを管理するための**ビジュアル統合インターフェース**を提供するデスクトップアプリケーションです。設定ファイルの手動編集やトークン使用量の心配はもう不要——クリックするだけで切り替え完了。

### 課題

- 😫 OpenClaw などのツールでモデル切替に設定ファイルの手動編集が必要
- 💸 各ツールのトークン消費状況が見えない
- 🔄 ツールごとにモデル設定形式が異なる
- 🔑 API キーが複数の設定ファイルに散在

### ソリューション

WhichClaw はすべての AI コーディングツールの**統合コントロールパネル**：

- 🎯 **ワンクリックモデル切替** — ビジュアル UI で任意のツールの AI モデルを切替
- 📊 **トークン使用量モニタリング** — 消費量とコストをリアルタイムで追跡
- 🔐 **セキュアなキー管理** — API キーの暗号化保存、ハードウェアバインド保護
- 🖥️ **ローカルモデル対応** — llama.cpp でオープンソースモデル（Llama、Mistral 等）をローカル実行
- 🎮 **内蔵 AI プレイグラウンド** — AI リバーシなどのインタラクティブゲームでモデルをテスト

## 🚀 クイックスタート

### ダウンロード

| プラットフォーム | ダウンロード |
|---------|---------|
| Windows | [WhichClaw-Setup.exe](https://github.com/ebenxp707-boop/WhichClaw/releases/latest) |
| macOS | [WhichClaw.dmg](https://github.com/ebenxp707-boop/WhichClaw/releases/latest) |
| Linux | [WhichClaw.AppImage](https://github.com/ebenxp707-boop/WhichClaw/releases/latest) |

## 🔧 対応ツール

| ツール | ステータス | モデル切替 | プロトコル |
|-------|----------|----------|----------|
| OpenClaw | ✅ 対応済み | ✅ | OpenAI / Anthropic |
| Claude Code | ✅ 対応済み | ✅ | Anthropic |
| Cline | ✅ 対応済み | ✅ | OpenAI / Anthropic |
| Continue | ✅ 対応済み | ✅ | OpenAI |
| Aider | ✅ 対応済み | ✅ | OpenAI |
| OpenCode | ✅ 対応済み | ✅ | OpenAI |
| Codex | ✅ 対応済み | ✅ | OpenAI |
| Roo Code | 🔜 近日対応 | — | — |

## 🏗️ 技術スタック

- **Electron** — クロスプラットフォームデスクトップフレームワーク
- **React + TypeScript** — UI フレームワーク
- **Tailwind CSS** — スタイリング
- **Vite** — ビルドツール
- **llama.cpp** — ローカルモデル推論

## 📄 ライセンス

[MIT](../LICENSE)

---

<p align="center">
  Made with 💚 by the WhichClaw Team
</p>
