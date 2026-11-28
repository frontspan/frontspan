import { createHash } from "node:crypto";
import {
  access,
  mkdir,
  mkdtemp,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import {
  PresetInstallError,
  readVerifiedPresets,
} from "../src/preset-install.ts";

const file = "frontspan-preset.json";
const subpath = `./${file}`;
const approved = '{"fixture":"α"}\n';
const pin = { package: "@fixture/first", version: "1.0.0" };
const digest = (approvedBytes) =>
  `sha256:${createHash("sha256").update(approvedBytes).digest("hex")}`;
const record = {
  ...pin,
  packageDirectory:
    "node_modules/.pnpm/@fixture+first@1.0.0/node_modules/@fixture/first",
  expectedDigest: digest(approved),
};
const roots = [];
async function temporary() {
  const root = await mkdtemp(join(tmpdir(), "frontspan-preset-private-"));
  roots.push(root);
  return root;
}
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
function manifest(entry = record) {
  return {
    name: entry.package,
    version: entry.version,
    exports: { [subpath]: subpath },
  };
}
async function install(
  root,
  entry = record,
  bytes = approved,
  metadata = manifest(entry),
) {
  const directory = join(root, entry.packageDirectory);
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, "package.json"),
    typeof metadata === "string" ? metadata : JSON.stringify(metadata),
  );
  await writeFile(join(directory, file), bytes);
  return directory;
}
async function rejects(result, code, file) {
  const error = await result.then(
    () => undefined,
    (error) => error,
  );
  expect(error).toBeInstanceOf(PresetInstallError);
  expect(error.code).toBe(code);
  expect(error.file).toBe(file);
  expect(error.cause).toBeUndefined();
  return error;
}

test("uses canonical install directories and emits documents in authored order", async () => {
  const root = await temporary();
  const pin2 = { package: "second", version: "2.0.0-alpha.1+fixture" };
  const record2 = {
    ...pin2,
    packageDirectory: "node_modules/second",
    expectedDigest: digest("null"),
  };
  const canonical = await install(root);
  await mkdir(join(root, "node_modules/@fixture"));
  await symlink(canonical, join(root, "node_modules/@fixture/first"), "dir");
  await install(root, record2, "null");
  expect(
    await readVerifiedPresets(root, [pin2, pin], [record, record2]),
  ).toEqual([null, { fixture: "α" }]);
  expect(await readVerifiedPresets(root, [], [])).toEqual([]);
});

test("rejects altered bytes before decoding or parsing, even for the same package/version and JSON value", async () => {
  const root = await temporary();
  for (const bytes of [approved.trimEnd(), new Uint8Array([255])]) {
    await install(root, record, bytes);
    await rejects(
      readVerifiedPresets(root, [pin], [record]),
      "CFG_PRESET_INTEGRITY",
      file,
    );
  }
});

test("matches all evidence before IO; removal, substitution, duplicates and malformed records fail closed", async () => {
  const root = await temporary();
  const other = { ...pin, package: "other" };
  for (const [pins, evidence] of [
    [[], [record]],
    [[pin], []],
    [[pin], undefined],
    [[pin], [null]],
    [[pin], Array(1)],
    [[pin], [{ ...record, package: "other" }]],
    [[pin], [{ ...record, version: "1.0.1" }]],
    [
      [pin, other],
      [record, record],
    ],
    [
      [pin, pin],
      [record, { ...record, ...other }],
    ],
    [[{ ...pin, version: "^1.0.0" }], [{ ...record, version: "^1.0.0" }]],
    [[pin], [Object.create(record)]],
    [[pin], [{ ...record, extra: true }]],
    ...[
      undefined,
      7,
      "",
      "0".repeat(64),
      `sha256:${"A".repeat(64)}`,
      record.expectedDigest + "\n",
    ].map((expectedDigest) => [[pin], [{ ...record, expectedDigest }]]),
  ])
    await rejects(
      readVerifiedPresets(root, pins, evidence),
      "CFG_PRESET_EVIDENCE",
    );
});

