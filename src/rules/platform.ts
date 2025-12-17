/**
 * Platform-Specific Rules
 *
 * Rules tailored for Windows, macOS, and Linux
 */

import { registerRules, setPlatformRegistrar } from "./registry";
import type { VeilRule } from "./types";

// ============================================================================
// Windows Rules
// ============================================================================

export const windowsRules: VeilRule[] = [
	// Filesystem - Destructive
	{
		id: "win/no-delete-system32",
		description: "Prevent deletion of System32 directory",
		category: "destructive",
		platforms: ["windows"],
		defaultSeverity: "error",
		cliRules: [
			{
				match: /del.*\\Windows\\System32/i,
				action: "deny",
				reason: "Cannot delete System32",
				safeAlternatives: ["Use Windows Settings to uninstall programs"],
			},
			{
				match: /rmdir.*\\Windows\\System32/i,
				action: "deny",
				reason: "Cannot delete System32",
			},
			{
				match: /rd\s+\/s.*\\Windows\\System32/i,
				action: "deny",
				reason: "Cannot delete System32",
			},
		],
	},
	{
		id: "win/no-delete-windows",
		description: "Prevent deletion of Windows directory",
		category: "destructive",
		platforms: ["windows"],
		defaultSeverity: "error",
		cliRules: [
			{
				match: /del.*C:\\Windows/i,
				action: "deny",
				reason: "Cannot delete Windows directory",
			},
			{
				match: /rmdir.*C:\\Windows/i,
				action: "deny",
				reason: "Cannot delete Windows directory",
			},
		],
	},
	{
		id: "win/no-delete-program-files",
		description: "Prevent recursive deletion of Program Files",
		category: "destructive",
		platforms: ["windows"],
		defaultSeverity: "error",
		cliRules: [
			{
				match: /del\s+\/s.*Program Files/i,
				action: "deny",
				reason: "Cannot recursively delete Program Files",
				safeAlternatives: ["Use Windows Settings to uninstall programs"],
			},
			{
				match: /rd\s+\/s.*Program Files/i,
				action: "deny",
				reason: "Cannot recursively delete Program Files",
			},
		],
	},
	{
		id: "win/no-format-drive",
		description: "Prevent formatting drives",
		category: "destructive",
		platforms: ["windows"],
		defaultSeverity: "error",
		cliRules: [
			{
				match: /format\s+[A-Z]:/i,
				action: "deny",
				reason: "Cannot format drives",
			},
		],
	},
	{
		id: "win/no-delete-above-cwd",
		description: "Prevent deletion outside current working directory",
		category: "destructive",
		platforms: ["windows"],
		defaultSeverity: "warn",
		cliRules: [
			{
				match: /del.*\.\.\\/i,
				action: "deny",
				reason: "Cannot delete files above current directory",
				safeAlternatives: ["Navigate to target directory first"],
			},
			{
				match: /rmdir.*\.\.\\/i,
				action: "deny",
				reason: "Cannot delete directories above current directory",
			},
		],
	},

	// Registry
	{
		id: "win/no-modify-registry",
		description: "Prevent registry modifications",
		category: "system",
		platforms: ["windows"],
		defaultSeverity: "warn",
		cliRules: [
			{
				match: /reg\s+(add|delete|import)/i,
				action: "deny",
				reason: "Registry modifications blocked",
				safeAlternatives: ["Use Windows Settings or proper installers"],
			},
		],
	},

	// Sensitive Files
	{
		id: "win/hide-ntuser",
		description: "Hide NTUSER.DAT user profile",
		category: "privacy",
		platforms: ["windows"],
		defaultSeverity: "error",
		fileRules: [
			{
				match: /NTUSER\.DAT/i,
				action: "deny",
				reason: "User profile contains sensitive data",
			},
		],
	},
	{
		id: "win/hide-sam",
		description: "Hide SAM (Security Account Manager)",
		category: "security",
		platforms: ["windows"],
		defaultSeverity: "error",
		fileRules: [
			{
				match: /\\Windows\\System32\\config\\SAM/i,
				action: "deny",
				reason: "Contains password hashes",
			},
		],
	},

	// Credentials
	{
		id: "win/hide-credential-manager",
		description: "Hide Windows Credential Manager files",
		category: "credentials",
		platforms: ["windows"],
		defaultSeverity: "error",
		fileRules: [
			{
				match: /\\Microsoft\\Credentials/i,
				action: "deny",
				reason: "Windows Credential Manager",
			},
			{
				match: /\\Microsoft\\Protect/i,
				action: "deny",
				reason: "DPAPI master keys",
			},
		],
	},
];

