# Veil 🎭

**LLM visibility firewall** - Control what AI can access in your project.

[![npm](https://img.shields.io/npm/v/@squadzero/veil.svg)](https://www.npmjs.com/package/@squadzero/veil)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6+-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## What It Does

- 🛡️ **Block dangerous commands** - Prevent `rm -rf /`, `wrangler deploy`, etc.
- 🔒 **Protect secrets** - Mask or deny access to API keys and tokens
- 📁 **Hide sensitive files** - Block `.env`, `secrets/`, etc.
- 💡 **Guide the AI** - Provide safe alternatives when blocking

---

## Quick Start

### 1. Install

```bash
npm install -g @squadzero/veil
veil install
source ~/.zshrc
```

### 2. Add VS Code Settings

```json
{
  "terminal.integrated.env.linux": { "VEIL_ENABLED": "1" },
  "terminal.integrated.env.osx": { "VEIL_ENABLED": "1" }
}
```

### 3. Create Rules

```typescript
// veil.config.ts
export default {
  cliRules: [
    {
      match: /^wrangler\s+deploy/,
      action: 'deny',
      reason: 'Use npm run deploy:stage instead',
      safeAlternatives: ['npm run deploy:stage']
    }
  ]
};
```

### 4. Test It

```bash
# Human terminal (outside VS Code) - passes through
wrangler deploy  # ✅ Works

# AI terminal (in VS Code) - blocked
wrangler deploy  # 🛡️ Blocked with alternatives
```

---

## MCP Integration

Add to `.vscode/mcp.json` for AI tool call interception:

```json
{
  "servers": {
    "veil": {
      "type": "stdio",
      "command": "npx",
      "args": ["@squadzero/veil", "mcp"],
      "cwd": "/path/to/project"
    }
  }
}
```

---

## CLI Commands

| Command | Description |
|---------|-------------|
| `veil install` | Add shell wrapper (AI-only by default) |
| `veil install --force` | Protect ALL terminals |
| `veil uninstall` | Remove shell wrapper |
| `veil init` | Create config with preset |
| `veil check <target>` | Test if something is blocked |
| `veil mcp` | Start MCP server |

---

## Documentation

| Guide | Description |
|-------|-------------|
| [Setup Guide](./docs/setup-guide.md) | Complete installation instructions |
| [CLI Reference](./docs/cli-reference.md) | All commands and options |
| [API Reference](./docs/api-reference.md) | TypeScript API docs |
| [Presets & Rules](./docs/presets-and-rules.md) | Rule configuration |

---

## How It Works

```
Human Terminal          VS Code Terminal (AI)
      │                        │
      ▼                        ▼
  wrangler deploy         wrangler deploy
      │                        │
      │                  VEIL_ENABLED=1
      │                        │
      ▼                        ▼
  ✅ Executes            🛡️ veil-wrap
                               │
                               ▼
                         veil.config.ts
                               │
                    ┌──────────┴──────────┐
                    │                     │
                    ▼                     ▼
               ✅ Allowed            ❌ Blocked
                    │                     │
                    ▼                     ▼
                Executes         Shows alternatives
```

---

## License

MIT © [Squad-Zero](https://github.com/Squad-Zero)
