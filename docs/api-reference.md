# Veil API Reference

Complete API documentation for Veil.

## Core API

### `createVeil(config?: VeilConfig): Veil`

Creates a new Veil instance.

**Config Options:**
- `fileRules` - Rules for file/directory visibility
- `envRules` - Rules for environment variable access
- `cliRules` - Rules for CLI command interception
- `injectors` - Custom content injectors

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

## Veil Instance Methods

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

## Rules API Reference

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
