# Veil CLI Reference

Complete reference for all veil CLI commands.

## Commands

### `veil init`

Create a configuration file with a preset.

```bash
veil init                      # Use recommended preset
veil init --preset strict      # Use strict preset
veil init --preset minimal     # Use minimal preset
veil init --force              # Overwrite existing config
```

**Presets:**
- `recommended` - Balanced protection (default)
- `strict` - Maximum protection
- `minimal` - Basic protection only
- `ci` - Optimized for CI/CD environments

---

### `veil install`

Add shell wrappers to intercept commands.

```bash
veil install                           # AI-only mode (default)
veil install --force                   # All terminals
veil install --commands "wrangler,npm" # Wrap multiple commands
veil install --shell ~/.bashrc         # Specify shell config
veil install --dry-run                 # Preview without changes
```

**Options:**
| Option | Description |
|--------|-------------|
| `-s, --shell <path>` | Path to shell config file |
| `-c, --commands <list>` | Comma-separated commands to wrap |
| `-f, --force` | Apply to all terminals (not just AI) |
| `--dry-run` | Preview without modifying files |

---

### `veil uninstall`

Remove shell wrappers.

```bash
veil uninstall                 # Remove from default shell config
veil uninstall --all           # Remove from all shell configs
veil uninstall --shell ~/.bashrc
veil uninstall --dry-run
```

---

### `veil check`

Check if a target would be allowed.

```bash
veil check ".env" -t file
veil check "API_KEY" -t env
veil check "rm -rf /" -t cli
```

**Options:**
| Option | Description |
|--------|-------------|
| `-t, --type <type>` | Target type: `file`, `env`, or `cli` |

---

### `veil add-rule`

Add a rule to the configuration.

```bash
veil add-rule -t cli \
  -m "^wrangler deploy" \
  -a deny \
  -r "Use CI/CD instead" \
  --alternatives "npm run deploy"
```

**Options:**
| Option | Description |
|--------|-------------|
| `-t, --type <type>` | Rule type: `file`, `env`, or `cli` |
| `-m, --match <pattern>` | Pattern to match |
| `-a, --action <action>` | Action: `allow`, `deny`, `mask`, `rewrite` |
| `-r, --reason <text>` | Reason shown when blocked |
| `--alternatives <list>` | Safe alternatives (comma-separated) |

---

### `veil scan`

Scan directory for files that would be blocked.

```bash
veil scan                      # Scan current directory
veil scan -d ./src             # Scan specific directory
veil scan --depth 5            # Set max depth
```

---

### `veil explain`

Get detailed explanation of why something is blocked.

```bash
veil explain "rm -rf /" -t cli
veil explain ".env" -t file
```

---

### `veil mcp`

Start the MCP server for IDE integration.

```bash
veil mcp                       # stdio transport (default)
veil mcp --http                # HTTP transport
veil mcp --http --port 3500    # Custom port
veil mcp --http --host 0.0.0.0 # Custom host
```

**Options:**
| Option | Description |
|--------|-------------|
| `--http` | Use HTTP transport instead of stdio |
| `--port <port>` | Port for HTTP server (default: 3500) |
| `--host <host>` | Host for HTTP server (default: 0.0.0.0) |

---

### `veil audit`

Show audit log information.

```bash
veil audit
```

*Note: Requires runtime integration with AuditManager.*

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `VEIL_ENABLED=1` | Enable veil-wrap checking |
| `VEIL_FORCE=1` | Force checking even without VEIL_ENABLED |
| `VEIL_CONFIG=<path>` | Path to config file |
