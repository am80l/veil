import { describe, expect, it } from "vitest";
import { createFileEngine } from "./file-engine";
import type { FileRule } from "./types";

describe("file-engine", () => {
	describe("checkFile", () => {
		const rules: FileRule[] = [
			{ match: "node_modules", action: "deny" },
			{ match: /secrets/, action: "deny", reason: "Contains sensitive data" },
			{ match: "config/public", action: "allow" },
			{
				match: ".env.example",
				action: "rewrite",
				replacement: "# Example environment file\nAPI_KEY=your_key_here",
			},
			{ match: "masked-file", action: "mask" },
			{ match: "masked-with-replacement", action: "mask", replacement: "custom_mask" },
			{ match: "rewrite-no-replacement", action: "rewrite" },
		];

		const engine = createFileEngine(rules);

		it("allows files not matching any rule", () => {
			const result = engine.checkFile("src/index.ts");
			expect(result.ok).toBe(true);
		});

		it("blocks files matching deny rules", () => {
			const result = engine.checkFile("node_modules/react/index.js");
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.blocked).toBe(true);
				expect(result.reason).toBe("file_hidden_by_policy");
				expect(result.details.target).toBe("node_modules/react/index.js");
			}
		});

		it("blocks files matching regex deny rules", () => {
			const result = engine.checkFile("/path/to/secrets/api.json");
			expect(result.ok).toBe(false);
		});

		it("allows files explicitly allowed", () => {
			const result = engine.checkFile("config/public/settings.json");
			expect(result.ok).toBe(true);
		});

		it("returns rewritten content for rewrite rules", () => {
			const result = engine.checkFile(".env.example");
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.value).toContain("API_KEY=your_key_here");
			}
		});

		it("blocks files with mask action and default replacement", () => {
			const result = engine.checkFile("masked-file.txt");
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.blocked).toBe(true);
				expect(result.details.replacement).toBe("hidden_by_policy");
			}
		});

		it("blocks files with mask action and custom replacement", () => {
			const result = engine.checkFile("masked-with-replacement.txt");
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.details.replacement).toBe("custom_mask");
			}
		});

		it("blocks files with rewrite action but no replacement", () => {
			const result = engine.checkFile("rewrite-no-replacement.txt");
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.blocked).toBe(true);
				expect(result.details.action).toBe("rewrite");
			}
		});
	});

	describe("checkDirectory", () => {
		const rules: FileRule[] = [
			{ match: "node_modules", action: "deny" },
			{ match: ".git", action: "deny" },
			{ match: "public", action: "allow" },
			{ match: "hidden-dir", action: "mask" },
			{ match: "custom-masked-dir", action: "mask", replacement: "custom_dir_mask" },
			{ match: "rewrite-dir", action: "rewrite" },
		];

		const engine = createFileEngine(rules);

		it("allows directories not matching any rule", () => {
			const result = engine.checkDirectory("src");
			expect(result.ok).toBe(true);
		});

		it("blocks directories matching deny rules", () => {
			const result = engine.checkDirectory("node_modules");
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.reason).toBe("directory_hidden_by_policy");
			}
		});

		it("allows directories explicitly allowed", () => {
			const result = engine.checkDirectory("public");
			expect(result.ok).toBe(true);
		});

		it("blocks directories with mask action and default replacement", () => {
			const result = engine.checkDirectory("hidden-dir");
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.reason).toBe("directory_hidden_by_policy");
				expect(result.details.replacement).toBe("hidden_by_policy");
			}
		});

		it("blocks directories with mask action and custom replacement", () => {
			const result = engine.checkDirectory("custom-masked-dir");
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.details.replacement).toBe("custom_dir_mask");
			}
		});

		it("returns empty array for directories with rewrite action", () => {
			const result = engine.checkDirectory("rewrite-dir");
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.value).toEqual([]);
			}
		});
	});

	describe("filterPaths", () => {
		const rules: FileRule[] = [
			{ match: "node_modules", action: "deny" },
			{ match: /\.git/, action: "deny" },
		];

		const engine = createFileEngine(rules);

		it("filters out blocked paths", () => {
			const paths = [
				"src/index.ts",
				"node_modules/react",
				"package.json",
				".git/config",
				"README.md",
			];

			const filtered = engine.filterPaths(paths);

			expect(filtered).toEqual(["src/index.ts", "package.json", "README.md"]);
		});

		it("returns all paths when none are blocked", () => {
			const paths = ["src/index.ts", "package.json"];
			const filtered = engine.filterPaths(paths);
			expect(filtered).toEqual(paths);
		});
	});

	describe("isVisible", () => {
		const rules: FileRule[] = [
			{ match: "secret", action: "deny" },
			{ match: "public", action: "allow" },
			{ match: "masked", action: "mask" },
		];

		const engine = createFileEngine(rules);

		it("returns true for paths not matching any rule", () => {
			expect(engine.isVisible("src/index.ts")).toBe(true);
		});

		it("returns false for denied paths", () => {
			expect(engine.isVisible("secret/file.txt")).toBe(false);
		});

		it("returns true for explicitly allowed paths", () => {
			expect(engine.isVisible("public/asset.png")).toBe(true);
		});

		it("returns false for masked paths", () => {
			expect(engine.isVisible("masked/data.json")).toBe(false);
		});
	});

	describe("with injectors", () => {
		it("uses injected file content", () => {
			const engine = createFileEngine([], {
				files: (path) => {
					if (path === "virtual/config.json") {
						return '{"injected": true}';
					}
					return null;
				},
			});

			const result = engine.checkFile("virtual/config.json");
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.value).toBe('{"injected": true}');
			}
		});

		it("uses injected directory listing", () => {
			const engine = createFileEngine([], {
				directories: (path) => {
					if (path === "virtual") {
						return ["file1.ts", "file2.ts"];
					}
					return null;
				},
			});

			const result = engine.checkDirectory("virtual");
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.value).toEqual(["file1.ts", "file2.ts"]);
			}
		});

		it("falls back to rules when injector returns null", () => {
			const engine = createFileEngine(
				[{ match: "blocked", action: "deny" }],
				{
					files: () => null,
					directories: () => null,
				}
			);

			expect(engine.checkFile("blocked.txt").ok).toBe(false);
			expect(engine.checkDirectory("blocked").ok).toBe(false);
		});
	});
});