// ============================================================================
// macOS Rules
// ============================================================================

export const darwinRules: VeilRule[] = [
	// Filesystem - Destructive
	{
		id: "darwin/no-delete-system",
		description: "Prevent deletion of /System directory",
		category: "destructive",
		platforms: ["darwin"],
		defaultSeverity: "error",
		cliRules: [
			{
				match: /rm\s+-rf?\s+\/System/,
				action: "deny",
				reason: "Cannot delete System directory",
			},
			{
				match: /sudo\s+rm.*\/System/,
				action: "deny",
				reason: "Cannot delete System directory",
			},
		],
	},
	{
		id: "darwin/no-delete-library",
		description: "Prevent deletion of /Library",
		category: "destructive",
		platforms: ["darwin"],
		defaultSeverity: "error",
		cliRules: [
			{
				match: /rm\s+-rf?\s+\/Library/,
				action: "deny",
				reason: "Cannot delete Library directory",
			},
		],
	},
	{
		id: "darwin/no-delete-applications",
		description: "Prevent recursive deletion of Applications",
		category: "destructive",
		platforms: ["darwin"],
		defaultSeverity: "warn",
		cliRules: [
			{
				match: /rm\s+-rf?\s+\/Applications/,
				action: "deny",
				reason: "Cannot recursively delete Applications",
				safeAlternatives: ["Drag individual apps to Trash"],
			},
		],
	},
	{
		id: "darwin/no-delete-above-cwd",
		description: "Prevent rm -rf going above current directory",
		category: "destructive",
		platforms: ["darwin"],
		defaultSeverity: "warn",
		cliRules: [
			{
				match: /rm\s+-rf?\s+\.\.\//,
				action: "deny",
				reason: "Cannot delete above current directory",
				safeAlternatives: ["cd to parent directory first"],
			},
		],
	},

	// Keychain & Credentials
	{
		id: "darwin/hide-keychain",
		description: "Hide Keychain files",
		category: "credentials",
		platforms: ["darwin"],
		defaultSeverity: "error",
		fileRules: [
			{
				match: /\.keychain(-db)?$/,
				action: "deny",
				reason: "Keychain contains passwords",
			},
			{
				match: /\/Keychains\//,
				action: "deny",
				reason: "Keychain directory",
			},
		],
	},
	{
		id: "darwin/no-security-dump",
		description: "Prevent dumping keychain via security command",
		category: "credentials",
		platforms: ["darwin"],
		defaultSeverity: "error",
		cliRules: [
			{
				match: /security\s+(dump-keychain|find-.*-password)/,
				action: "deny",
				reason: "Cannot dump keychain credentials",
			},
		],
	},

	// SSH & Privacy
	{
		id: "darwin/hide-ssh",
		description: "Hide SSH keys and config",
		category: "credentials",
		platforms: ["darwin"],
		defaultSeverity: "error",
		fileRules: [
			{
				match: /\/\.ssh\//,
				action: "deny",
				reason: "SSH keys and config",
			},
		],
	},

	// System Integrity
	{
		id: "darwin/no-disable-sip",
		description: "Prevent disabling System Integrity Protection",
		category: "system",
		platforms: ["darwin"],
		defaultSeverity: "error",
		cliRules: [
			{
				match: /csrutil\s+disable/,
				action: "deny",
				reason: "Cannot disable SIP",
			},
		],
	},
];

// ============================================================================
// Linux Rules
// ============================================================================

