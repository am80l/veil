import { defineConfig } from "tsup";

export default defineConfig({
	entry: [
		"src/index.ts",
		"src/cli/index.ts",
		"src/cli/wrap.ts",
		"src/mcp/index.ts",
		"src/mcp/http-server.ts",
	],
	format: ["cjs", "esm"],
	dts: true,
	sourcemap: true,
	clean: true,
	minify: false,
	splitting: false,
	outDir: "dist",
});
