# Veil Presets & Rules

Pre-configured rule sets and ESLint-style rules system.

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
