# Pinchr

**The AI desktop app powered by [OpenClaw](https://github.com/openclaw/openclaw).**

![Pinchr](docs/screenshot.png)

Pinchr is an Electron-based desktop application that puts an AI agent at your fingertips — one that can see your screen, run commands, manage files, browse the web, and integrate with your tools.

- 🧠 **AI-powered agent** — Chat with an intelligent assistant backed by leading AI models
- 🖥️ **Desktop-native** — Runs locally on macOS with full system access via OpenClaw
- 🔌 **Extensible** — Connect tools, skills, and automations through ClawHub
- 🔒 **Private** — Your API keys stay on your machine; no telemetry without opt-in

## Quick Start

### Download

Grab the latest `.dmg` from [Releases](https://github.com/taw0002/pinchr/releases), open it, and drag Pinchr to Applications.

### Build from Source

**Requirements:** Node.js 20+, yarn, Python 3 (for native modules)

```bash
# Clone the repo
git clone https://github.com/taw0002/pinchr.git
cd pinchr

# Install dependencies
yarn install --ignore-engines

# Build the app
yarn dist

# Run
open dist/mac-arm64/Pinchr.app
```

> **Note:** The `resources/node/node` and `resources/peekaboo/peekaboo` binaries are tracked via Git LFS. Make sure you have [Git LFS](https://git-lfs.github.com/) installed before cloning:
> ```bash
> git lfs install
> git clone https://github.com/taw0002/pinchr.git
> ```

For signing and notarization details, see [BUILDING.md](BUILDING.md).

## Tech Stack

- **[Electron](https://www.electronjs.org/)** — Cross-platform desktop framework
- **[React](https://react.dev/)** — UI framework
- **[TypeScript](https://www.typescriptlang.org/)** — Type-safe JavaScript
- **[Tailwind CSS](https://tailwindcss.com/)** — Utility-first CSS
- **[OpenClaw](https://github.com/openclaw/openclaw)** — AI agent engine (bundled)

## Links

- [OpenClaw](https://github.com/openclaw/openclaw) — The AI engine under the hood
- [ClawHub](https://clawhub.ai) — Skills and integrations marketplace
- [Security](SECURITY.md) — Vulnerability reporting and security architecture
- [Building](BUILDING.md) — Build, sign, and release instructions

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

[MIT](LICENSE) © 2026 LaunchPad, LLC
