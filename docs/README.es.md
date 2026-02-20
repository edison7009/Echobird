<p align="center">
  <img src="../build/icon.png" alt="CyberNexus" width="120" />
</p>

<h1 align="center">CyberNexus</h1>

<p align="center">
  <strong>One Hub. All Models. Every Coding Tool.</strong><br/>
  <sub>Un panel de control cyberpunk para la era de la IA.</sub>
</p>

<p align="center">
  <a href="https://github.com/CyberNexus-Chat/CyberNexus/releases">
    <img src="https://img.shields.io/github/v/release/CyberNexus-Chat/CyberNexus?style=flat-square&color=00FF9D" alt="Release" />
  </a>
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blue?style=flat-square" alt="Platform" />
  <img src="https://img.shields.io/github/license/CyberNexus-Chat/CyberNexus?style=flat-square" alt="License" />
</p>

<p align="center">
  <a href="../README.md">English</a> · <a href="./README.zh-CN.md">简体中文</a> · <a href="./README.zh-TW.md">繁體中文</a> · <a href="./README.ja.md">日本語</a> · <a href="./README.ko.md">한국어</a> · <strong>Español</strong> · <a href="./README.fr.md">Français</a> · <a href="./README.de.md">Deutsch</a> · <a href="./README.pt.md">Português</a> · <a href="./README.ru.md">Русский</a> · <a href="./README.ar.md">العربية</a>
</p>

---

## ✨ ¿Qué es CyberNexus?

CyberNexus es una aplicación de escritorio que proporciona una **interfaz visual y unificada** para gestionar modelos de IA en tus herramientas de programación. Sin más búsquedas en archivos de configuración — simplemente haz clic y cambia.

### El Problema

- 😫 Cambiar modelos de IA en herramientas como OpenClaw requiere editar archivos de configuración manualmente
- 🔄 Cada herramienta tiene su propio formato de configuración de modelos
- 🧩 No hay una forma fácil de gestionar skills y extensiones entre herramientas

### La Solución

CyberNexus actúa como un **panel de control central** para todas tus herramientas de programación con IA:

- 🎯 **Cambio con Un Clic** — Cambia visualmente modelos de IA para cualquier herramienta soportada
- 🔀 **Protocolo Dual** — Soporte OpenAI & Anthropic API, cambia modelos en cualquier momento
- 🚇 **Proxy Túnel Inteligente** — Accede a APIs geo-restringidas sin VPN completo
- 🧩 **Explorador de Skills** — Descubre, instala y gestiona skills de IA
- 🖥️ **Servidor Local** — Ejecuta modelos open-source (Qwen, DeepSeek, Llama) localmente via llama.cpp
- 🌍 **28 Idiomas** — Soporte completo de internacionalización
- 🎮 **Apps de IA Integradas** — Juegos y utilidades como Reversi y AI Translate
- 🌃 **UI Cyberpunk** — Estética de terminal neón verde

## 🖼️ Capturas de Pantalla

### Model Nexus — Gestiona todos tus modelos de IA en un solo lugar
![Model Nexus](1.png)

### App Manager — Cambio de modelo con un clic para todas las herramientas
![App Manager](2.png)

### Local Server — Ejecuta modelos open-source localmente con llama.cpp
![Local Server](3.png)

### Skill Browser — Descubre e instala skills de IA
![Skill Browser](4.png)

## 🚀 Inicio Rápido

### Descarga

| Plataforma | Descarga |
|----------|----------|
| Windows  | [CyberNexus-Setup.exe](https://github.com/CyberNexus-Chat/CyberNexus/releases/latest) |
| macOS    | [CyberNexus.dmg](https://github.com/CyberNexus-Chat/CyberNexus/releases/latest) |
| Linux    | [CyberNexus.AppImage](https://github.com/CyberNexus-Chat/CyberNexus/releases/latest) |

### Notas de Linux

```bash
chmod +x CyberNexus-*.AppImage
./CyberNexus-*.AppImage
```

> Si encuentras errores de FUSE: `sudo apt install libfuse2`

## 🔧 Herramientas Soportadas

| Herramienta | Estado | Cambio de Modelo | Protocolo |
|------|--------|----------------|----------|
| OpenClaw | ✅ Soportado | ✅ | OpenAI / Anthropic |
| Claude Code | ✅ Soportado | ✅ | Anthropic |
| Cline | ✅ Soportado | ✅ | OpenAI |
| Continue | ✅ Soportado | ✅ | OpenAI |
| OpenCode | ✅ Soportado | ✅ | OpenAI |
| Codex | ✅ Soportado | ✅ | OpenAI |
| Roo Code | ✅ Soportado | ✅ | OpenAI |
| ZeroClaw | ✅ Soportado | ✅ | OpenAI |
| Aider | ✅ Soportado | ✅ | OpenAI / Anthropic |

## 🏗️ Stack Tecnológico

- **Electron** — Framework de escritorio multiplataforma
- **React + TypeScript** — Framework de UI
- **Vanilla CSS** — Sistema de diseño cyberpunk personalizado
- **Vite** — Herramienta de build
- **llama.cpp** — Motor de inferencia de modelos local

## 🛠️ Desarrollo

```bash
npm install
npm run dev
npm run build
```

## 🤝 Contribuir

¡Las contribuciones son bienvenidas! No dudes en abrir issues o enviar pull requests.

We're especially looking for help with:
- 🍎 **Pruebas en macOS** — Aún no hemos probado completamente los builds de macOS
- 🔧 **Nuevas integraciones** — Ayúdanos a soportar más herramientas de IA
- 🌐 **Mejoras de traducción** — ¡Hablantes nativos bienvenidos!

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📬 Contact

- 📧 Email: [hi@cybernexus.chat](mailto:hi@cybernexus.chat)
- 🐛 Bug Reports: [GitHub Issues](https://github.com/CyberNexus-Chat/CyberNexus/issues)
- 💬 Discussions: [GitHub Discussions](https://github.com/CyberNexus-Chat/CyberNexus/discussions)

## ⭐ Apoyo

Si CyberNexus te resulta útil, ¡dale una ⭐ en GitHub!

## 📄 Licencia

[MIT](../LICENSE)

---

<p align="center">
  Hecho con 💚 por el equipo CyberNexus<br/>
  <sub>📧 <a href="mailto:hi@cybernexus.chat">hi@cybernexus.chat</a></sub>
</p>
