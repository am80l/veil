# Veil 🎭

**A TypeScript library for selective context access, visibility control & safety enforcement for LLMs.**

Veil acts as a *visibility firewall* between an LLM and your project's filesystem, environment variables, and command interfaces.

[![npm version](https://img.shields.io/npm/v/@squadzero/veil.svg)](https://www.npmjs.com/package/@squadzero/veil)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6+-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Why Veil?

When you give an LLM access to your codebase (via tools like file reading, command execution, or environment access), you're exposing everything by default. Veil lets you:

- **Prevent accidental exposure** of `.env` files, API keys, and credentials
- **Block dangerous commands** like `rm -rf /` before they execute
- **Hide irrelevant directories** like `node_modules` to reduce context noise
- **Audit all access** to understand what your AI assistant is touching

## How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│                        Your Application                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌─────────┐      ┌─────────┐      ┌─────────────────────┐     │
│   │   LLM   │ ───▶ │  Veil   │ ───▶ │  Filesystem / Env   │     │
│   │ (Claude,│      │ Filter  │      │  / CLI Execution    │     │
│   │  GPT,   │      │         │      │                     │     │
│   │ Gemini) │ ◀─── │         │ ◀─── │                     │     │
│   └─────────┘      └─────────┘      └─────────────────────────┘ │
│                         │                                        │
│                    ┌────┴────┐                                   │
│                    │  Rules  │                                   │
│                    │ (deny,  │                                   │
│                    │  mask,  │                                   │
│                    │ rewrite)│                                   │
│                    └─────────┘                                   │
└─────────────────────────────────────────────────────────────────┘
```

**Veil sits between your LLM and system resources.** Before the LLM reads a file, accesses an env var, or runs a command, Veil checks your rules and either allows, blocks, masks, or rewrites the operation.

## Features

- 🚫 **Hide** files, directories, and environment variables from LLMs
- 🔄 **Rewrite/intercept** LLM-initiated tool calls before execution
- 🎭 **Inject synthetic context** in place of sensitive real data
- 📋 **Policy layers** - global, per-session, and per-call rules
- 🔒 **Zero-leakage guardrails** with structured explanations
- 🔧 **ESLint-style rules** - 49 named rules across Windows, macOS, and Linux

## Installation

```bash
npm install @squadzero/veil
# or
pnpm add @squadzero/veil
# or
yarn add @squadzero/veil
```

## Quick Start

### Step 1: Create a Veil Instance

```typescript
import { createVeil, PRESET_RECOMMENDED } from '@squadzero/veil';

// Start with the recommended preset (covers common security cases)
const veil = createVeil(PRESET_RECOMMENDED);
```

### Step 2: Wrap Your LLM Tool Handlers

When your LLM requests to read a file, check an env var, or run a command, run it through Veil first:

```typescript
// Example: Wrapping a file-read tool for an LLM
async function handleFileRead(path: string): Promise<string> {
  // Check if Veil allows access
  const check = veil.checkFile(path);
  
  if (!check.ok) {
    // Return a safe message to the LLM instead of the file contents
    return `Access denied: ${check.reason}`;
  }
  
  // Safe to read - proceed normally
  return fs.readFileSync(path, 'utf-8');
}

// Example: Wrapping an env-var tool
function handleGetEnv(key: string): string {
  const result = veil.getEnv(key);
  
  if (!result.ok) {
    return `Environment variable '${key}' is not accessible`;
  }
  
  // Returns masked value if configured (e.g., "sk-****1234")
  return result.value;
}

// Example: Wrapping a command execution tool
async function handleRunCommand(command: string): Promise<string> {
  const check = veil.checkCommand(command);
  
  if (!check.ok) {
    return `Command blocked: ${check.reason}. Try: ${check.safeAlternatives?.join(', ')}`;
  }
  
  // Use the (possibly rewritten) command
  return execSync(check.command).toString();
}
```

### Step 3: Use with Your LLM Framework

Here's how Veil integrates with popular LLM frameworks:

<details>
<summary><b>OpenAI Function Calling</b></summary>

```typescript
import OpenAI from 'openai';
import { createVeil, PRESET_RECOMMENDED } from '@squadzero/veil';

const veil = createVeil(PRESET_RECOMMENDED);
const openai = new OpenAI();

// Define your tools
const tools = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      parameters: { type: 'object', properties: { path: { type: 'string' } } }
    }
  }
];

