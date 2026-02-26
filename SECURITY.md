# Security

Pinchr wraps [OpenClaw](https://github.com/openclaw/openclaw), an AI agent engine with shell access, file I/O, and internet capabilities. Security is critical.

## Before You Start

Please read these documents:

- **[Threat Model](https://github.com/openclaw/openclaw/blob/main/docs/security/THREAT-MODEL-ATLAS.md)** — MITRE ATLAS-based threat model for the OpenClaw ecosystem
- **[Trust & Security](https://trust.openclaw.ai)** — Vulnerability reporting, security contacts, and trust documentation

## Reporting Vulnerabilities

**Do not open public issues for security vulnerabilities.**

Report via the [Trust page](https://trust.openclaw.ai) or email security concerns to the OpenClaw security team.

## Security Audit

Pinchr bundles OpenClaw's security audit tool:

```bash
openclaw security audit
openclaw security audit --deep
openclaw security audit --fix
```

Run this regularly, especially after changing configuration.

## Architecture

- All AI provider API keys are stored locally on your machine — never sent to Pinchr servers
- The agent runs locally via OpenClaw's gateway process
- No telemetry is collected without explicit opt-in
