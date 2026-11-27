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
  for (const kind of ["root", "resource", "endpoint", "environment"]) {
    assert(
      files.includes(`dist/schemas/${kind}.schema.json`),
      "configuration schema was not packed",
    );
  }

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
  writeFileSync(
    join(cwd, "frontspan.config.json"),
    JSON.stringify({
      schemaVersion: 1,
      project: { name: "synthetic-consumer" },
    }),
  );
  const consumer = `
    import assert from "node:assert/strict";
    import * as core from "@frontspan/core";
    import { loadConfig } from "@frontspan/core/config";
    import schema from "@frontspan/core/schemas/root.schema.json" with { type: "json" };
    assert.deepEqual(Object.keys(core), []);
    assert.equal(schema.properties.schemaVersion.const, 1);
    const result = await loadConfig(".");
    assert.equal(result.ok, true);
    assert.equal(result.config.root.value.project.name, "synthetic-consumer");
  `;
  execFileSync(process.execPath, ["--input-type=module", "--eval", consumer], {
    cwd,
    stdio: "inherit",
  });
  console.log(`Packed ESM consumer smoke passed on Node ${process.version}`);
} finally {
  rmSync(cwd, { recursive: true, force: true });
}
