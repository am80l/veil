# **📄 Product Requirements Document (PRD): Veil**
**A TypeScript Library for Selective Context Access, Visibility Control & Safety Enforcement for LLMs**

---

## **1. Overview**
**Veil** is a TypeScript library that acts as a *visibility firewall* between an LLM and a project's filesystem, environment variables, and command interfaces.

Veil enables developers to:

1. **Hide** files, directories, environment variables, or CLI commands from LLMs.
2. **Rewrite / intercept** LLM‑initiated tool calls before execution.
3. **Inject synthetic, curated context** in place of sensitive real data.
4. **Define global and per-request policies** that determine what the LLM can perceive or operate on.
5. **Provide LLMs with a *narrow*, controlled, intentionally-curated worldview** during tool use.

Primary use cases:
- Privacy‑preserving development environments  
- Guardrails for autonomous agents  
- Monorepos with overwhelming directories  
- Secure CI/CD copilots  
- Tools like Copilot / Cursor / Codeium integrations

---

## **2. Product Goals**

### **2.1 Functional Goals**
| Goal                                              | Description                                                                                  |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **G1: Hide Sensitive Context**                    | Prevent LLMs from listing, opening, or referencing blacklisted directories/files.            |
| **G2: Control Environment Variable Access**       | Mask, intercept, or preprocess access to sensitive variables (e.g., `CLOUDFLARE_API_TOKEN`). |
| **G3: Intercept Tool Calls**                      | Modify, block, or transform LLM tool calls (CLI/MCP/custom).                                 |
| **G4: Provide Synthetic or Curated Replacements** | Allow the developer to specify “fake” or alternate data the LLM sees instead.                |
| **G5: Policy Layers**                             | Global, per‑session, and per‑call policies with cascading priorities.                        |
| **G6: LLM‑Friendly Determinism**                  | All responses are structured, deterministic, and traceable.                                  |
| **G7: Zero-Hallucination Guardrails**             | Veil provides structured explanations when blocking access.                                  |

---

## **3. Non-Functional Goals**

### **3.1 LLM Execution Optimization**
Veil must produce:
- Strict JSON-compatible structures  
- Deterministic outputs  
- Clear "why" explanations  
- Idempotent decisions  
- No ambiguous partial leaks  

### **3.2 Developer Experience**
- Clean, typed API  
- Easy config management  
- Minimal learning curve  
- CLI + programmatic interfaces  

---

## **4. Core Concepts**

### **4.1 Visibility Rules**
```ts
type VisibilityRule = {
  match: string | RegExp;
  action: "allow" | "deny" | "mask" | "rewrite";
  replacement?: string;
  reason?: string;
}
```

### **4.2 Policy Layers**
Priority order:

1. Per‑call  
2. Per‑session  
3. Global  

### **4.3 Veil Context Object**
This is what the LLM sees instead of real system state:

```ts
type VeilContext = {
  visibleFiles: string[];
  visibleDirectories: string[];
  visibleEnv: Record<string, string>;
  interceptedCalls: InterceptRecord[];
}
```

---

# **5. Feature Specifications**

---

## **5.1 File & Directory Visibility Control**

**Requirement F1:** LLMs must not be able to  
- list hidden directories  
- infer hidden paths  
- access their contents  
- escape visibility constraints  

Blocked response format:

```json
{
  "ok": false,
  "blocked": true,
  "reason": "directory_hidden_by_policy",
  "details": {
    "path": "/secret/env",
    "policy": "fileRules[2]"
  }
}
```

---

## **5.2 Environment Variable Guarding**

### Supported actions:
| Action      | Behavior                                 |
| ----------- | ---------------------------------------- |
| **mask**    | Return placeholder instead of real value |
| **deny**    | Block access entirely                    |
| **rewrite** | Provide synthetic version                |
| **allow**   | Pass through                             |

Example rules:

```ts
envRules: [
  { match: /^CLOUDFLARE_/, action: "mask" },
  { match: "DATABASE_URL", action: "deny" }
]
```

---

## **5.3 CLI / Tool Call Interception**

Veil must intercept and optionally transform LLM-run commands.

Examples:

```ts
cliRules: [
  { match: "rm -rf", action: "deny" },
  { match: /^docker build/, action: "rewrite", replacement: "echo '[blocked]'" }
]
```

Blocked command structure:

```json
{
  "ok": false,
  "blocked": true,
  "type": "cli",
  "reason": "dangerous_command",
  "safeAlternatives": ["ls", "du -sh ."]
}
```

---

## **5.4 Curated Context Injection**

Veil can return synthetic summaries:

```json
{
  "synthetic": true,
  "origin": "veil:rewrite",
  "value": "src/apps/* collapsed into a summary of 54 projects"
}
```

Used for:
- monorepo compression  
- hiding sensitive structure  
- giving stable views of ephemeral systems  

---

# **6. API Design**

### **Create a Veil instance**
```ts
const veil = createVeil({
  fileRules: [...],
  envRules: [...],
  cliRules: [...],
  injectors: {...}
});
```

### **Guard an operation**
```ts
await veil.guard(() => {
  return runLLMOperation();
});
```

Within `guard()`:
- filesystem is proxied  
- env access is filtered  
- commands are intercepted  

---

# **7. Example Configuration**

```ts
const veil = createVeil({
  fileRules: [
    { match: "infra/build", action: "deny" },
    { match: /secrets/, action: "deny" },
    { match: "node_modules", action: "mask", replacement: "hidden_for_context" }
  ],
  envRules: [
    { match: /^AWS_/, action: "mask" },
    { match: "CLOUDFLARE_API_TOKEN", action: "deny" }
  ],
  cliRules: [
    { match: /^rm -rf/, action: "deny" },
    { match: /^docker build/, action: "rewrite", replacement: "echo '[blocked]'" }
  ]
});
```

---

# **8. Success Metrics**

| Metric                                | Target          |
| ------------------------------------- | --------------- |
| Sensitive data leakage                | **0%**          |
| Hallucination about hidden structures | **<1%**         |
| Integration time                      | **<10 minutes** |
| Developer satisfaction                | **9/10+**       |

---

# **9. Out of Scope (v1)**

- UI dashboards  
- Persistent audit logs  
- Role-based permissioning  
- Multi-agent differential context  

---

# **10. Future Enhancements**

1. Stealth mode (LLM never knows anything was hidden)  
2. LLM auto-suggested policy generation  
3. Vector-summarized directory embeddings  
4. Dynamic, task-based policy switching  
5. Interactive preview mode for debugging  

---

# **END OF PRD**
