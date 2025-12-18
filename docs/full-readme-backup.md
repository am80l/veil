# Veil 🎭

**A TypeScript library for selective context access, visibility control & safety enforcement for LLMs.**

Veil acts as a *visibility firewall* between an LLM and your project's filesystem, environment variables, and command interfaces.

[![npm version](https://img.shields.io/npm/v/@squadzero/veil.svg)](https://www.npmjs.com/package/@squadzero/veil)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6+-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Installation

```bash
npm install @squadzero/veil
```

### Shell Integration (Recommended)

For rock-solid enforcement that works for both humans and AI, install the shell wrapper:

```bash
# Install globally and add shell wrapper
npm install -g @squadzero/veil
veil install
```

This intercepts commands like `wrangler` at the shell level, so any command (from AI or human) goes through Veil's security policies.

```bash
# Options
veil install                           # Add to ~/.zshrc (auto-detected)
veil install --commands "wrangler,npm" # Wrap multiple commands
veil install --shell ~/.bashrc         # Specify shell config
veil install --dry-run                 # Preview without changes
veil uninstall                         # Remove shell wrapper
veil uninstall --all                   # Remove from all shell configs
```

## Quick Start

```typescript
import { createVeil, PRESET_RECOMMENDED } from '@squadzero/veil';

const veil = createVeil(PRESET_RECOMMENDED);

// Check files, env vars, and commands before the LLM accesses them
const fileCheck = veil.checkFile('.env');           // → blocked
const envCheck = veil.getEnv('AWS_SECRET_KEY');     // → masked
const cmdCheck = veil.checkCommand('rm -rf /');     // → blocked with alternatives
```

---

## CLI Examples

The same use cases using only the CLI:

### 1. Block a Command with Helpful Context

```bash
# Initialize config
npx veil init --preset recommended

# Add rule to block wrangler deploy
npx veil add-rule -t cli \
  -m "^wrangler (deploy|publish)" \
  -a deny \
  -r "Use npm run build:stage or npx appkit deploy:stage instead" \
  --alternatives "npm run build:stage,npx appkit deploy:stage"

# Test the rule
npx veil check "wrangler deploy" -t cli
# ✗ BLOCKED wrangler deploy
#   Reason: Use npm run build:stage or npx appkit deploy:stage instead
#   Safe alternatives:
#     - npm run build:stage
#     - npx appkit deploy:stage
```

### 2. Block Sensitive Env Var Access

```bash
# Add rule to block direct access to sensitive token
npx veil add-rule -t env \
  -m "CLOUDFLARE_API_TOKEN" \
  -a deny \
  -r "SENSITIVE: Use wrangler commands instead of direct API access"

# Test the rule
npx veil check "CLOUDFLARE_API_TOKEN" -t env
# ✗ BLOCKED CLOUDFLARE_API_TOKEN
#   Reason: SENSITIVE: Use wrangler commands instead of direct API access
```

### 3. Explain Why Something Is Blocked

```bash
# Get detailed explanation of why a command would be blocked
npx veil explain "rm -rf /" -t cli
# ─ Explanation for: rm -rf / ─
# 
# Status: BLOCKED
# 
# Reason: Recursive delete from root or home
# 
# ─ Matching Rules ─
#   ✓ Match: rm -rf / → deny
```

### 4. Block Dangerous Git Commands

```bash
# Add rules for destructive git operations  
npx veil add-rule -t cli \
  -m "^git reset --hard" \
  -a deny \
  -r "BLOCKED: Discards uncommitted changes permanently" \
  --alternatives "git stash,git reset --soft"

npx veil add-rule -t cli \
  -m "^git push --force$" \
  -a deny \
  -r "BLOCKED: Overwrites remote history" \
  --alternatives "git push --force-with-lease"

# Test the rules
npx veil check "git reset --hard" -t cli
# ✗ BLOCKED git reset --hard
#   Reason: BLOCKED: Discards uncommitted changes permanently
#   Safe alternatives:
#     - git stash
#     - git reset --soft

npx veil check "git push --force" -t cli
# ✗ BLOCKED git push --force
#   Reason: BLOCKED: Overwrites remote history
#   Safe alternatives:
#     - git push --force-with-lease
```

### Scan Project for Sensitive Files

```bash
# Scan current directory for files that would be blocked
npx veil scan -d . --depth 3
# Scanning /path/to/project...
# 
# ─ Blocked Files ─
#   ✗ .env
#   ✗ .env.local
#   ✗ secrets/api-keys.json
# 
# ─ Summary ─
#   Total files scanned: 156
#   Blocked: 3
#   Allowed: 153
```

---

## Real-World Examples

### 1. Block a Command with Helpful Context

Block `wrangler deploy` and return project-specific deployment instructions:

```typescript
import { createVeil } from '@squadzero/veil';

const veil = createVeil({
  cliRules: [
    {
      match: /^wrangler\s+(deploy|publish)/,
      action: 'deny',
      reason: `Direct wrangler deploy is disabled in this project.

Use the project's deployment commands instead:
  • npm run build:stage     - Build for staging
  • npx appkit deploy:stage - Deploy app to staging  
  • npx appkit plugin deploy:stage - Deploy plugins to staging

For production, use CI/CD pipelines. Never deploy directly to production.`,
      safeAlternatives: [
        'npm run build:stage',
        'npx appkit deploy:stage',
        'npx appkit plugin deploy:stage'
      ]
    }
  ]
});

// When LLM tries to run wrangler deploy
const result = veil.checkCommand('wrangler deploy');
// result.ok === false
// result.reason contains the full deployment instructions
// result.safeAlternatives === ['npm run build:stage', ...]
```

### 2. Allow Access with Sensitivity Context

Let `CLOUDFLARE_API_TOKEN` pass through, but inject context about its sensitivity:

```typescript
import { createVeil } from '@squadzero/veil';

const veil = createVeil({
  envRules: [
    {
      match: 'CLOUDFLARE_API_TOKEN',
      action: 'allow',
      reason: `⚠️ SENSITIVE: This is a Cloudflare API token with full account access.
      
DO NOT:
- Log this value
- Include in error messages  
- Commit to version control
- Share in chat or documentation

This token can modify DNS, Workers, KV storage, and billing settings.
Treat it like a root password.`
    }
  ]
});

// LLM gets access to the token, but your handler can show the context
const result = veil.getEnv('CLOUDFLARE_API_TOKEN');
if (result.ok) {
  // You might inject this context into the LLM's response
  console.log('Context:', result.reason);
  console.log('Value:', result.value);
}
```

### 3. Add Corrective Guidance for Common Mistakes

Catch `wrangler kv:key get` without `--remote` and provide guidance:

```typescript
import { createVeil } from '@squadzero/veil';

const veil = createVeil({
  cliRules: [
    {
      // Match KV commands that DON'T have --remote flag
      match: /^wrangler\s+kv:key\s+(get|list|put|delete)(?!.*--remote)/,
      action: 'allow', // Let it through, but add context
      reason: `⚠️ LOCAL KV WARNING: This command queries local KV storage by default.

If this command returns 'undefined' or unexpected results, the key likely 
exists in REMOTE storage, not local.

Re-run with the --remote flag:
  wrangler kv:key get <key> --binding <BINDING> --remote

Common patterns:
  wrangler kv:key list --binding MY_KV --remote
  wrangler kv:key get "user:123" --binding MY_KV --remote`
    }
  ]
});

// LLM runs: wrangler kv:key get "config" --binding SETTINGS
const result = veil.checkCommand('wrangler kv:key get "config" --binding SETTINGS');
// result.ok === true (allowed)
// result.reason contains the --remote guidance

// Your handler can prepend this context to the command output
```

### 4. Block Dangerous Commands Completely

Block destructive commands with no workarounds:

```typescript
import { createVeil } from '@squadzero/veil';

const veil = createVeil({
  cliRules: [
    // Block rm -rf with dangerous targets
    {
      match: /^rm\s+(-rf|-fr|--force\s+--recursive)\s+(\/|~|\$HOME)/,
      action: 'deny',
      reason: 'BLOCKED: Recursive forced deletion of root or home directory is not allowed.',
      safeAlternatives: ['rm -i (interactive)', 'trash-cli', 'mv to backup location']
    },
    // Block destructive git operations
    {
      match: /^git\s+(reset\s+--hard|clean\s+-fd|push\s+--force(?!\s+--with-lease))/,
      action: 'deny',
      reason: `BLOCKED: Destructive git operation.

• git reset --hard - Permanently discards uncommitted changes
• git clean -fd    - Deletes untracked files permanently  
• git push --force - Overwrites remote history (use --force-with-lease instead)

These operations cannot be undone. Use safer alternatives.`,
      safeAlternatives: [
        'git stash (to save changes)',
        'git reset --soft (keeps changes staged)',
        'git push --force-with-lease (safer force push)'
      ]
    },
    // Block database drops
    {
      match: /DROP\s+(DATABASE|TABLE|SCHEMA)/i,
      action: 'deny',
      reason: 'BLOCKED: Database DROP operations are not allowed via LLM.',
      safeAlternatives: ['Use database admin tools', 'Create a backup first']
    }
  ]
});

// These are all blocked:
veil.checkCommand('rm -rf /');           // → blocked
veil.checkCommand('rm -rf ~');           // → blocked  
veil.checkCommand('git reset --hard');   // → blocked
veil.checkCommand('git push --force');   // → blocked
veil.checkCommand('DROP DATABASE prod'); // → blocked
```

---

## CLI Reference

```bash
npx veil <command> [options]
```

| Command            | Description                            |
| ------------------ | -------------------------------------- |
| `init`             | Create `.veilrc.json` with a preset    |
| `check <target>`   | Check if file/env/cli would be blocked |
| `explain <target>` | Explain why something is blocked       |
| `scan`             | Scan project for sensitive files       |
| `add-rule`         | Add a rule to config                   |
| `remove-rule`      | Remove a rule from config              |
| `list-rules`       | List all built-in rules                |
| `list-packs`       | List available presets                 |
| `show-config`      | Print current config                   |
| `apply-pack`       | Merge a preset into config             |

```bash
# Examples
npx veil init --preset strict
npx veil check ".env" -t file
npx veil check "CLOUDFLARE_API_TOKEN" -t env  
npx veil check "rm -rf /" -t cli
npx veil add-rule -t cli -m "^sudo" -a deny -r "sudo not allowed"
npx veil scan -d ./src --depth 5
```

---

## MCP Server (Model Context Protocol)

Veil includes an MCP server that provides **real-time interception** of LLM tool calls. When connected to Claude Desktop, Cursor, VS Code, or other MCP-compatible clients, it intercepts commands and env access *before* they execute.

### Setup

**1. Configure your MCP client:**

For **Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json`):

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

For **VS Code** (`.vscode/mcp.json` or settings):

```json
{
  "servers": {
    "veil": {
      "command": "npx",
      "args": ["@squadzero/veil", "mcp"]
    }
  }
}
```

**2. Create a config file** in your project root:

```typescript
// veil.config.ts
import type { VeilConfig } from '@squadzero/veil';

export default {
  cliRules: [
    { match: /^rm\s+-rf/, action: 'deny', reason: 'Blocked: dangerous delete' },
    { match: /^wrangler deploy/, action: 'deny', reason: 'Use CI/CD instead' },
  ],
  envRules: [
    { match: /_SECRET$/, action: 'mask', replacement: '****' },
  ]
} satisfies VeilConfig;
```

**3. Restart your editor.** The MCP server will load your config automatically.

### MCP Tools

The server exposes 4 tools to the LLM:

| Tool | Description |
|------|-------------|
| `run_command` | Execute a shell command (with Veil filtering) |
| `get_env` | Get an environment variable (with Veil filtering) |
| `check_command` | Check if a command is allowed without executing |
| `check_env` | Check if an env var is accessible without retrieving |

### Remote Development (HTTP Transport)

When using VS Code Remote SSH, the MCP server can run with HTTP transport:

```bash
veil mcp --http --port 3500
```

Then configure your client to connect via HTTP instead of stdio.

### How It Works

```
┌─────────────────────────────────────────────────────┐
│  Claude/Cursor/VS Code                              │
│                                                     │
│   LLM: "Run rm -rf /"                               │
│         │                                           │
│         ▼                                           │
│   ┌───────────────┐         ┌───────────────┐       │
│   │  MCP Client   │◄───────►│  Veil MCP     │       │
│   │  (built-in)   │  stdio  │  Server       │       │
│   └───────────────┘         └───────┬───────┘       │
│                                     │               │
│                                     ▼               │
│                             ┌───────────────┐       │
│                             │ veil.config   │       │
│                             │    rules      │       │
│                             └───────────────┘       │
│                                     │               │
│                                     ▼               │
│   Response: "Command blocked by Veil security      │
│   policy. Reason: Blocked: dangerous delete"       │
└─────────────────────────────────────────────────────┘
```

---

## Documentation

| Document                                                   | Description                             |
| ---------------------------------------------------------- | --------------------------------------- |
| [API Reference](./docs/api-reference.md)                   | Complete API documentation              |
| [Presets & Rules](./docs/presets-and-rules.md)             | ESLint-style rules system               |
| [Framework Integrations](./docs/framework-integrations.md) | OpenAI, Anthropic, LangChain, Vercel AI |
| [Plugins & Audit](./docs/plugins-and-audit.md)             | Plugin system and audit trails          |

### CLI Commands

| Command | Description |
|---------|-------------|
| `veil init` | Create a config file with preset |
| `veil check <target> -t <type>` | Check file/env/cli access |
| `veil add-rule` | Add a rule to config |
| `veil scan` | Scan directory for blocked files |
| `veil explain` | Explain why something is blocked |
| `veil install` | Add shell wrappers to intercept commands |
| `veil uninstall` | Remove shell wrappers |
| `veil mcp` | Start MCP server for IDE integration |
| `veil mcp --http` | Start MCP server with HTTP transport |

---

## Use Cases

- **Prevent accidental exposure** of `.env` files, API keys, and credentials
- **Block dangerous commands** like `rm -rf /` before they execute
- **Add context to allowed operations** so LLMs understand constraints
- **Provide corrective guidance** when LLMs make common mistakes
- **Audit all access** to understand what your AI assistant is touching
- **Enforce deployment guardrails** - block direct deploys, suggest CI/CD

## License

MIT © [Squad-Zero](https://github.com/Squad-Zero)
