import esbuild from "esbuild";
import { mkdir, readdir, rm } from "node:fs/promises";
import { builtinModules } from "node:module";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";

const outdir = ".tmp/tests";

await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });

const testFiles = (await readdir("tests"))
	.filter((file) => file.endsWith(".test.ts"))
	.map((file) => path.join("tests", file));

await esbuild.build({
	entryPoints: testFiles,
	bundle: true,
	format: "esm",
	platform: "node",
	target: "node18",
	outdir,
	external: [
		"obsidian",
		"electron",
		...builtinModules,
		...builtinModules.map((moduleName) => `node:${moduleName}`),
	],
});

const runner = spawn(
	process.execPath,
	["--test", ...(await readdir(outdir)).map((file) => path.join(outdir, file))],
	{ stdio: "inherit" },
);

runner.on("exit", (code) => {
	process.exit(code ?? 1);
});
