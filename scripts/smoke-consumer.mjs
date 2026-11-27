import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import console from "node:console";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";

const core = fileURLToPath(new URL("../packages/core/", import.meta.url));
const cwd = mkdtempSync(join(tmpdir(), "frontspan-consumer-"));

try {
  const [pack] = JSON.parse(
    execFileSync(
      "npm",
      ["pack", "--ignore-scripts", "--json", "--pack-destination", cwd],
      { cwd: core, encoding: "utf8" },
    ),
  );
  const files = pack.files.map(({ path }) => path);
  assert(files.includes("dist/index.js"), "packed JS entry point is missing");
  assert(files.includes("dist/index.d.ts"), "packed declarations are missing");
  assert(!files.some((file) => file.startsWith("src/")), "source was packed");

  writeFileSync(
    join(cwd, "package.json"),
    JSON.stringify({ name: "synthetic-frontspan-consumer", private: true }),
  );
  execFileSync(
    "npm",
    [
      "install",
      "--offline",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--engine-strict",
      join(cwd, pack.filename),
    ],
    { cwd, stdio: "inherit" },
  );
  execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      'import * as core from "@frontspan/core"; if (Object.keys(core).length) throw new Error("Unexpected bootstrap exports");',
    ],
    { cwd, stdio: "inherit" },
  );
  console.log(`Packed ESM consumer smoke passed on Node ${process.version}`);
} finally {
  rmSync(cwd, { recursive: true, force: true });
}