// Handle tool calls with Veil protection
async function handleToolCall(name: string, args: any) {
  if (name === 'read_file') {
    const check = veil.checkFile(args.path);
    if (!check.ok) return { error: check.reason };
    return { content: fs.readFileSync(args.path, 'utf-8') };
  }
}
```
</details>

<details>
<summary><b>Anthropic Claude Tool Use</b></summary>

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { createVeil, PRESET_RECOMMENDED } from '@squadzero/veil';

const veil = createVeil(PRESET_RECOMMENDED);
const anthropic = new Anthropic();

// Process tool use blocks with Veil protection
function processToolUse(toolName: string, toolInput: any) {
  if (toolName === 'read_file') {
    const check = veil.checkFile(toolInput.path);
    if (!check.ok) {
      return { type: 'error', error: check.reason };
    }
    return { type: 'success', content: fs.readFileSync(toolInput.path, 'utf-8') };
  }
  
  if (toolName === 'run_command') {
    const check = veil.checkCommand(toolInput.command);
    if (!check.ok) {
      return { type: 'error', error: check.reason };
    }
    return { type: 'success', output: execSync(check.command).toString() };
  }
}
```
</details>

<details>
<summary><b>LangChain Tools</b></summary>

```typescript
import { DynamicTool } from 'langchain/tools';
import { createVeil, PRESET_RECOMMENDED } from '@squadzero/veil';

const veil = createVeil(PRESET_RECOMMENDED);

// Create a Veil-protected file reading tool
const readFileTool = new DynamicTool({
  name: 'read_file',
  description: 'Read contents of a file',
  func: async (path: string) => {
    const check = veil.checkFile(path);
    if (!check.ok) {
      return `Cannot read file: ${check.reason}`;
    }
    return fs.readFileSync(path, 'utf-8');
  },
});

// Create a Veil-protected command execution tool
const runCommandTool = new DynamicTool({
  name: 'run_command',
  description: 'Execute a shell command',
  func: async (command: string) => {
    const check = veil.checkCommand(command);
    if (!check.ok) {
      return `Command blocked: ${check.reason}`;
    }
    return execSync(check.command).toString();
  },
});
```
</details>

<details>
<summary><b>Vercel AI SDK</b></summary>

```typescript
import { tool } from 'ai';
import { z } from 'zod';
import { createVeil, PRESET_RECOMMENDED } from '@squadzero/veil';

const veil = createVeil(PRESET_RECOMMENDED);

const readFileTool = tool({
  description: 'Read a file from the filesystem',
  parameters: z.object({ path: z.string() }),
  execute: async ({ path }) => {
    const check = veil.checkFile(path);
    if (!check.ok) {
      return { error: check.reason };
    }
    return { content: fs.readFileSync(path, 'utf-8') };
  },
});
```
</details>

## Core API

### File & Directory Access Control

```typescript
// Check if a file is accessible
const result = veil.checkFile('/path/to/secrets/config.json');
if (!result.ok) {
  console.log('Blocked:', result.reason);
  // Output: Blocked: file_hidden_by_policy
}

// Check directory access
const dirResult = veil.checkDirectory('node_modules');
if (!dirResult.ok) {
  console.log(dirResult.details);
  // { target: 'node_modules', policy: 'rules[0]', action: 'deny' }
}

// Filter a list of paths
const allPaths = ['src/index.ts', 'node_modules/react', 'secrets/api.json'];
const visiblePaths = veil.filterPaths(allPaths);
// Result: ['src/index.ts']
```

