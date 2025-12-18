# Veil Setup Guide

Complete setup instructions for all use cases.

## Table of Contents

- [AI-Only Mode (Recommended)](#ai-only-mode-recommended)
- [Force Mode (All Terminals)](#force-mode-all-terminals)
- [MCP Server Setup](#mcp-server-setup)
- [Remote Development](#remote-development)
- [Troubleshooting](#troubleshooting)

---

## AI-Only Mode (Recommended)

Protects AI terminal sessions while leaving human terminals unaffected.

### How It Works

| Terminal | `VEIL_ENABLED` | Result |
|----------|----------------|--------|
| Human (outside VS Code) | not set | Commands pass through ✅ |
| Human (in VS Code) | `1` | Commands checked 🛡️ |
| AI (Copilot) | `1` | Commands checked 🛡️ |

### Step 1: Install & Configure Shell

```bash
npm install -g @squadzero/veil
veil install
source ~/.zshrc  # or open new terminal
```

### Step 2: Add VS Code Settings

Add to `.vscode/settings.json` (workspace) or user settings:

```json
{
  "terminal.integrated.env.linux": { "VEIL_ENABLED": "1" },
  "terminal.integrated.env.osx": { "VEIL_ENABLED": "1" },
  "terminal.integrated.env.windows": { "VEIL_ENABLED": "1" }
}
```

### Step 3: Create Project Rules

Create `veil.config.ts` in your project root:

```typescript
import type { VeilConfig } from '@squadzero/veil';

export default {
  cliRules: [
    {
      match: /^wrangler\s+(deploy|publish)/,
      action: 'deny',
      reason: 'Use npm run deploy:stage instead',
      safeAlternatives: ['npm run deploy:stage']
    }
  ]
} satisfies VeilConfig;
```

### Step 4: Configure MCP (Optional)

For AI tool call interception, add `.vscode/mcp.json`:

```json
{
  "servers": {
    "veil": {
      "type": "stdio",
      "command": "npx",
      "args": ["@squadzero/veil", "mcp"],
      "cwd": "/path/to/your/project"
    }
  }
}
```

---

## Force Mode (All Terminals)

Applies veil rules to ALL terminals, including human sessions.

```bash
veil install --force
source ~/.zshrc
```

No VS Code settings required - all terminals are protected.

---

## MCP Server Setup

The MCP server provides tools that VS Code/Claude/Cursor can use with built-in veil enforcement.

### Dynamic Config Loading

**New in v0.6.0:** Veil dynamically loads `veil.config.ts` based on the `cwd` parameter passed to each tool. This enables per-project rules in poly-repo workspaces.

When a tool is invoked:
1. Veil walks up from the `cwd` (or file path) to find `veil.config.ts`
2. Loads and applies that project's specific rules
3. Falls back to no rules if no config is found

### VS Code (Workspace Level)

Create `.vscode/mcp.json`:

```json
{
  "servers": {
    "veil": {
      "type": "stdio",
      "command": "npx",
      "args": ["@squadzero/veil", "mcp"],
      "cwd": "/path/to/workspace-root"
    }
  }
}
```

**Note:** The `cwd` in mcp.json sets the MCP server's starting directory, but tools will load config from their own `cwd` parameter or file path.

### Poly-Repo Setup

For workspaces with multiple projects, set `cwd` to the workspace root:

```json
{
  "servers": {
    "veil": {
      "type": "stdio",
      "command": "npx",
      "args": ["@squadzero/veil", "mcp"],
      "cwd": "/opt/apps"
    }
  }
}
```

Then create `veil.config.ts` in each project that needs rules:

```
/opt/apps/
├── .vscode/mcp.json           # Single MCP config for workspace
├── project-a/
│   └── veil.config.ts         # Rules for project-a
├── project-b/
│   └── veil.config.ts         # Rules for project-b
└── project-c/                 # No config = no restrictions
```

When running commands:
- `run_command` with `cwd="/opt/apps/project-a"` → uses project-a's rules
- `run_command` with `cwd="/opt/apps/project-b"` → uses project-b's rules
- `check_file` with path in project-a → uses project-a's rules

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "veil": {
      "command": "npx",
      "args": ["@squadzero/veil", "mcp"]
    }
  }
}
```

### MCP Tools Provided

| Tool | Description | `cwd` Support |
|------|-------------|---------------|
| `run_command` | Execute shell command (with veil filtering) | ✅ Uses cwd parameter |
| `check_command` | Check if command is allowed | ✅ Uses cwd parameter |
| `get_env` | Get environment variable (with veil filtering) | ✅ Uses cwd parameter |
| `check_env` | Check if env var is accessible | ✅ Uses cwd parameter |
| `check_file` | Check if file path is allowed | ✅ Derives from file path |
| `read_file` | Read file with veil validation | ✅ Derives from file path |
| `write_file` | Write file with veil validation | ✅ Derives from file path |
| `get_audit_log` | View audit trail | ❌ No project context |

---

## Remote Development

When using VS Code Remote SSH, the MCP server can use HTTP transport:

### On Remote Server

```bash
cd /path/to/project
veil mcp --http --port 3500
```

### In VS Code Settings

Configure your MCP client to connect via HTTP to the remote server.

---

## Troubleshooting

### Shell wrapper not working

1. Verify installation: `which veil-wrap`
2. Check shell config: `grep veil ~/.zshrc`
3. Source config: `source ~/.zshrc`

### Commands not blocked

1. Check `VEIL_ENABLED=1` is set: `echo $VEIL_ENABLED`
2. Verify config exists: `ls veil.config.ts`
3. Test manually: `VEIL_ENABLED=1 veil-wrap wrangler deploy`

### MCP server not starting

1. Check config path is correct in mcp.json
2. Verify veil is installed: `npx @squadzero/veil --version`
3. Check logs in VS Code Output panel

---

## Coverage Matrix

| Scenario | Protected By |
|----------|--------------|
| Human runs command outside VS Code | Not protected (AI-only mode) |
| Human runs command in VS Code | Shell wrapper ✅ |
| AI uses `mcp_veil_run_command` | MCP server ✅ |
| AI uses `run_in_terminal` | Shell wrapper ✅ |
