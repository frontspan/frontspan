import {
  decodeUtf8,
  isProjectPath,
  openProject,
  sha256Digest,
} from "./config-io.mjs";
import type { RootConfig } from "./config-types.js";
import rootSchema from "./schemas/root.schema.json" with { type: "json" };
import { parseStrictJson } from "./strict-json.js";

export interface FrozenPresetEvidence {
  readonly package: string;
  readonly version: string;
  /** Canonical installed directory beneath the project, not a package-manager symlink. */
  readonly packageDirectory: string;
  /** Approved separately from the installation being checked. */
  readonly expectedDigest: string;
}

const messages = {
  CFG_PRESET_EVIDENCE:
    "Expected one frozen install record per exact preset pin.",
  CFG_PRESET_INTEGRITY:
    "Installed preset bytes do not match the approved digest.",
  CFG_PRESET_INVALID: "Could not read a valid installed preset.",
};
const presetFile = "frontspan-preset.json";
const presetExport = `./${presetFile}`;
type InstallFile = "package.json" | typeof presetFile;

export class PresetInstallError extends Error {
  constructor(
    readonly code: keyof typeof messages,
    readonly file?: InstallFile,
  ) {
    super(file ? `${file}: ${messages[code]}` : messages[code]);
    this.name = "PresetInstallError";
  }
}

type Pins = NonNullable<RootConfig["presets"]>;
const pinProperties = rootSchema.$defs.presetPin.properties;
const packagePattern = new RegExp(pinProperties.package.pattern, "u");
const versionPattern = new RegExp(pinProperties.version.pattern, "u");
// Two named files per preset; cap file operations even for tiny documents.
const maxPresets = 512;

function own(value: unknown, key: PropertyKey): unknown {
  if (value === null || typeof value !== "object") return undefined;
  return Object.getOwnPropertyDescriptor(value, key)?.value;
}

function invalidEvidence(): never {
  throw new PresetInstallError("CFG_PRESET_EVIDENCE");
}

function matchEvidence(pins: Pins, evidence: readonly FrozenPresetEvidence[]) {
  if (
    !Array.isArray(pins) ||
    !Array.isArray(evidence) ||
    pins.length !== evidence.length ||
    pins.length > maxPresets
  )
    invalidEvidence();

  const remaining = new Map<string, FrozenPresetEvidence>();
  for (let i = 0; i < evidence.length; i++) {
    const record = own(evidence, i);
    const name = own(record, "package");
    const version = own(record, "version");
    const packageDirectory = own(record, "packageDirectory");
    const expectedDigest = own(record, "expectedDigest");
    if (
      !record ||
      typeof record !== "object" ||
      Reflect.ownKeys(record).length !== 4 ||
      typeof name !== "string" ||
      !packagePattern.test(name) ||
      remaining.has(name) ||
      typeof version !== "string" ||
      !versionPattern.test(version) ||
      typeof packageDirectory !== "string" ||
      !isProjectPath(packageDirectory) ||
      typeof expectedDigest !== "string" ||
      !/^sha256:[0-9a-f]{64}$/u.test(expectedDigest)
    )
      invalidEvidence();
    remaining.set(name, {
      package: name,
      version,
      packageDirectory,
      expectedDigest,
    });
  }

  // Consume each record once, snapshotting the entire plan before any asynchronous IO.
  const ordered: FrozenPresetEvidence[] = [];
  for (let i = 0; i < pins.length; i++) {
    const pin = own(pins, i);
    const name = own(pin, "package");
    const record = typeof name === "string" ? remaining.get(name) : undefined;
    if (
      !pin ||
      typeof pin !== "object" ||
      Reflect.ownKeys(pin).length !== 2 ||
      !record ||
      own(pin, "version") !== record.version
    )
      invalidEvidence();
    remaining.delete(record.package);
    ordered.push(record);
  }
  return ordered;
}

async function readInstalledDocument(
  project: Awaited<ReturnType<typeof openProject>>,
  record: FrozenPresetEvidence,
  file: InstallFile,
) {
  try {
    const bytes = await project.readBytes(`${record.packageDirectory}/${file}`);
    if (file === presetFile && sha256Digest(bytes) !== record.expectedDigest)
      throw new PresetInstallError("CFG_PRESET_INTEGRITY", file);
    return parseStrictJson(decodeUtf8(bytes));
  } catch (error) {
    if (error instanceof PresetInstallError) throw error;
    // Native filesystem errors can contain absolute paths. Never attach their cause.
    throw new PresetInstallError("CFG_PRESET_INVALID", file);
  }
}

/** Verifies installed JSON only; the caller validates the returned preset shapes. */
export async function readVerifiedPresets(
  projectRoot: string,
  pins: Pins,
  evidence: readonly FrozenPresetEvidence[],
): Promise<unknown[]> {
  const ordered = matchEvidence(pins, evidence);
  if (ordered.length === 0) return [];
  const project = await openProject(projectRoot).catch(() => {
    throw new PresetInstallError("CFG_PRESET_INVALID");
  });
  const documents: unknown[] = [];
  for (const record of ordered) {
    const manifest = await readInstalledDocument(
      project,
      record,
      "package.json",
    );
    if (
      own(manifest, "name") !== record.package ||
      own(manifest, "version") !== record.version ||
      own(own(manifest, "exports"), presetExport) !== presetExport
    )
      throw new PresetInstallError("CFG_PRESET_INVALID", "package.json");
    documents.push(await readInstalledDocument(project, record, presetFile));
  }
  return documents;
}