### Environment Variable Protection

```typescript
// Get a masked env variable
const envResult = veil.getEnv('AWS_SECRET_KEY');
if (envResult.ok) {
  console.log(envResult.value); // "A********Y" (masked)
}

// Get all visible environment variables
const visibleEnv = veil.getVisibleEnv();
// Returns filtered/masked env object
```

### CLI Command Interception

```typescript
// Check if a command is safe
const cmdResult = veil.checkCommand('rm -rf /');
if (!cmdResult.ok) {
  console.log('Blocked:', cmdResult.reason);
  console.log('Try instead:', cmdResult.safeAlternatives);
  // Try instead: ['rm -i', 'trash']
}

// Commands can be rewritten
const dockerResult = veil.checkCommand('docker build -t app .');
console.log(dockerResult.command); // "echo '[blocked]'"
```

### Scoped Policies

Create temporary scoped instances with additional rules:

```typescript
const scopedVeil = veil.scope({
  fileRules: [
    { match: 'dist', action: 'deny' }
  ]
});

// The scoped instance has both original + new rules
```

### Audit Trail

Track all intercepted operations:

```typescript
// Perform some operations
veil.checkFile('secrets/api.json');
veil.getEnv('AWS_SECRET_KEY');

// Get the audit log
const intercepted = veil.getInterceptedCalls();
console.log(intercepted);
// [
//   { type: 'file', target: 'secrets/api.json', action: 'deny', timestamp: ... },
//   { type: 'env', target: 'AWS_SECRET_KEY', action: 'mask', timestamp: ... }
// ]

// Clear the log
veil.clearInterceptedCalls();
```

### Context Injection

Provide synthetic data to LLMs:

```typescript
const veil = createVeil({
  injectors: {
    files: (path) => {
      if (path === 'config/settings.json') {
        return '{"env": "development", "debug": true}';
      }
      return null; // Use default behavior
    },
    directories: (path) => {
      if (path === 'apps') {
        return ['app1', 'app2', 'app3']; // Curated list
      }
      return null;
    },
    env: (key) => {
      if (key === 'API_ENDPOINT') {
        return 'https://sandbox.api.example.com';
      }
      return null;
    }
  }
});
```

## Rule Actions

| Action    | Description                              |
| --------- | ---------------------------------------- |
| `allow`   | Permit access (default for non-matching) |
| `deny`    | Block access completely                  |
| `mask`    | Return a masked/placeholder value        |
| `rewrite` | Replace with custom content              |

## Blocked Response Format

When Veil blocks an operation, it returns a structured response:

```typescript
{
  ok: false,
  blocked: true,
  reason: 'file_hidden_by_policy',
  details: {
    target: '/path/to/secrets/config.json',
    policy: 'fileRules[1]',
    action: 'deny'
  }
}
```

## API Reference

### `createVeil(config?: VeilConfig): Veil`

Creates a new Veil instance.

**Config Options:**
- `fileRules` - Rules for file/directory visibility
- `envRules` - Rules for environment variable access
- `cliRules` - Rules for CLI command interception
- `injectors` - Custom content injectors

## Presets

Veil includes pre-configured rule sets for common use cases:

```typescript
import { 
  createVeil, 
  PRESET_RECOMMENDED,
  PRESET_STRICT,
  PRESET_MINIMAL,
  PRESET_CI,
  mergeConfigs 
} from '@squadzero/veil';

// Use the recommended preset directly
const veil = createVeil(PRESET_RECOMMENDED);

// Combine presets with your own rules
const customVeil = createVeil(mergeConfigs(
  PRESET_RECOMMENDED,
  {
    fileRules: [
      { match: 'my-custom-secret', action: 'deny' }
    ]
  }
));
```

### Available Presets

