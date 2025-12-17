# Plugins & Audit System

Extend Veil with plugins and comprehensive audit trails.

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
