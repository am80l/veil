/**
 * Builder Tests
 *
 * Tests for the fluent VeilBuilder API
 */

import { describe, expect, it } from "vitest";
import { VeilBuilder, veilBuilder } from "./builder";

describe("VeilBuilder", () => {
	describe("factory function", () => {
		it("creates a new builder instance", () => {
			const builder = veilBuilder();
			expect(builder).toBeInstanceOf(VeilBuilder);
		});
	});

	describe("denyFile", () => {
		it("adds file deny rules", () => {
			const veil = veilBuilder()
				.denyFile("secrets")
				.denyFile(/\.pem$/)
				.build();

			const secretResult = veil.checkFile("/path/to/secrets/key");
			expect(secretResult.ok).toBe(false);

			const pemResult = veil.checkFile("/path/to/cert.pem");
			expect(pemResult.ok).toBe(false);

			const normalResult = veil.checkFile("/path/to/app.ts");
			expect(normalResult.ok).toBe(true);
		});
	});

	describe("denyEnv", () => {
		it("adds env deny rules", () => {
			const veil = veilBuilder().denyEnv(/^AWS_/).denyEnv("DATABASE_URL").build();

			const awsResult = veil.getEnv("AWS_SECRET_KEY");
			expect(awsResult.ok).toBe(false);

			const dbResult = veil.getEnv("DATABASE_URL");
			expect(dbResult.ok).toBe(false);
		});
	});

	describe("denyCommand", () => {
		it("adds CLI deny rules", () => {
			const veil = veilBuilder()
				.denyCommand(/^rm -rf/)
				.build();

			const result = veil.checkCommand("rm -rf /");
			expect(result.ok).toBe(false);
		});
	});

	describe("maskEnv", () => {
		it("adds env mask rules", () => {
			const veil = veilBuilder().maskEnv(/^API_/).build();

			process.env.API_KEY = "secret123";
			const result = veil.getEnv("API_KEY");
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.value).not.toBe("secret123");
				expect(result.value).toContain("*");
			}
			process.env.API_KEY = undefined;
		});
	});

	describe("allowFile", () => {
		it("adds file allow rules", () => {
			// Allow rules are checked first in order, so putting allow before deny
			// means the allow rule takes precedence
			const veil = veilBuilder()
				.allowFile("src/public") // allow src/public first
				.denyFile("src") // then deny all src
				.build();

			// This should be allowed because allow comes first
			const publicResult = veil.checkFile("src/public/index.html");
			expect(publicResult.ok).toBe(true);

			// Other src files should be denied
			const privateResult = veil.checkFile("src/private/secret.ts");
			expect(privateResult.ok).toBe(false);
		});
	});

	describe("chaining", () => {
		it("supports method chaining", () => {
			const veil = veilBuilder()
				.denyFile("secrets")
				.denyEnv(/^AWS_/)
				.denyCommand(/^rm -rf/)
				.maskEnv("API_KEY")
				.build();

			expect(veil.checkFile("secrets/api.json").ok).toBe(false);
			expect(veil.getEnv("AWS_SECRET").ok).toBe(false);
			expect(veil.checkCommand("rm -rf /").ok).toBe(false);
		});
	});

	describe("withInjectors", () => {
		it("adds custom injectors", () => {
			const veil = veilBuilder()
				.withInjectors({
					env: (key) => (key === "CUSTOM_VAR" ? "injected_value" : null),
				})
				.build();

			const result = veil.getEnv("CUSTOM_VAR");
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.value).toBe("injected_value");
			}
		});
	});
});