| Preset               | Description                                                                          |
| -------------------- | ------------------------------------------------------------------------------------ |
| `PRESET_RECOMMENDED` | Balanced defaults: blocks node_modules, .git, .env, secrets, and dangerous commands  |
| `PRESET_STRICT`      | Maximum security: masks all env vars by default, blocks sudo, docker run             |
| `PRESET_MINIMAL`     | Essential protection only: just .env files, passwords, and rm -rf                    |
| `PRESET_CI`          | CI/CD safe: allows CI env vars (GITHUB_*, GITLAB_*, etc.), blocks publish/force-push |

### Individual Rule Sets

You can also import individual rule sets to compose your own config:

```typescript
import { 
  COMMON_HIDDEN_DIRS,    // node_modules, .git, dist, build, etc.
  SENSITIVE_FILES,       // .env, *.pem, *.key, credentials, etc.
  SENSITIVE_ENV_VARS,    // AWS_*, passwords, tokens, API keys
  DANGEROUS_COMMANDS,    // rm -rf, chmod 777, curl|bash, etc.
  CREDENTIAL_LEAK_COMMANDS  // curl -u, echo $PASSWORD
} from '@squadzero/veil';

const customPreset = {
  fileRules: [...COMMON_HIDDEN_DIRS],
  envRules: SENSITIVE_ENV_VARS,
  cliRules: DANGEROUS_COMMANDS
};
```

## Monorepo & Directory Pattern Examples

### Example: NX Monorepo Directory Tree

```
my-nx-monorepo/
├── apps/
│   ├── web-app/
│   │   ├── src/
│   │   └── secrets/
│   └── admin-app/
│       ├── src/
│       └── secrets/
├── libs/
│   ├── shared/
│   │   └── private/
│   └── api/
│       └── private/
├── tools/
│   └── scripts/
├── .env
└── .nx.json
```

### Veil Config: Block Sensitive Patterns

```jsonc
{
  "fileRules": [
    // Block all secrets folders in any app
    { "match": "apps/*/secrets", "action": "deny" },
    // Block all private folders in any lib
    { "match": "libs/**/private", "action": "deny" },
    // Block all .env files anywhere
    { "match": "**/.env", "action": "deny" },
    // Optionally block config files
    { "match": ".nx.json", "action": "deny" }
  ]
}
```

- Supports glob patterns (`*`, `**`) for deep matching
- Use `deny`, `mask`, or `rewrite` actions as needed
- Works for Yarn, PNPM, NX, Turborepo, and custom monorepos

