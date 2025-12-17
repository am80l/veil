/**
 * Modal Rules - Rules with Strict and Passive Modes
 *
 * These rules can operate in two modes:
 * - strict: Block access completely with a custom message
 * - passive: Allow access but inject additional context/guidance
 */

import { registerRules } from "./registry";
import type { ModalRuleOptions, RuleMode, VeilRule } from "./types";

// ============================================================================
// Cloudflare Wrangler Rules
// ============================================================================

/**
 * Default context for Wrangler in passive mode
 */
const WRANGLER_DEFAULT_CONTEXT = `
## Cloudflare Wrangler Context

**Environments:**
- \`development\` - Local development with wrangler dev
- \`staging\` - Preview deployments (*.workers.dev)
- \`production\` - Live production workers

**KV Namespaces:**
- Always use environment-specific KV bindings
- Development uses local KV simulation
- Never hardcode KV namespace IDs

**Best Practices:**
- Use \`wrangler dev\` for local testing
- Use \`--env staging\` for preview deployments
- Secrets should be set via \`wrangler secret put\`
- Never commit wrangler.toml secrets

**Common Commands:**
- \`wrangler dev\` - Start local dev server
- \`wrangler deploy\` - Deploy to production
- \`wrangler deploy --env staging\` - Deploy to staging
- \`wrangler tail\` - Stream live logs
`.trim();

/**
 * Default message for Wrangler in strict mode
 */
const WRANGLER_STRICT_MESSAGE = `
⛔ Wrangler access is blocked by policy.

This project uses Cloudflare Workers with specific deployment procedures.
Direct wrangler commands are not permitted in this context.

Please consult the deployment documentation or contact the infrastructure team.
`.trim();

export const wranglerRule: VeilRule = {
	id: "cloudflare/wrangler",
	description: "Control access to Cloudflare Wrangler CLI with context injection",
	category: "tooling",
	platforms: ["all"],
	defaultSeverity: "warn",
	supportsMode: true,
	defaultMode: "passive",
	createRules: (mode: RuleMode, options?: ModalRuleOptions) => {
		if (mode === "strict") {
			const message = options?.message ?? WRANGLER_STRICT_MESSAGE;
			return {
				cliRules: [
					{
						match: /^wrangler\s/,
						action: "deny",
						reason: message,
					},
				],
				fileRules: [
					{
						match: /wrangler\.toml$/,
						action: "deny",
						reason: message,
					},
				],
			};
		}
		// Passive mode - allow but with context injection
		// The context is meant to be injected via injectors
		return {
			cliRules: [
				{
					match: /^wrangler\s/,
					action: "allow",
					reason: options?.context ?? WRANGLER_DEFAULT_CONTEXT,
				},
			],
		};
	},
};

// ============================================================================
// Docker Rules
// ============================================================================

const DOCKER_DEFAULT_CONTEXT = `
## Docker Context

**Available Commands:**
- \`docker build\` - Build images (use multi-stage builds)
- \`docker compose up\` - Start services
- \`docker logs\` - View container logs

**Best Practices:**
- Use specific image tags, never \`latest\` in production
- Multi-stage builds for smaller images
- Don't run as root inside containers
- Use .dockerignore to exclude sensitive files

**Environment:**
- Development uses local Docker daemon
- CI/CD uses remote registry
- Production uses orchestration (K8s/ECS)
`.trim();

const DOCKER_STRICT_MESSAGE = `
⛔ Docker access is blocked by policy.

Container operations are managed by the infrastructure team.
Please use the provided development scripts instead.
`.trim();

export const dockerRule: VeilRule = {
	id: "container/docker",
	description: "Control access to Docker CLI with context injection",
	category: "tooling",
	platforms: ["all"],
	defaultSeverity: "warn",
	supportsMode: true,
	defaultMode: "passive",
	createRules: (mode: RuleMode, options?: ModalRuleOptions) => {
		if (mode === "strict") {
			const message = options?.message ?? DOCKER_STRICT_MESSAGE;
			return {
				cliRules: [
					{
						match: /^docker\s/,
						action: "deny",
						reason: message,
					},
					{
						match: /^docker-compose\s/,
						action: "deny",
						reason: message,
					},
				],
				fileRules: [
					{
						match: /Dockerfile$/,
						action: "deny",
						reason: message,
					},
					{
						match: /docker-compose\.ya?ml$/,
						action: "deny",
						reason: message,
					},
				],
			};
		}
		return {
			cliRules: [
				{
					match: /^docker\s/,
					action: "allow",
					reason: options?.context ?? DOCKER_DEFAULT_CONTEXT,
				},
			],
		};
	},
};

// ============================================================================
// Terraform Rules
// ============================================================================

