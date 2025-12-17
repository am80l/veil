# Veil 🎭

**A TypeScript library for selective context access, visibility control & safety enforcement for LLMs.**

Veil acts as a *visibility firewall* between an LLM and your project's filesystem, environment variables, and command interfaces.

[![npm version](https://badge.fury.io/js/veil.svg)](https://badge.fury.io/js/veil)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6+-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- 🚫 **Hide** files, directories, and environment variables from LLMs
- 🔄 **Rewrite/intercept** LLM-initiated tool calls before execution
- 🎭 **Inject synthetic context** in place of sensitive real data
- 📋 **Policy layers** - global, per-session, and per-call rules
- 🔒 **Zero-leakage guardrails** with structured explanations
- 🔧 **ESLint-style rules** - 49 named rules across Windows, macOS, and Linux

## Installation

```bash
npm install veil
# or
pnpm add veil
# or
yarn add veil
```

## Quick Start

```typescript
import { createVeil } from 'veil';

const veil = createVeil({
  // Hide directories from LLM visibility
  fileRules: [
    { match: 'node_modules', action: 'deny' },
    { match: /secrets/, action: 'deny' },
    { match: '.env', action: 'mask', replacement: 'hidden_for_context' }
  ],
  
  // Protect sensitive environment variables
  envRules: [
    { match: /^AWS_/, action: 'mask' },
    { match: 'DATABASE_URL', action: 'deny' },
    { match: 'CLOUDFLARE_API_TOKEN', action: 'rewrite', replacement: '[REDACTED]' }
  ],
  
  // Block dangerous CLI commands
  cliRules: [
    { match: /^rm -rf/, action: 'deny', safeAlternatives: ['rm -i', 'trash'] },
    { match: /^docker build/, action: 'rewrite', replacement: "echo '[blocked]'" }
  ]
});
```

## Usage

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
} from 'veil';

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
} from 'veil';

const customPreset = {
  fileRules: [...COMMON_HIDDEN_DIRS],
  envRules: SENSITIVE_ENV_VARS,
  cliRules: DANGEROUS_COMMANDS
};
```

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
} from 'veil';

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
import { createVeil, registerPlatformRules, buildConfigFromRules } from 'veil';

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
import { recommended, extendRules, buildConfigFromRules } from 'veil';

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

| Pack | Description |
|------|-------------|
| `security:recommended` | Essential security rules |
| `security:strict` | Maximum security |
| `platform:windows` | Windows-specific protections |
| `platform:darwin` | macOS-specific protections |
| `platform:linux` | Linux-specific protections |
| `context:dev` | Rules for local development |
| `context:ci` | Rules for CI/CD pipelines |
| `context:production` | Maximum protection for production |
| `minimal` | Just the essentials |

## Modal Rules (Strict vs Passive Modes)

Modal rules provide dynamic enforcement modes for tooling like Wrangler, Docker, Terraform, and more. Each modal rule can operate in two modes:

- **Strict Mode**: Blocks access entirely and returns a custom message
- **Passive Mode**: Allows access but injects contextual guidance

### Quick Start with Modal Rules

```typescript
import { 
  createVeil, 
  registerPlatformRules, 
  buildConfigFromRules,
  wranglerRule, 
  dockerRule, 
  terraformRule 
} from 'veil';

registerPlatformRules();

// Passive mode: Allow wrangler with helpful context
const veil = createVeil(buildConfigFromRules({
  'wrangler': { mode: 'passive' },
  'docker': { mode: 'passive' }
}));

// Strict mode: Block terraform with custom message
const strictVeil = createVeil(buildConfigFromRules({
  'terraform': { 
    mode: 'strict', 
    message: 'Terraform is blocked in this environment' 
  }
}));
```

### Available Modal Rules

| Rule | Default Mode | Description |
|------|--------------|-------------|
| `wrangler` | passive | Cloudflare Workers CLI |
| `docker` | passive | Docker container management |
| `terraform` | passive | Infrastructure as Code |
| `kubectl` | passive | Kubernetes CLI |
| `aws-cli` | passive | AWS Command Line Interface |
| `npm` | passive | Node.js package manager |
| `git` | passive | Version control operations |

### Strict vs Passive Examples

```typescript
// PASSIVE MODE: Injects context about the tool
const passiveConfig = buildConfigFromRules({
  'wrangler': { mode: 'passive' }
});

const veil = createVeil(passiveConfig);
const result = veil.checkCommand('wrangler deploy');
// result.ok === true (allowed)
// Context about KV stores, environments, etc. is available

// STRICT MODE: Blocks the command entirely
const strictConfig = buildConfigFromRules({
  'wrangler': { 
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
  'docker': { 
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
  'wrangler': { mode: 'passive' },
  'docker': { mode: 'strict', message: 'Docker is not available' },
  
  // Static rules (standard ESLint-style)
  'env/mask-aws': 'error',
  'fs/hide-env-files': 'error',
  'linux/no-delete-root': 'error',
});
```

### Modal Rules API

| Function | Description |
|----------|-------------|
| `wranglerRule` | Modal rule for Cloudflare Wrangler |
| `dockerRule` | Modal rule for Docker |
| `terraformRule` | Modal rule for Terraform |
| `kubectlRule` | Modal rule for Kubernetes |
| `awsCliRule` | Modal rule for AWS CLI |
| `npmRule` | Modal rule for npm |
| `gitRule` | Modal rule for Git |

Each modal rule has:
- `name` - Rule identifier (e.g., "wrangler")
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

### Rules API Reference

| Function | Description |
|----------|-------------|
| `registerPlatformRules()` | Register all built-in rules (call once) |
| `recommended()` | Get recommended rules for current platform |
| `strict()` | Get strict rules for current platform |
| `fromPacks(...packs)` | Combine multiple rule packs |
| `fromCategory(category)` | Get all rules in a category |
| `buildConfigFromRules(rules, platform?)` | Convert rules to VeilConfig |
| `extendRules(base, overrides)` | Extend a config with overrides |
| `listRules()` | List all available rule IDs |
| `listPacks()` | List all available pack names |
| `getRule(id)` | Get rule details by ID |

### Veil Instance Methods

| Method                    | Description                             |
| ------------------------- | --------------------------------------- |
| `checkFile(path)`         | Check if a file is accessible           |
| `checkDirectory(path)`    | Check if a directory is accessible      |
| `filterPaths(paths)`      | Filter a list of paths by visibility    |
| `getEnv(key)`             | Get an env variable with rules applied  |
| `getVisibleEnv()`         | Get all visible env variables           |
| `checkCommand(cmd)`       | Check/transform a CLI command           |
| `guard(fn)`               | Execute operation in guarded context    |
| `scope(policy)`           | Create scoped instance with extra rules |
| `getContext()`            | Get current visibility context          |
| `getInterceptedCalls()`   | Get audit log of blocked operations     |
| `clearInterceptedCalls()` | Clear the audit log                     |

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