> For more advanced patterns, see the [Glob Pattern Reference](https://github.com/micromatch/micromatch#matching-features).

## ESLint-Style Rules System

Veil includes a powerful rule-based configuration system inspired by ESLint. Rules are named, documented, and can be individually enabled/disabled.

### Quick Start with Rules

```typescript
import { 
  createVeil, 
  registerPlatformRules, 
  fromPacks, 
  buildConfigFromRules,
  recommended 
} from '@squadzero/veil';

// Register all built-in rules (call once at startup)
registerPlatformRules();

// Method 1: Use the recommended preset for your platform
const veil = createVeil(buildConfigFromRules(recommended()));

// Method 2: Combine rule packs (like ESLint's "extends")
const rules = fromPacks('security:recommended', 'platform:linux');
const veil2 = createVeil(buildConfigFromRules(rules));
```

### Explicit Rule Configuration

Configure rules individually like ESLint:

```typescript
import { createVeil, registerPlatformRules, buildConfigFromRules } from '@squadzero/veil';

registerPlatformRules();

const veil = createVeil(buildConfigFromRules({
  // Security rules
  'env/mask-aws': 'error',
  'env/deny-passwords': 'error',
  'fs/hide-env-files': 'error',
  
  // Platform-specific (Linux)
  'linux/no-delete-root': 'error',
  'linux/no-delete-boot': 'error',
  'linux/hide-shadow': 'warn',
  
  // Disable rules you don't need
  'fs/hide-node-modules': 'off',
}, 'linux'));
```

### Extending Presets

```typescript
import { recommended, extendRules, buildConfigFromRules } from '@squadzero/veil';

const customRules = extendRules(recommended(), {
  // Override specific rules
  'fs/hide-build-output': 'off',
  
  // Add stricter rules
  'env/deny-database-urls': 'error',
  'cli/no-curl-pipe-bash': 'error',
});

const veil = createVeil(buildConfigFromRules(customRules));
```

### Available Rule Packs

| Pack                   | Description                       |
| ---------------------- | --------------------------------- |
| `security:recommended` | Essential security rules          |
| `security:strict`      | Maximum security                  |
| `platform:windows`     | Windows-specific protections      |
| `platform:darwin`      | macOS-specific protections        |
| `platform:linux`       | Linux-specific protections        |
| `context:dev`          | Rules for local development       |
| `context:ci`           | Rules for CI/CD pipelines         |
| `context:production`   | Maximum protection for production |
| `minimal`              | Just the essentials               |

## Modal Rules (Strict vs Passive Modes)

Modal rules provide dynamic enforcement modes for tooling like Wrangler, Docker, Terraform, and more. Each modal rule can operate in two modes:

- **Strict Mode**: Blocks access entirely and returns a custom message
- **Passive Mode**: Allows access but injects contextual guidance

### Quick Start with Modal Rules

```typescript
import { 
  createVeil, 
  registerPlatformRules, 
  registerModalRules,
  buildConfigFromRules,
  wranglerRule, 
  dockerRule, 
  terraformRule 
} from '@squadzero/veil';

registerPlatformRules();
registerModalRules();

// Passive mode: Allow wrangler with helpful context
const veil = createVeil(buildConfigFromRules({
  'cli/wrangler': { mode: 'passive' },
  'cli/docker': { mode: 'passive' }
}));

// Strict mode: Block terraform with custom message
const strictVeil = createVeil(buildConfigFromRules({
  'cli/terraform': { 
    mode: 'strict', 
    message: 'Terraform is blocked in this environment' 
  }
}));
```

### Available Modal Rules

| Rule ID         | Default Mode | Description                 |
| --------------- | ------------ | --------------------------- |
| `cli/wrangler`  | passive      | Cloudflare Workers CLI      |
| `cli/docker`    | passive      | Docker container management |
| `cli/terraform` | passive      | Infrastructure as Code      |
| `cli/kubectl`   | passive      | Kubernetes CLI              |
| `cli/aws`       | passive      | AWS Command Line Interface  |
| `cli/npm`       | passive      | Node.js package manager     |
| `cli/git`       | passive      | Version control operations  |

### Strict vs Passive Examples

```typescript
// PASSIVE MODE: Injects context about the tool
const passiveConfig = buildConfigFromRules({
  'cli/wrangler': { mode: 'passive' }
});

const veil = createVeil(passiveConfig);
const result = veil.checkCommand('wrangler deploy');
// result.ok === true (allowed)
// Context about KV stores, environments, etc. is available

// STRICT MODE: Blocks the command entirely
const strictConfig = buildConfigFromRules({
  'cli/wrangler': { 
    mode: 'strict',
    message: 'Wrangler is disabled. Use the Cloudflare dashboard instead.'
  }
});

const strictVeil = createVeil(strictConfig);
const blocked = strictVeil.checkCommand('wrangler deploy');
// blocked.ok === false
// blocked.reason === 'Wrangler is disabled. Use the Cloudflare dashboard instead.'
```

### Custom Context in Passive Mode

```typescript
const customPassive = buildConfigFromRules({
  'cli/docker': { 
    mode: 'passive',
    context: `Docker is available with the following constraints:
      - Use 'docker-compose' for local development
      - Production images must use the approved base image
      - No --privileged containers allowed`
  }
});
```

### Mixed Modal and Static Rules

```typescript
const mixedConfig = buildConfigFromRules({
  // Modal rules with modes
  'cli/wrangler': { mode: 'passive' },
  'cli/docker': { mode: 'strict', message: 'Docker is not available' },
  
  // Static rules (standard ESLint-style)
  'env/mask-aws': 'error',
  'fs/hide-env-files': 'error',
  'linux/no-delete-root': 'error',
});
```

### Modal Rules API

| Function        | Description                        |
| --------------- | ---------------------------------- |
| `wranglerRule`  | Modal rule for Cloudflare Wrangler |
| `dockerRule`    | Modal rule for Docker              |
| `terraformRule` | Modal rule for Terraform           |
| `kubectlRule`   | Modal rule for Kubernetes          |
| `awsCliRule`    | Modal rule for AWS CLI             |
| `npmRule`       | Modal rule for npm                 |
| `gitRule`       | Modal rule for Git                 |

Each modal rule has:
- `id` - Rule identifier (e.g., "cloudflare/wrangler")
- `supportsMode` - Always `true`
- `defaultMode` - Default enforcement mode
- `defaultContext` - Default passive mode context
- `defaultMessage` - Default strict mode message
- `createRules(mode, options)` - Factory to generate rules

### Example Rule IDs

```
# Platform-specific
linux/no-delete-root       # Prevent rm -rf /
linux/hide-shadow          # Hide /etc/shadow
darwin/hide-keychain       # Hide macOS Keychain
darwin/no-disable-sip      # Prevent disabling SIP
win/no-delete-system32     # Protect System32
win/no-format-drive        # Prevent formatting drives

# Cross-platform credentials
env/mask-aws               # Mask AWS_* variables
env/deny-passwords         # Deny PASSWORD variables
env/mask-tokens            # Mask TOKEN/API_KEY vars

# Filesystem
fs/hide-env-files          # Hide .env files
fs/hide-private-keys       # Hide *.pem, *.key files
fs/hide-node-modules       # Hide node_modules

# CLI safety
cli/no-curl-pipe-bash      # Block curl | bash
cli/no-credential-echo     # Block echo $PASSWORD
```

## Fluent Builder API

For a more ergonomic configuration experience, use the `VeilBuilder`:

```typescript
import { veilBuilder } from '@squadzero/veil';

// Build a Veil instance with fluent API
const veil = veilBuilder()
  .usePack('security:recommended')
  .usePack('platform:linux')
  .useModal('cli/wrangler', { mode: 'passive' })
  .useModal('cli/docker', { mode: 'strict', message: 'Docker is disabled' })
  .denyFile('secrets/')
  .denyFile(/\.pem$/)
  .denyEnv(/^AWS_/)
  .denyCommand(/^rm -rf/)
  .build();

// Use it normally
const result = veil.checkFile('/path/to/secrets/api.json');
```

### Builder Methods

| Method                      | Description                        |
| --------------------------- | ---------------------------------- |
| `usePack(pack)`             | Add a rule pack                    |
| `useModal(ruleId, options)` | Configure a modal rule             |
| `denyFile(pattern)`         | Add a deny rule for files          |
| `denyEnv(pattern)`          | Add a deny rule for env vars       |
| `denyCommand(pattern)`      | Add a deny rule for CLI commands   |
| `maskEnv(pattern)`          | Add a mask rule for env vars       |
| `allowFile(pattern)`        | Add an allow rule for files        |
| `allowEnv(pattern)`         | Add an allow rule for env vars     |
| `allowCommand(pattern)`     | Add an allow rule for CLI commands |
| `withInjectors(injectors)`  | Add custom content injectors       |
| `build()`                   | Build the Veil instance            |

## Plugin System

Extend Veil with plugins for logging, metrics, or custom behavior:

```typescript
import { 
  createVeil, 
  PluginManager, 
  createLoggingPlugin, 
  createMetricsPlugin 
} from '@squadzero/veil';

// Create plugin manager
const plugins = new PluginManager();
plugins.use(createLoggingPlugin());
plugins.use(createMetricsPlugin());

// Create veil with plugins wrapping operations
const veil = createVeil({ /* config */ });

// Use plugins with operations
const fileContext = { path: '/path/to/file.txt', operation: 'checkFile' as const };

// Before hook can short-circuit
const shortCircuit = plugins.runBeforeFileCheck(fileContext);
if (shortCircuit) {
  console.log('Plugin handled:', shortCircuit);
} else {
  const result = veil.checkFile('/path/to/file.txt');
  // After hook for logging/metrics
  plugins.runAfterFileCheck(fileContext, result);
}

// Get metrics from metrics plugin
const metricsPlugin = createMetricsPlugin();
plugins.use(metricsPlugin);
// ... run some checks ...
console.log(metricsPlugin.getMetrics());
// { files: 5, env: 2, cli: 1, blocked: 2 }
```

### Custom Plugins

```typescript
import type { VeilPlugin } from '@squadzero/veil';

const myPlugin: VeilPlugin = {
  name: 'my-custom-plugin',
  
  // Called before file check - can short-circuit
  beforeFileCheck(ctx) {
    console.log(`Checking file: ${ctx.path}`);
    
    // Return a result to short-circuit
    if (ctx.path.includes('ultra-secret')) {
      return {
        ok: false,
        blocked: true,
        reason: 'file_hidden_by_policy',
        details: { target: ctx.path, policy: 'plugin', action: 'deny' }
      };
    }
    
    // Return undefined to continue normal processing
    return undefined;
  },
  
  // Called after file check - can modify result
  afterFileCheck(ctx, result) {
    if (!result.ok) {
      console.log(`Blocked: ${ctx.path}`);
    }
    return result; // Must return the result
  },
  
  beforeEnvCheck(ctx) { /* ... */ },
  afterEnvCheck(ctx, result) { return result; },
  beforeCliCheck(ctx) { /* ... */ },
  afterCliCheck(ctx, result) { return result; },
  
  // Called when plugin is installed
  install(config) {
    console.log('Plugin installed with config:', config);
  }
};
```

## Advanced Audit System

The `AuditManager` provides comprehensive audit trails with event emitters and storage adapters:

```typescript
import { AuditManager, MemoryStorageAdapter } from '@squadzero/veil';

// Create audit manager with storage
const storage = new MemoryStorageAdapter({ maxRecords: 10000 });
const audit = new AuditManager(storage);

// Subscribe to events by action type
audit.on('deny', (event) => {
  console.log(`BLOCKED: ${event.record.target}`);
});

audit.on('mask', (event) => {
  console.log(`Masked: ${event.record.target}`);
});

// Subscribe to all events
audit.on('*', (event) => {
  console.log(`[${event.type}] ${event.record.target}`);
});

// Record events (type, target, action, policy)
audit.record('file', '/path/to/secrets.json', 'deny', 'fileRules[1]');
audit.record('env', 'AWS_SECRET', 'mask', 'envRules[0]');

// Query records
const blocked = await audit.query({ action: 'deny' });
const recentFiles = await audit.query({ 
  type: 'file', 
  since: Date.now() - 60000 // Last minute
});

// Cleanup
await audit.clear();
```

### Custom Storage Adapters

```typescript
import type { AuditStorageAdapter, InterceptRecord } from '@squadzero/veil';
import * as fs from 'fs/promises';

// Example: File-based storage
const fileStorage: AuditStorageAdapter = {
  store: async (record) => {
    await fs.appendFile('audit.log', JSON.stringify(record) + '\n');
  },
  
  getAll: async () => {
    const data = await fs.readFile('audit.log', 'utf-8');
    return data.split('\n').filter(Boolean).map(JSON.parse);
  },
  
  clear: async () => {
    await fs.writeFile('audit.log', '');
  },
  
  // Optional: Custom query implementation
  query: async (criteria) => {
    const all = await fileStorage.getAll();
    // Filter by criteria...
    return all as InterceptRecord[];
  },
};

const audit = new AuditManager(fileStorage);
```

### Built-in Storage Adapters

| Adapter                       | Description                              |
| ----------------------------- | ---------------------------------------- |
| `MemoryStorageAdapter`        | In-memory storage with max records limit |
| `createConsoleStorageAdapter` | Logs to console and stores in memory     |

## Enhanced Guard Function

The `guard()` function executes operations with tracking and supports detailed result mode:

```typescript
const veil = createVeil({
  fileRules: [{ match: 'secret', action: 'deny' }],
});

// Simple mode: just get the result
const result = await veil.guard(() => {
  veil.checkFile('/path/to/secret.txt');
  return 'done';
});

// Detailed mode: get execution metrics
const detailed = await veil.guard(
  () => {
    veil.checkFile('/path/to/secret.txt');
    veil.checkFile('/path/to/public.txt');
    return 'processed';
  },
  { detailed: true }
);

console.log(detailed);
// {
//   value: 'processed',
//   success: true,
//   duration: 5,
//   intercepts: [
//     { type: 'file', target: '/path/to/secret.txt', action: 'deny', ... }
//   ]
// }

// Error handling in detailed mode
const errorResult = await veil.guard(
  () => { throw new Error('Something failed'); },
  { detailed: true }
);

console.log(errorResult);
// {
//   value: undefined,
//   success: false,
//   error: Error('Something failed'),
//   duration: 1,
//   intercepts: []
// }
```

### Rules API Reference

| Function                                 | Description                                |
| ---------------------------------------- | ------------------------------------------ |
| `registerPlatformRules()`                | Register all built-in rules (call once)    |
| `recommended()`                          | Get recommended rules for current platform |
| `strict()`                               | Get strict rules for current platform      |
| `fromPacks(...packs)`                    | Combine multiple rule packs                |
| `fromCategory(category)`                 | Get all rules in a category                |
| `buildConfigFromRules(rules, platform?)` | Convert rules to VeilConfig                |
| `extendRules(base, overrides)`           | Extend a config with overrides             |
| `listRules()`                            | List all available rule IDs                |
| `listPacks()`                            | List all available pack names              |
| `getRule(id)`                            | Get rule details by ID                     |

### Veil Instance Methods

| Method                          | Description                                  |
| ------------------------------- | -------------------------------------------- |
| `checkFile(path)`               | Check if a file is accessible                |
| `checkDirectory(path)`          | Check if a directory is accessible           |
| `filterPaths(paths)`            | Filter a list of paths by visibility         |
| `getEnv(key)`                   | Get an env variable with rules applied       |
| `getVisibleEnv()`               | Get all visible env variables                |
| `checkCommand(cmd)`             | Check/transform a CLI command                |
| `guard(fn)`                     | Execute operation in guarded context         |
| `guard(fn, { detailed: true })` | Execute with detailed tracking (GuardResult) |
| `scope(policy)`                 | Create scoped instance with extra rules      |
| `getContext()`                  | Get current visibility context               |
| `getInterceptedCalls()`         | Get audit log of blocked operations          |
| `clearInterceptedCalls()`       | Clear the audit log                          |

## Use Cases

- **Privacy-preserving development** - Hide sensitive files from AI assistants
- **Autonomous agent guardrails** - Prevent dangerous operations
- **Monorepo management** - Hide irrelevant directories to reduce context
- **Secure CI/CD copilots** - Control what AI can see and do
- **IDE integrations** - Works with Copilot, Cursor, Codeium, etc.

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Build
npm run build

# Type check
npm run typecheck
```

## License

MIT © [Squad-Zero](https://github.com/Squad-Zero)

## Contributors

- [Squad-Zero](https://github.com/Squad-Zero) - Organization
- [am80l](https://github.com/am80l) - Creator & Maintainer
- [michaelhartmayer](https://github.com/michaelhartmayer) - Creator & Maintainer

---

Built with ❤️ for safer AI-assisted development.