test("rejects noncanonical evidence paths and symlinks at every file boundary", async () => {
  const root = await temporary();
  for (const path of [
    root,
    "../escape",
    "a/../b",
    "./pkg",
    "a//b",
    "a\\b",
    "C:/pkg",
  ]) {
    await rejects(
      readVerifiedPresets(root, [pin], [{ ...record, packageDirectory: path }]),
      "CFG_PRESET_EVIDENCE",
    );
  }
  const outside = await temporary();
  const directory = await install(outside);
  await symlink(
    join(outside, "node_modules"),
    join(root, "node_modules"),
    "dir",
  );
  await rejects(
    readVerifiedPresets(root, [pin], [record]),
    "CFG_PRESET_INVALID",
    "package.json",
  );
  await rm(join(root, "node_modules"));
  const local = await install(root);
  await rename(local, local + "-original");
  await symlink(local + "-original", local, "dir");
  await rejects(
    readVerifiedPresets(root, [pin], [record]),
    "CFG_PRESET_INVALID",
    "package.json",
  );
  await rm(local);
  await rename(local + "-original", local);
  for (const name of ["package.json", file]) {
    await rm(join(local, name));
    await rejects(
      readVerifiedPresets(root, [pin], [record]),
      "CFG_PRESET_INVALID",
      name,
    );
    await symlink(join(directory, name), join(local, name));
    await rejects(
      readVerifiedPresets(root, [pin], [record]),
      "CFG_PRESET_INVALID",
      name,
    );
    await rm(join(local, name));
    await install(root);
  }
});

test("checks manifest identity and only the own literal data export; never loads package entrypoints", async () => {
  const root = await temporary();
  const metadata = {
    ...manifest(),
    main: "./entry.cjs",
    scripts: { postinstall: "node entry.cjs" },
  };
  const directory = await install(root, record, approved, metadata);
  const marker = join(directory, "executed");
  await writeFile(
    join(directory, "entry.cjs"),
    `require('node:fs').writeFileSync(${JSON.stringify(marker)}, '')`,
  );
  expect(await readVerifiedPresets(root, [pin], [record])).toEqual([
    { fixture: "α" },
  ]);
  for (const patch of [
    { name: "other" },
    { version: "1.0.1" },
    ...[
      undefined,
      subpath,
      { "./*": "./*" },
      { [subpath]: { default: subpath } },
      { [subpath]: "./entry.cjs" },
      { [subpath]: "../frontspan-preset.json" },
    ].map((exports) => ({ exports })),
  ]) {
    await install(root, record, approved, { ...metadata, ...patch });
    await rejects(
      readVerifiedPresets(root, [pin], [record]),
      "CFG_PRESET_INVALID",
      "package.json",
    );
  }
  await expect(access(marker)).rejects.toMatchObject({ code: "ENOENT" });
});

test("rejects invalid strict JSON and oversized files without exposing paths, keys, values or digests", async () => {
  const root = await temporary();
  const secret = "synthetic-private-token";
  const duplicate = `{"${secret}":0,"${secret}":1}`;
  for (const [name, bytes] of [
    ["package.json", duplicate],
    [file, duplicate],
    [file, new Uint8Array([255])],
    [file, " ".repeat(256 * 1024) + "0"],
  ]) {
    const entry = {
      ...record,
      expectedDigest: name === file ? digest(bytes) : record.expectedDigest,
    };
    await install(
      root,
      entry,
      name === file ? bytes : approved,
      name === file ? manifest() : bytes,
    );
    const error = await rejects(
      readVerifiedPresets(root, [pin], [entry]),
      "CFG_PRESET_INVALID",
      name,
    );
    const diagnostic = `${String(error)} ${JSON.stringify(error)}`;
    for (const hidden of [
      root,
      pin.package,
      entry.packageDirectory,
      entry.expectedDigest,
      secret,
    ])
      expect(diagnostic).not.toContain(hidden);
  }
});
