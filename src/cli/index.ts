#!/usr/bin/env node
import { Command } from "commander";
import { version } from "../../package.json";

const program = new Command();

program.name("veil").description("Veil: LLM visibility firewall CLI").version(version);

program
	.command("init")
	.description("Scaffold a .veilrc.json config file")
	.action((): void => {
		// TODO: Interactive config scaffolding
		console.log("Scaffolding .veilrc.json (not yet implemented)");
	});

program
	.command("check <target>")
	.description("Check if a file, env var, or command would be allowed/blocked")
	.action((target: string): void => {
		// TODO: Check logic
		console.log(`Checking: ${target} (not yet implemented)`);
	});

program
	.command("scan")
	.description("Scan project for sensitive files, envs, or dangerous commands")
	.action((): void => {
		// TODO: Scan logic
		console.log("Scanning project (not yet implemented)");
	});

program
	.command("add-rule")
	.description("Add a rule to .veilrc.json interactively or via flags")
	.action((): void => {
		// TODO: Interactive rule addition
		console.log("Add rule (not yet implemented)");
	});

export function run(): void {
	program.parse(process.argv);
}

// Always run the CLI if this file is executed directly
run();