export const linuxRules: VeilRule[] = [
	// Filesystem - Destructive
	{
		id: "linux/no-delete-root",
		description: "Prevent rm -rf /",
		category: "destructive",
		platforms: ["linux"],
		defaultSeverity: "error",
		cliRules: [
			{
				match: /rm\s+-rf?\s+\/\s*$/,
				action: "deny",
				reason: "Cannot delete root filesystem",
			},
			{
				match: /rm\s+--no-preserve-root/,
				action: "deny",
				reason: "Cannot bypass root protection",
			},
		],
	},
	{
		id: "linux/no-delete-boot",
		description: "Prevent deletion of /boot",
		category: "destructive",
		platforms: ["linux"],
		defaultSeverity: "error",
		cliRules: [
			{
				match: /rm\s+-rf?\s+\/boot/,
				action: "deny",
				reason: "Cannot delete boot partition",
			},
		],
	},
	{
		id: "linux/no-delete-etc",
		description: "Prevent recursive deletion of /etc",
		category: "destructive",
		platforms: ["linux"],
		defaultSeverity: "error",
		cliRules: [
			{
				match: /rm\s+-rf?\s+\/etc/,
				action: "deny",
				reason: "Cannot delete system configuration",
			},
		],
	},
	{
		id: "linux/no-delete-var",
		description: "Prevent recursive deletion of /var",
		category: "destructive",
		platforms: ["linux"],
		defaultSeverity: "warn",
		cliRules: [
			{
				match: /rm\s+-rf?\s+\/var/,
				action: "deny",
				reason: "Cannot delete /var",
			},
		],
	},
	{
		id: "linux/no-delete-above-cwd",
		description: "Prevent rm -rf going above current directory",
		category: "destructive",
		platforms: ["linux"],
		defaultSeverity: "warn",
		cliRules: [
			{
				match: /rm\s+-rf?\s+\.\.\//,
				action: "deny",
				reason: "Cannot delete above current directory",
				safeAlternatives: ["cd to parent directory first"],
			},
		],
	},
	{
		id: "linux/no-delete-home-recursive",
		description: "Prevent rm -rf on entire home directory",
		category: "destructive",
		platforms: ["linux"],
		defaultSeverity: "error",
		cliRules: [
			{
				match: /rm\s+-rf?\s+(\/home\/\w+\s*$|~\s*$)/,
				action: "deny",
				reason: "Cannot delete entire home directory",
				safeAlternatives: ["Delete specific files/folders instead"],
			},
		],
	},

	// Disk Operations
	{
		id: "linux/no-dd-to-disk",
		description: "Prevent dd writing to raw disks",
		category: "destructive",
		platforms: ["linux"],
		defaultSeverity: "error",
		cliRules: [
			{
				match: /dd.*of=\/dev\/sd[a-z]\b/,
				action: "deny",
				reason: "Cannot write directly to disk",
			},
			{
				match: /dd.*of=\/dev\/nvme/,
				action: "deny",
				reason: "Cannot write directly to NVMe",
			},
		],
	},
	{
		id: "linux/no-mkfs",
		description: "Prevent filesystem formatting",
		category: "destructive",
		platforms: ["linux"],
		defaultSeverity: "error",
		cliRules: [
			{
				match: /mkfs\./,
				action: "deny",
				reason: "Cannot format filesystems",
			},
		],
	},

	// Credentials & Security
	{
		id: "linux/hide-shadow",
		description: "Hide /etc/shadow password file",
		category: "credentials",
		platforms: ["linux"],
		defaultSeverity: "error",
		fileRules: [
			{
				match: /\/etc\/shadow/,
				action: "deny",
				reason: "Password hashes",
			},
			{
				match: /\/etc\/gshadow/,
				action: "deny",
				reason: "Group password hashes",
			},
		],
	},
	{
		id: "linux/hide-ssh",
		description: "Hide SSH keys and config",
		category: "credentials",
		platforms: ["linux"],
		defaultSeverity: "error",
		fileRules: [
			{
				match: /\/\.ssh\//,
				action: "deny",
				reason: "SSH keys and config",
			},
		],
	},
	{
		id: "linux/hide-gnupg",
		description: "Hide GnuPG directory",
		category: "credentials",
		platforms: ["linux"],
		defaultSeverity: "error",
		fileRules: [
			{
				match: /\/\.gnupg\//,
				action: "deny",
				reason: "GPG keys",
			},
		],
	},

	// System
	{
		id: "linux/no-fork-bomb",
		description: "Prevent fork bomb execution",
		category: "system",
		platforms: ["linux"],
		defaultSeverity: "error",
		cliRules: [
			{
				match: /:()\s*{\s*:\s*\|\s*:\s*&\s*}\s*;?\s*:/,
				action: "deny",
				reason: "Fork bomb detected",
			},
		],
	},
	{
		id: "linux/no-chmod-777-recursive",
		description: "Prevent recursive chmod 777",
		category: "security",
		platforms: ["linux"],
		defaultSeverity: "warn",
		cliRules: [
			{
				match: /chmod\s+-R\s+777/,
				action: "deny",
				reason: "Insecure recursive permissions",
				safeAlternatives: ["chmod 755 for directories", "chmod 644 for files"],
			},
		],
	},
];

