import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
	eslint.configs.recommended,
	...tseslint.configs.strictTypeChecked,
	...tseslint.configs.stylisticTypeChecked,
	{
		languageOptions: {
			parserOptions: {
				projectService: {
					allowDefaultProject: ["src/*.test.ts"],
				},
				tsconfigRootDir: import.meta.dirname,
			},
		},
	},
	{
		files: ["**/*.ts"],
		rules: {
			// Enforce explicit return types on functions
			"@typescript-eslint/explicit-function-return-type": "error",
			// Enforce explicit accessibility modifiers
			"@typescript-eslint/explicit-member-accessibility": "off",
			// Require explicit types on exported functions
			"@typescript-eslint/explicit-module-boundary-types": "error",
			// No any types
			"@typescript-eslint/no-explicit-any": "error",
			// No unused variables
			"@typescript-eslint/no-unused-vars": [
				"error",
				{ argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
			],
			// Prefer nullish coalescing
			"@typescript-eslint/prefer-nullish-coalescing": "error",
			// Prefer optional chaining
			"@typescript-eslint/prefer-optional-chain": "error",
			// Strict boolean expressions
			"@typescript-eslint/strict-boolean-expressions": "off",
			// No floating promises
			"@typescript-eslint/no-floating-promises": "error",
			// No misused promises
			"@typescript-eslint/no-misused-promises": "error",
			// Consistent type imports
			"@typescript-eslint/consistent-type-imports": [
				"error",
				{ prefer: "type-imports" },
			],
			// No non-null assertion
			"@typescript-eslint/no-non-null-assertion": "warn",
			// Allow template literals with numbers
			"@typescript-eslint/restrict-template-expressions": [
				"error",
				{ allowNumber: true },
			],
			// Allow empty interfaces that extend
			"@typescript-eslint/no-empty-object-type": [
				"error",
				{ allowInterfaces: "with-single-extends" },
			],
		},
	},
	{
		// Relaxed rules for test files
		files: ["**/*.test.ts"],
		rules: {
			"@typescript-eslint/explicit-function-return-type": "off",
			"@typescript-eslint/explicit-module-boundary-types": "off",
			"@typescript-eslint/no-explicit-any": "off",
			"@typescript-eslint/no-unsafe-assignment": "off",
			"@typescript-eslint/no-unsafe-member-access": "off",
			"@typescript-eslint/no-unsafe-call": "off",
			"@typescript-eslint/no-unsafe-return": "off",
			"@typescript-eslint/unbound-method": "off",
		},
	},
	{
		ignores: ["dist/**", "node_modules/**", "coverage/**", "*.config.js", "*.config.ts"],
	}
);
