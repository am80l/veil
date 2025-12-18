import { describe, expect, it } from "vitest";
import { describeNormalization, isWrappedCommand, normalizeCommand } from "./normalize";

describe("normalizeCommand", () => {
	describe("shell wrapper unwrapping", () => {
		it("unwraps bash -c with double quotes", () => {
			const variants = normalizeCommand('bash -c "git push origin main"');
			expect(variants).toContain("git push origin main");
		});

		it("unwraps bash -c with single quotes", () => {
			const variants = normalizeCommand("bash -c 'git push origin main'");
			expect(variants).toContain("git push origin main");
		});

		it("unwraps sh -c", () => {
			const variants = normalizeCommand('sh -c "rm -rf /"');
			expect(variants).toContain("rm -rf /");
		});

		it("unwraps zsh -c", () => {
			const variants = normalizeCommand('zsh -c "wrangler deploy"');
			expect(variants).toContain("wrangler deploy");
		});

		it("unwraps dash -c", () => {
			const variants = normalizeCommand('dash -c "dangerous command"');
			expect(variants).toContain("dangerous command");
		});

		it("handles shell with additional flags", () => {
			const variants = normalizeCommand('bash -x -c "git push"');
			expect(variants).toContain("git push");
		});

		it("unwraps nested shells recursively", () => {
			const variants = normalizeCommand("bash -c \"sh -c 'git push'\"");
			expect(variants).toContain("git push");
		});

		it("preserves original command as first variant", () => {
			const variants = normalizeCommand('bash -c "git push"');
			expect(variants[0]).toBe('bash -c "git push"');
		});
	});

	describe("eval unwrapping", () => {
		it("unwraps eval with double quotes", () => {
			const variants = normalizeCommand('eval "git push"');
			expect(variants).toContain("git push");
		});

		it("unwraps eval with single quotes", () => {
			const variants = normalizeCommand("eval 'git push'");
			expect(variants).toContain("git push");
		});

		it("unwraps eval without quotes", () => {
			const variants = normalizeCommand("eval git push");
			expect(variants).toContain("git push");
		});
	});

	describe("absolute path stripping", () => {
		it("strips /usr/bin/ prefix", () => {
			const variants = normalizeCommand("/usr/bin/git push origin main");
			expect(variants).toContain("git push origin main");
		});

		it("strips /bin/ prefix", () => {
			const variants = normalizeCommand("/bin/rm -rf /");
			expect(variants).toContain("rm -rf /");
		});

		it("strips /usr/local/bin/ prefix", () => {
			const variants = normalizeCommand("/usr/local/bin/wrangler deploy");
			expect(variants).toContain("wrangler deploy");
		});

		it("strips complex paths", () => {
			const variants = normalizeCommand("/opt/homebrew/bin/git push");
			expect(variants).toContain("git push");
		});
	});

	describe("package runner stripping", () => {
		it("strips npx prefix", () => {
			const variants = normalizeCommand("npx wrangler deploy");
			expect(variants).toContain("wrangler deploy");
		});

		it("strips pnpx prefix", () => {
			const variants = normalizeCommand("pnpx prisma migrate");
			expect(variants).toContain("prisma migrate");
		});

		it("strips yarn dlx prefix", () => {
			const variants = normalizeCommand("yarn dlx create-react-app");
			expect(variants).toContain("create-react-app");
		});

		it("strips bunx prefix", () => {
			const variants = normalizeCommand("bunx esbuild src/index.ts");
			expect(variants).toContain("esbuild src/index.ts");
		});
	});

	describe("combined normalizations", () => {
		it("handles shell + absolute path", () => {
			const variants = normalizeCommand('bash -c "/usr/bin/git push"');
			expect(variants).toContain("git push");
		});

		it("handles absolute path + npx", () => {
			const variants = normalizeCommand("/usr/bin/npx wrangler deploy");
			// After stripping path: npx wrangler deploy
			// After stripping npx: wrangler deploy
			expect(variants).toContain("wrangler deploy");
		});

		it("handles all normalizations together", () => {
			const variants = normalizeCommand('bash -c "/usr/bin/npx wrangler deploy"');
			expect(variants).toContain("wrangler deploy");
		});
	});

	describe("options", () => {
		it("respects stripPaths: false", () => {
			const variants = normalizeCommand("/usr/bin/git push", { stripPaths: false });
			expect(variants).not.toContain("git push");
			expect(variants).toContain("/usr/bin/git push");
		});

		it("respects unwrapShells: false", () => {
			const variants = normalizeCommand('bash -c "git push"', { unwrapShells: false });
			expect(variants).not.toContain("git push");
		});

		it("respects unwrapEval: false", () => {
			const variants = normalizeCommand('eval "git push"', { unwrapEval: false });
			expect(variants).not.toContain("git push");
		});

		it("respects stripPackageRunners: false", () => {
			const variants = normalizeCommand("npx wrangler deploy", { stripPackageRunners: false });
			expect(variants).not.toContain("wrangler deploy");
		});
	});

	describe("edge cases", () => {
		it("handles empty command", () => {
			const variants = normalizeCommand("");
			expect(variants).toEqual([]);
		});

		it("handles whitespace-only command", () => {
			const variants = normalizeCommand("   ");
			expect(variants).toEqual([]);
		});

		it("trims whitespace", () => {
			const variants = normalizeCommand("  git push  ");
			expect(variants[0]).toBe("git push");
		});

		it("returns unique variants only", () => {
			const variants = normalizeCommand("git push");
			expect(variants).toEqual(["git push"]);
		});

		it("doesn't modify safe commands", () => {
			const variants = normalizeCommand("git status");
			expect(variants).toEqual(["git status"]);
		});
	});
});

describe("isWrappedCommand", () => {
	it("detects shell wrappers", () => {
		expect(isWrappedCommand('bash -c "git push"')).toBe(true);
		expect(isWrappedCommand('sh -c "command"')).toBe(true);
		expect(isWrappedCommand("zsh -c 'command'")).toBe(true);
	});

	it("detects eval wrappers", () => {
		expect(isWrappedCommand('eval "git push"')).toBe(true);
		expect(isWrappedCommand("eval git push")).toBe(true);
	});

	it("detects absolute paths", () => {
		expect(isWrappedCommand("/usr/bin/git push")).toBe(true);
		expect(isWrappedCommand("/bin/rm -rf")).toBe(true);
	});

	it("returns false for normal commands", () => {
		expect(isWrappedCommand("git push")).toBe(false);
		expect(isWrappedCommand("npm run build")).toBe(false);
	});
});

describe("describeNormalization", () => {
	it("returns null when no normalization applied", () => {
		expect(describeNormalization("git push", "git push")).toBeNull();
	});

	it("describes shell wrapper stripping", () => {
		const desc = describeNormalization('bash -c "git push"', "git push");
		expect(desc).toContain("subshell wrapper stripped");
	});

	it("describes eval wrapper stripping", () => {
		const desc = describeNormalization('eval "git push"', "git push");
		expect(desc).toContain("eval wrapper stripped");
	});

	it("describes absolute path stripping", () => {
		const desc = describeNormalization("/usr/bin/git push", "git push");
		expect(desc).toContain("absolute path stripped");
	});

	it("describes package runner stripping", () => {
		const desc = describeNormalization("npx wrangler deploy", "wrangler deploy");
		expect(desc).toContain("package runner stripped");
	});
});