// ============================================================================
// Cross-Platform Rules
// ============================================================================

export const crossPlatformRules: VeilRule[] = [
	// Credentials - Environment
	{
		id: "env/mask-aws",
		description: "Mask AWS credentials in environment",
		category: "credentials",
		platforms: ["all"],
		defaultSeverity: "error",
		envRules: [{ match: /^AWS_/, action: "mask", reason: "AWS credentials" }],
	},
	{
		id: "env/mask-azure",
		description: "Mask Azure credentials in environment",
		category: "credentials",
		platforms: ["all"],
		defaultSeverity: "error",
		envRules: [{ match: /^AZURE_/, action: "mask", reason: "Azure credentials" }],
	},
	{
		id: "env/mask-gcp",
		description: "Mask Google Cloud credentials in environment",
		category: "credentials",
		platforms: ["all"],
		defaultSeverity: "error",
		envRules: [{ match: /^GCP_|^GOOGLE_/, action: "mask", reason: "GCP credentials" }],
	},
	{
		id: "env/deny-passwords",
		description: "Deny access to password environment variables",
		category: "credentials",
		platforms: ["all"],
		defaultSeverity: "error",
		envRules: [{ match: /PASSWORD/i, action: "deny", reason: "Password variable" }],
	},
	{
		id: "env/mask-tokens",
		description: "Mask token environment variables",
		category: "credentials",
		platforms: ["all"],
		defaultSeverity: "error",
		envRules: [
			{ match: /TOKEN/i, action: "mask", reason: "Token variable" },
			{ match: /API_KEY/i, action: "mask", reason: "API key variable" },
		],
	},
	{
		id: "env/mask-secrets",
		description: "Mask secret environment variables",
		category: "credentials",
		platforms: ["all"],
		defaultSeverity: "error",
		envRules: [{ match: /SECRET/i, action: "mask", reason: "Secret variable" }],
	},
	{
		id: "env/deny-database-urls",
		description: "Deny access to database connection strings",
		category: "credentials",
		platforms: ["all"],
		defaultSeverity: "error",
		envRules: [
			{ match: /DATABASE_URL/i, action: "deny", reason: "Database URL" },
			{ match: /MONGODB_URI/i, action: "deny", reason: "MongoDB URI" },
			{ match: /REDIS_URL/i, action: "deny", reason: "Redis URL" },
			{ match: /POSTGRES_URL/i, action: "deny", reason: "Postgres URL" },
		],
	},

	// Files - Sensitive
	{
		id: "fs/hide-env-files",
		description: "Hide .env files",
		category: "credentials",
		platforms: ["all"],
		defaultSeverity: "error",
		fileRules: [{ match: /\.env($|\.)/, action: "deny", reason: "Environment file" }],
	},
	{
		id: "fs/hide-private-keys",
		description: "Hide private key files",
		category: "credentials",
		platforms: ["all"],
		defaultSeverity: "error",
		fileRules: [
			{ match: /\.pem$/, action: "deny", reason: "PEM private key" },
			{ match: /\.key$/, action: "deny", reason: "Private key" },
			{ match: /id_rsa$/, action: "deny", reason: "RSA private key" },
			{ match: /id_ed25519$/, action: "deny", reason: "Ed25519 private key" },
		],
	},
	{
		id: "fs/hide-docker-config",
		description: "Hide Docker config with credentials",
		category: "credentials",
		platforms: ["all"],
		defaultSeverity: "error",
		fileRules: [{ match: /\.docker\/config\.json/, action: "deny", reason: "Docker credentials" }],
	},
	{
		id: "fs/hide-npm-config",
		description: "Hide npm config with tokens",
		category: "credentials",
		platforms: ["all"],
		defaultSeverity: "error",
		fileRules: [{ match: /\.npmrc$/, action: "deny", reason: "NPM config with tokens" }],
	},
	{
		id: "fs/hide-git-credentials",
		description: "Hide Git credential files",
		category: "credentials",
		platforms: ["all"],
		defaultSeverity: "error",
		fileRules: [
			{ match: /\.git-credentials$/, action: "deny", reason: "Git credentials" },
			{ match: /\.netrc$/, action: "deny", reason: "Netrc credentials" },
		],
	},

	// Files - Large/Noise
	{
		id: "fs/hide-node-modules",
		description: "Hide node_modules directory",
		category: "filesystem",
		platforms: ["all"],
		defaultSeverity: "warn",
		fileRules: [{ match: "node_modules", action: "deny", reason: "Dependencies too large" }],
	},
	{
		id: "fs/hide-vcs",
		description: "Hide version control directories",
		category: "filesystem",
		platforms: ["all"],
		defaultSeverity: "warn",
		fileRules: [
			{ match: ".git", action: "deny", reason: "Git internals" },
			{ match: ".svn", action: "deny", reason: "SVN internals" },
			{ match: ".hg", action: "deny", reason: "Mercurial internals" },
		],
	},
	{
		id: "fs/hide-build-output",
		description: "Hide build output directories",
		category: "filesystem",
		platforms: ["all"],
		defaultSeverity: "warn",
		fileRules: [
			{ match: "dist", action: "deny", reason: "Build output" },
			{ match: "build", action: "deny", reason: "Build output" },
			{ match: ".next", action: "deny", reason: "Next.js cache" },
			{ match: ".nuxt", action: "deny", reason: "Nuxt cache" },
		],
	},

	// CLI - Dangerous
	{
		id: "cli/no-curl-pipe-bash",
		description: "Prevent piping curl to bash",
		category: "security",
		platforms: ["all"],
		defaultSeverity: "error",
		cliRules: [
			{
				match: /curl.*\|\s*(ba)?sh/,
				action: "deny",
				reason: "Piping curl to shell",
				safeAlternatives: ["Download script first, review, then run"],
			},
		],
	},
	{
		id: "cli/no-wget-pipe-bash",
		description: "Prevent piping wget to bash",
		category: "security",
		platforms: ["all"],
		defaultSeverity: "error",
		cliRules: [
			{
				match: /wget.*-O\s*-.*\|\s*(ba)?sh/,
				action: "deny",
				reason: "Piping wget to shell",
			},
		],
	},
	{
		id: "cli/no-credential-echo",
		description: "Prevent echoing credentials",
		category: "credentials",
		platforms: ["all"],
		defaultSeverity: "error",
		cliRules: [
			{
				match: /echo.*\$\{?(PASSWORD|SECRET|TOKEN|API_KEY)/i,
				action: "deny",
				reason: "Echoing sensitive variable",
			},
		],
	},
	{
		id: "cli/no-curl-with-password",
		description: "Prevent curl with inline credentials",
		category: "credentials",
		platforms: ["all"],
		defaultSeverity: "error",
		cliRules: [
			{
				match: /curl.*(-u|--user)\s+\S+:\S+/,
				action: "deny",
				reason: "Curl with inline credentials",
				safeAlternatives: ["Use .netrc or environment variables"],
			},
			{
				match: /curl.*password=/i,
				action: "deny",
				reason: "Password in URL",
			},
		],
	},
];

// ============================================================================
// Register all platform rules
// ============================================================================

export function registerPlatformRules(): void {
	registerRules(windowsRules);
	registerRules(darwinRules);
	registerRules(linuxRules);
	registerRules(crossPlatformRules);
}

// Auto-register when module loads
setPlatformRegistrar(registerPlatformRules);
