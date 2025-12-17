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

## CLI Tool

Veil includes a CLI for project configuration:

```bash
# Initialize a .veilrc.json config file
npx veil init --preset recommended

# Check if a file/command would be blocked
npx veil check ".env" -t file
npx veil check "rm -rf /" -t cli

# Scan project for sensitive files
npx veil scan -d . --depth 3

# List available rules
npx veil list-rules
```

---

## Documentation

| Document | Description |
|----------|-------------|
| [API Reference](./docs/api-reference.md) | Complete API documentation |
| [Presets & Rules](./docs/presets-and-rules.md) | ESLint-style rules system |
| [Framework Integrations](./docs/framework-integrations.md) | OpenAI, Anthropic, LangChain, Vercel AI |
| [Plugins & Audit](./docs/plugins-and-audit.md) | Plugin system and audit trails |

---

## Use Cases

- **Prevent accidental exposure** of `.env` files, API keys, and credentials
- **Block dangerous commands** like `rm -rf /` before they execute
- **Add context to allowed operations** so LLMs understand constraints
- **Provide corrective guidance** when LLMs make common mistakes
- **Audit all access** to understand what your AI assistant is touching

## License

MIT © [Squad-Zero](https://github.com/Squad-Zero)