const TERRAFORM_DEFAULT_CONTEXT = `
## Terraform Context

**Workspaces:**
- \`default\` - Development environment
- \`staging\` - Staging environment
- \`production\` - Production (requires approval)

**State Management:**
- State is stored in remote backend (S3/GCS)
- Never commit .tfstate files
- Use \`terraform state\` commands carefully

**Best Practices:**
- Always run \`terraform plan\` before apply
- Use modules for reusable infrastructure
- Tag all resources appropriately
- Review plan output carefully
`.trim();

const TERRAFORM_STRICT_MESSAGE = `
⛔ Terraform access is blocked by policy.

Infrastructure changes must go through the GitOps pipeline.
Please submit a PR to the infrastructure repository.
`.trim();

export const terraformRule: VeilRule = {
	id: "infra/terraform",
	description: "Control access to Terraform CLI with context injection",
	category: "tooling",
	platforms: ["all"],
	defaultSeverity: "warn",
	supportsMode: true,
	defaultMode: "passive",
	createRules: (mode: RuleMode, options?: ModalRuleOptions) => {
		if (mode === "strict") {
			const message = options?.message ?? TERRAFORM_STRICT_MESSAGE;
			return {
				cliRules: [
					{
						match: /^terraform\s/,
						action: "deny",
						reason: message,
					},
				],
				fileRules: [
					{
						match: /\.tf$/,
						action: "deny",
						reason: message,
					},
					{
						match: /\.tfvars$/,
						action: "deny",
						reason: message,
					},
				],
			};
		}
		return {
			cliRules: [
				{
					match: /^terraform\s/,
					action: "allow",
					reason: options?.context ?? TERRAFORM_DEFAULT_CONTEXT,
				},
			],
		};
	},
};

// ============================================================================
// Kubernetes Rules
// ============================================================================

const KUBECTL_DEFAULT_CONTEXT = `
## Kubernetes Context

**Clusters:**
- \`dev-cluster\` - Development
- \`staging-cluster\` - Staging
- \`prod-cluster\` - Production (read-only for most users)

**Namespaces:**
- Use namespace-scoped commands
- Default namespace varies by context

**Best Practices:**
- Use \`kubectl get\` and \`kubectl describe\` for inspection
- Avoid \`kubectl delete\` without confirmation
- Use \`--dry-run=client\` for testing
- Prefer declarative YAML over imperative commands
`.trim();

const KUBECTL_STRICT_MESSAGE = `
⛔ Kubernetes access is blocked by policy.

Cluster operations are managed via GitOps.
Please submit changes through the deployment repository.
`.trim();

export const kubectlRule: VeilRule = {
	id: "infra/kubectl",
	description: "Control access to kubectl CLI with context injection",
	category: "tooling",
	platforms: ["all"],
	defaultSeverity: "warn",
	supportsMode: true,
	defaultMode: "passive",
	createRules: (mode: RuleMode, options?: ModalRuleOptions) => {
		if (mode === "strict") {
			const message = options?.message ?? KUBECTL_STRICT_MESSAGE;
			return {
				cliRules: [
					{
						match: /^kubectl\s/,
						action: "deny",
						reason: message,
					},
				],
			};
		}
		return {
			cliRules: [
				{
					match: /^kubectl\s/,
					action: "allow",
					reason: options?.context ?? KUBECTL_DEFAULT_CONTEXT,
				},
			],
		};
	},
};

// ============================================================================
// AWS CLI Rules
// ============================================================================

const AWS_DEFAULT_CONTEXT = `
## AWS CLI Context

**Profiles:**
- \`default\` - Development account
- \`staging\` - Staging account
- \`production\` - Production (restricted)

**Regions:**
- Primary: us-east-1
- DR: us-west-2

**Best Practices:**
- Always specify --profile for clarity
- Use IAM roles over access keys
- Check current identity with \`aws sts get-caller-identity\`
- Use --dry-run where available
`.trim();

const AWS_STRICT_MESSAGE = `
⛔ AWS CLI access is blocked by policy.

AWS operations must be performed through approved automation.
Please use the provided scripts or CI/CD pipelines.
`.trim();

export const awsCliRule: VeilRule = {
	id: "cloud/aws-cli",
	description: "Control access to AWS CLI with context injection",
	category: "tooling",
	platforms: ["all"],
	defaultSeverity: "warn",
	supportsMode: true,
	defaultMode: "passive",
	createRules: (mode: RuleMode, options?: ModalRuleOptions) => {
		if (mode === "strict") {
			const message = options?.message ?? AWS_STRICT_MESSAGE;
			return {
				cliRules: [
					{
						match: /^aws\s/,
						action: "deny",
						reason: message,
					},
				],
			};
		}
		return {
			cliRules: [
				{
					match: /^aws\s/,
					action: "allow",
					reason: options?.context ?? AWS_DEFAULT_CONTEXT,
				},
			],
		};
	},
};

// ============================================================================
// npm/pnpm/yarn Rules
// ============================================================================

