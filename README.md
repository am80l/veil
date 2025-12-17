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

MIT © [am80l](https://github.com/am80l)

## Contributors

- [am80l](https://github.com/am80l) - Creator & Maintainer
- [michaelhartmayer](https://github.com/michaelhartmayer) - Creator & Maintainer

---

Built with ❤️ for safer AI-assisted development.
