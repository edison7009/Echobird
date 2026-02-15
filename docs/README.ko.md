<p align="center">
  <img src="../build/icon.png" alt="WhichClaw" width="120" />
</p>

<h1 align="center">WhichClaw</h1>

<p align="center">
  <strong>코딩 도구를 위한 AI 모델 시각적 전환 및 구성 허브</strong>
</p>

<p align="center">
  <a href="https://github.com/ebenxp707-boop/WhichClaw/releases">
    <img src="https://img.shields.io/github/v/release/ebenxp707-boop/WhichClaw?style=flat-square&color=00FF9D" alt="Release" />
  </a>
  <img src="https://img.shields.io/badge/플랫폼-Windows%20%7C%20macOS%20%7C%20Linux-blue?style=flat-square" alt="Platform" />
</p>

<p align="center">
  <a href="../README.md">English</a> ·
  <a href="./README.zh-CN.md">简体中文</a> ·
  <a href="./README.ja.md">日本語</a> ·
  <a href="./README.ko.md">한국어</a>
</p>

---

## ✨ WhichClaw란?

WhichClaw는 코딩 도구 전체에서 AI 모델을 관리하기 위한 **시각적 통합 인터페이스**를 제공하는 데스크톱 애플리케이션입니다. 설정 파일을 직접 수정하거나 토큰 사용량을 걱정할 필요 없이 — 클릭 한 번으로 전환완료.

### 문제점

- 😫 OpenClaw 등의 도구에서 모델 전환 시 설정 파일 수동 편집 필요
- 💸 각 도구의 토큰 소비 현황 파악 불가
- 🔄 도구마다 모델 설정 형식이 다름
- 🔑 API 키가 여러 설정 파일에 분산

### 솔루션

WhichClaw는 모든 AI 코딩 도구의 **통합 제어판** 역할:

- 🎯 **원클릭 모델 전환** — 시각적 UI로 모든 지원 도구의 AI 모델 전환
- 📊 **토큰 사용량 모니터링** — 소비량과 비용을 실시간 추적
- 🔐 **보안 키 관리** — API 키 암호화 저장, 하드웨어 바인딩 보호
- 🖥️ **로컬 모델 지원** — llama.cpp로 오픈소스 모델(Llama, Mistral 등) 로컬 실행
- 🎮 **내장 AI 플레이그라운드** — AI 오델로 등 인터랙티브 게임으로 모델 테스트

## 🚀 빠른 시작

### 다운로드

| 플랫폼 | 다운로드 |
|--------|---------|
| Windows | [WhichClaw-Setup.exe](https://github.com/ebenxp707-boop/WhichClaw/releases/latest) |
| macOS | [WhichClaw.dmg](https://github.com/ebenxp707-boop/WhichClaw/releases/latest) |
| Linux | [WhichClaw.AppImage](https://github.com/ebenxp707-boop/WhichClaw/releases/latest) |

## 🔧 지원 도구

| 도구 | 상태 | 모델 전환 | 프로토콜 |
|------|------|---------|---------|
| OpenClaw | ✅ 지원 | ✅ | OpenAI / Anthropic |
| Claude Code | ✅ 지원 | ✅ | Anthropic |
| Cline | ✅ 지원 | ✅ | OpenAI / Anthropic |
| Continue | ✅ 지원 | ✅ | OpenAI |
| Aider | ✅ 지원 | ✅ | OpenAI |
| OpenCode | ✅ 지원 | ✅ | OpenAI |
| Codex | ✅ 지원 | ✅ | OpenAI |
| Roo Code | 🔜 예정 | — | — |

## 🏗️ 기술 스택

- **Electron** — 크로스 플랫폼 데스크톱 프레임워크
- **React + TypeScript** — UI 프레임워크
- **Tailwind CSS** — 스타일링
- **Vite** — 빌드 도구
- **llama.cpp** — 로컬 모델 추론

## 📄 라이선스

[MIT](../LICENSE)

---

<p align="center">
  Made with 💚 by the WhichClaw Team
</p>