const NPM_DEFAULT_CONTEXT = `
## Package Manager Context

**Scripts:**
- \`npm run dev\` - Start development server
- \`npm run build\` - Production build
- \`npm run test\` - Run test suite
- \`npm run lint\` - Lint code

**Best Practices:**
- Use exact versions in production
- Check package.json scripts before running
- Use \`npm ci\` in CI environments
- Audit dependencies regularly
`.trim();

const NPM_STRICT_MESSAGE = `
⛔ Package manager access is blocked by policy.

Package installations must be reviewed.
Please add dependencies via PR.
`.trim();

export const npmRule: VeilRule = {
	id: "tooling/npm",
	description: "Control access to npm/pnpm/yarn with context injection",
	category: "tooling",
	platforms: ["all"],
	defaultSeverity: "warn",
	supportsMode: true,
	defaultMode: "passive",
	createRules: (mode: RuleMode, options?: ModalRuleOptions) => {
		if (mode === "strict") {
			const message = options?.message ?? NPM_STRICT_MESSAGE;
			return {
				cliRules: [
					{
						match: /^(npm|pnpm|yarn)\s+(install|add|remove)/,
						action: "deny",
						reason: message,
					},
				],
			};
		}
		return {
			cliRules: [
				{
					match: /^(npm|pnpm|yarn)\s/,
					action: "allow",
					reason: options?.context ?? NPM_DEFAULT_CONTEXT,
				},
			],
		};
	},
};

// ============================================================================
// Git Rules
// ============================================================================

const GIT_DEFAULT_CONTEXT = `
## Git Context

**Branches:**
- \`main\` - Production branch (protected)
- \`develop\` - Development integration
- \`feature/*\` - Feature branches

**Workflow:**
- Create feature branch from develop
- Open PR for review
- Squash merge to develop
- Release merge to main

**Best Practices:**
- Write meaningful commit messages
- Keep commits atomic
- Rebase feature branches regularly
- Never force push to protected branches
`.trim();

const GIT_STRICT_MESSAGE = `
⛔ Git push access is blocked by policy.

Please use the standard PR workflow.
`.trim();

export const gitRule: VeilRule = {
	id: "tooling/git",
	description: "Control access to git operations with context injection",
	category: "tooling",
	platforms: ["all"],
	defaultSeverity: "warn",
	supportsMode: true,
	defaultMode: "passive",
	createRules: (mode: RuleMode, options?: ModalRuleOptions) => {
		if (mode === "strict") {
			const message = options?.message ?? GIT_STRICT_MESSAGE;
			return {
				cliRules: [
					{
						match: /^git\s+push/,
						action: "deny",
						reason: message,
					},
					{
						match: /^git\s+push.*--force/,
						action: "deny",
						reason: "Force push is not allowed",
					},
				],
			};
		}
		return {
			cliRules: [
				{
					match: /^git\s/,
					action: "allow",
					reason: options?.context ?? GIT_DEFAULT_CONTEXT,
				},
			],
		};
	},
};

// ============================================================================
// All Modal Rules
// ============================================================================

export const modalRules: VeilRule[] = [
	wranglerRule,
	dockerRule,
	terraformRule,
	kubectlRule,
	awsCliRule,
	npmRule,
	gitRule,
];

/**
 * Register all modal rules
 */
export function registerModalRules(): void {
	registerRules(modalRules);
}

/**
 * Get the default context for a modal rule
 */
export function getDefaultContext(ruleId: string): string | undefined {
	const contexts: Record<string, string> = {
		"cloudflare/wrangler": WRANGLER_DEFAULT_CONTEXT,
		"container/docker": DOCKER_DEFAULT_CONTEXT,
		"infra/terraform": TERRAFORM_DEFAULT_CONTEXT,
		"infra/kubectl": KUBECTL_DEFAULT_CONTEXT,
		"cloud/aws-cli": AWS_DEFAULT_CONTEXT,
		"tooling/npm": NPM_DEFAULT_CONTEXT,
		"tooling/git": GIT_DEFAULT_CONTEXT,
	};
	return contexts[ruleId];
}

/**
 * Get the default strict message for a modal rule
 */
export function getDefaultStrictMessage(ruleId: string): string | undefined {
	const messages: Record<string, string> = {
		"cloudflare/wrangler": WRANGLER_STRICT_MESSAGE,
		"container/docker": DOCKER_STRICT_MESSAGE,
		"infra/terraform": TERRAFORM_STRICT_MESSAGE,
		"infra/kubectl": KUBECTL_STRICT_MESSAGE,
		"cloud/aws-cli": AWS_STRICT_MESSAGE,
		"tooling/npm": NPM_STRICT_MESSAGE,
		"tooling/git": GIT_STRICT_MESSAGE,
	};
	return messages[ruleId];
}
