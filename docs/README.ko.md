<p align="center">
  <img src="../build/icon.png" alt="CyberNexus" width="120" />
</p>

<h1 align="center">CyberNexus</h1>

<p align="center">
  <strong>One Hub. All Models. Every Coding Tool.</strong><br/>
  <sub>AI 시대의 사이버펑크 컨트롤 패널.</sub>
</p>

<p align="center">
  <a href="https://github.com/CyberNexus-Chat/CyberNexus/releases">
    <img src="https://img.shields.io/github/v/release/CyberNexus-Chat/CyberNexus?style=flat-square&color=00FF9D" alt="Release" />
  </a>
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blue?style=flat-square" alt="Platform" />
  <img src="https://img.shields.io/github/license/CyberNexus-Chat/CyberNexus?style=flat-square" alt="License" />
</p>

<p align="center">
  <a href="../README.md">English</a> · <a href="./README.zh-CN.md">简体中文</a> · <a href="./README.zh-TW.md">繁體中文</a> · <a href="./README.ja.md">日本語</a> · <strong>한국어</strong> · <a href="./README.es.md">Español</a> · <a href="./README.fr.md">Français</a> · <a href="./README.de.md">Deutsch</a> · <a href="./README.pt.md">Português</a> · <a href="./README.ru.md">Русский</a> · <a href="./README.ar.md">العربية</a>
</p>

---

## ✨ CyberNexus란?

CyberNexus는 AI 코딩 도구의 모델을 **시각적으로 통합 관리**할 수 있는 데스크톱 애플리케이션입니다. 설정 파일을 직접 편집할 필요 없이 클릭 한 번으로 전환하세요.

### 문제점

- 😫 OpenClaw 등에서 모델을 전환하려면 설정 파일을 수동으로 편집해야 함
- 🔄 각 도구마다 고유한 모델 설정 형식이 존재
- 🧩 스킬과 확장 기능을 도구 간에 관리할 편리한 방법이 없음

### 솔루션

CyberNexus는 모든 AI 코딩 도구의 **중앙 컨트롤 패널**입니다:

- 🎯 **원클릭 모델 전환** — 지원되는 도구의 AI 모델을 시각적으로 전환
- 🔀 **듀얼 프로토콜** — OpenAI & Anthropic API 지원, 언제 어디서나 모델 전환
- 🚇 **스마트 터널 프록시** — 전체 VPN 없이 지역 제한 API에 접근
- 🧩 **스킬 브라우저** — AI 스킬 검색, 설치 및 관리
- 🖥️ **로컬 모델 서버** — llama.cpp로 오픈소스 모델(Qwen, DeepSeek, Llama) 로컬 실행
- 🌍 **28개 언어** — 완전한 국제화 지원
- 🎮 **내장 AI 앱** — Reversi, AI 번역 등
- 🌃 **사이버펑크 UI** — 네온 그린 터미널 미학

## 🖼️ 스크린샷

### Model Nexus — 모든 AI 모델을 한 곳에서 관리
![Model Nexus](1.png)

### App Manager — 모든 도구에서 원클릭 모델 전환
![App Manager](2.png)

### Local Server — llama.cpp로 오픈소스 모델 로컬 실행
![Local Server](3.png)

### Skill Browser — AI 스킬 검색 및 설치
![Skill Browser](4.png)

## 🚀 빠른 시작

### 다운로드

| 플랫폼 | 다운로드 |
|----------|----------|
| Windows  | [CyberNexus-Setup.exe](https://github.com/CyberNexus-Chat/CyberNexus/releases/latest) |
| macOS    | [CyberNexus.dmg](https://github.com/CyberNexus-Chat/CyberNexus/releases/latest) |
| Linux    | [CyberNexus.AppImage](https://github.com/CyberNexus-Chat/CyberNexus/releases/latest) |

### Linux 참고사항

```bash
chmod +x CyberNexus-*.AppImage
./CyberNexus-*.AppImage
```

> FUSE 오류 발생 시: `sudo apt install libfuse2`

## 🔧 지원 도구

| 도구 | 상태 | 모델 전환 | 프로토콜 |
|------|--------|----------------|----------|
| OpenClaw | ✅ 지원 | ✅ | OpenAI / Anthropic |
| Claude Code | ✅ 지원 | ✅ | Anthropic |
| Cline | ✅ 지원 | ✅ | OpenAI |
| Continue | ✅ 지원 | ✅ | OpenAI |
| OpenCode | ✅ 지원 | ✅ | OpenAI |
| Codex | ✅ 지원 | ✅ | OpenAI |
| Roo Code | ✅ 지원 | ✅ | OpenAI |
| ZeroClaw | ✅ 지원 | ✅ | OpenAI |
| Aider | ✅ 지원 | ✅ | OpenAI / Anthropic |

## 🏗️ 기술 스택

- **Electron** — 크로스 플랫폼 데스크톱 프레임워크
- **React + TypeScript** — UI 프레임워크
- **Vanilla CSS** — 커스텀 사이버펑크 디자인 시스템
- **Vite** — 빌드 도구
- **llama.cpp** — 로컬 모델 추론 엔진

## 🛠️ 개발

```bash
npm install
npm run dev
npm run build
```

## 🤝 기여

기여를 환영합니다! Issue나 Pull Request를 자유롭게 제출해 주세요.

We're especially looking for help with:
- 🍎 **macOS 테스트** — macOS 빌드 테스트가 아직 완전하지 않습니다
- 🔧 **새 도구 통합** — 더 많은 AI 코딩 도구 지원 추가
- 🌐 **번역 개선** — 원어민 환영!

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📬 Contact

- 📧 Email: [hi@cybernexus.chat](mailto:hi@cybernexus.chat)
- 🐛 Bug Reports: [GitHub Issues](https://github.com/CyberNexus-Chat/CyberNexus/issues)
- 💬 Discussions: [GitHub Discussions](https://github.com/CyberNexus-Chat/CyberNexus/discussions)

## ⭐ 지원

CyberNexus가 유용하셨다면 GitHub에서 ⭐을 눌러 주세요!

## 📄 라이선스

[MIT](../LICENSE)

---

<p align="center">
  CyberNexus 팀이 💚으로 만들었습니다<br/>
  <sub>📧 <a href="mailto:hi@cybernexus.chat">hi@cybernexus.chat</a></sub>
</p>
