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

## MCP Tools API

The MCP server exposes tools that AI agents can call. Each tool supports dynamic config loading based on the working directory.

### Tool Parameters

#### `run_command`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `command` | string | ✅ | The shell command to execute |
| `cwd` | string | ❌ | Working directory. Config is loaded from this path. |
| `timeout` | number | ❌ | Timeout in ms (default: 30000) |

#### `check_command`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `command` | string | ✅ | The command to check |
| `cwd` | string | ❌ | Directory to load config from |

#### `get_env` / `check_env`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | ✅ | Environment variable name |
| `cwd` | string | ❌ | Directory to load config from |

#### `check_file` / `read_file` / `write_file`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | string | ✅ | File path to check/read/write |
| `operation` | string | ❌ | For check_file: "read" or "write" |
| `content` | string | ✅* | For write_file only |

*Config is automatically loaded from the file's parent directory.

### Config Resolution

When `cwd` is provided, Veil walks up the directory tree to find a config file:

```
/opt/apps/my-project/src/utils/
  ↓ (walks up)
/opt/apps/my-project/src/
  ↓
/opt/apps/my-project/veil.config.ts  ← Found! Uses this config
```

Supported config files (in order):
1. `veil.config.ts`
2. `veil.config.js`
3. `veil.config.mjs`
4. `.veilrc.ts`
5. `.veilrc.js`
6. `.veilrc.json`

