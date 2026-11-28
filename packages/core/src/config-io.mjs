import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, opendir, realpath } from "node:fs/promises";
import { resolve } from "node:path";
import { URL } from "node:url";
import { TextDecoder } from "node:util";

const MAX_FILE_BYTES = 256 * 1024;
const MAX_TOTAL_BYTES = 8 * 1024 * 1024;
const MAX_DIRECTORY_ENTRIES = 1024;

const messages = {
  CFG_INVALID_PATH:
    "Expected a canonical project-relative path with no symbolic links.",
  CFG_READ_FAILED: "Could not read configuration from the project.",
  CFG_MISSING_ROOT:
    "Expected frontspan.config.json in the explicit project root.",
  CFG_UNKNOWN_FILE: "Unexpected entry in a configuration directory.",
  CFG_LIMIT_EXCEEDED:
    "Configuration file, project byte, or directory limit exceeded.",
  CFG_INVALID_JSON: "Configuration must be valid UTF-8 JSON.",
};

export class ConfigIoError extends Error {
  /** @param {keyof typeof messages} code */
  constructor(code) {
    super(messages[code]);
    this.code = code;
  }
}

const hasControl = (text) =>
  Array.from(text).some(
    (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
  );

/** @param {string} path */
export function isProjectPath(path) {
  return (
    path.length <= 1024 &&
    path.isWellFormed() &&
    !hasControl(path) &&
    !/[\\:<>"|?*]/u.test(path) &&
    path
      .split("/")
      .every(
        (segment) =>
          segment &&
          segment.length <= 255 &&
          !/[. ]$/u.test(segment) &&
          !/^(?:con|prn|aux|nul|(?:com|lpt)[1-9¹²³])(?:\.|$)/iu.test(segment),
      )
  );
}

/** @param {string} left @param {string} right */
export function pathsOverlap(left, right) {
  const a = left.normalize("NFC").toLowerCase();
  const b = right.normalize("NFC").toLowerCase();
  return a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
}

/** @param {string} value @param {boolean} httpsOnly */
export function canonicalLiteralUrl(value, httpsOnly) {
  if (
    value.trim() !== value ||
    !value.isWellFormed() ||
    hasControl(value) ||
    /[\\?#]/u.test(value) ||
    !/^https?:\/\/[^/@]+(?:\/|$)/u.test(value)
  )
    return undefined;
  try {
    const url = new URL(value);
    if (
      url.username ||
      url.password ||
      (httpsOnly && url.protocol !== "https:")
    )
      return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

const sameFile = (left, right) =>
  left.dev === right.dev && left.ino === right.ino;

/** @param {Uint8Array} bytes @returns {string} */
export function sha256Digest(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

/** @param {Uint8Array} bytes @returns {string} */
export function decodeUtf8(bytes) {
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
      bytes,
    );
  } catch {
    throw new ConfigIoError("CFG_INVALID_JSON");
  }
}

/** @param {string} projectRoot */
export async function openProject(projectRoot) {
  if (typeof projectRoot !== "string" || projectRoot.trim() === "")
    throw new ConfigIoError("CFG_INVALID_PATH");
  try {
    const root = await realpath(resolve(projectRoot));
    const rootStat = await lstat(root);
    if (!rootStat.isDirectory()) throw new ConfigIoError("CFG_INVALID_PATH");
    let bytes = 0;
    let entries = 0;

    async function inspect(path) {
      if (!isProjectPath(path)) throw new ConfigIoError("CFG_INVALID_PATH");
      const currentRoot = await lstat(root);
      if (!sameFile(currentRoot, rootStat) || !currentRoot.isDirectory())
        throw new ConfigIoError("CFG_INVALID_PATH");
      const segments = path.split("/");
      let absolute = root;
      let stat = currentRoot;
      for (let i = 0; i < segments.length; i++) {
        absolute = resolve(absolute, segments[i]);
        try {
          stat = await lstat(absolute);
        } catch (error) {
          if (error?.code === "ENOENT") return undefined;
          throw error;
        }
        if (
          stat.isSymbolicLink() ||
          (i < segments.length - 1 && !stat.isDirectory())
        ) {
          throw new ConfigIoError("CFG_INVALID_PATH");
        }
      }
      if ((await realpath(absolute)) !== absolute)
        throw new ConfigIoError("CFG_INVALID_PATH");
      return { absolute, stat };
    }

    const project = {
      /** @param {string} path @param {"file" | "directory"} type */
      async checkPath(path, type) {
        const target = await inspect(path);
        if (!target) return false;
        if (
          type === "file" ? !target.stat.isFile() : !target.stat.isDirectory()
        )
          throw new ConfigIoError("CFG_INVALID_PATH");
        return true;
      },
      /** @param {string} path @param {boolean} [optional] */
      async list(path, optional = false) {
        const before = await inspect(path);
        if (!before && optional) return [];
        if (!before) throw new ConfigIoError("CFG_READ_FAILED");
        if (!before.stat.isDirectory())
          throw new ConfigIoError("CFG_INVALID_PATH");
        const directory = await opendir(before.absolute);
        const names = [];
        for await (const entry of directory) {
          if (++entries > MAX_DIRECTORY_ENTRIES)
            throw new ConfigIoError("CFG_LIMIT_EXCEEDED");
          names.push(entry.name);
        }
        const after = await inspect(path);
        if (!after || !sameFile(before.stat, after.stat))
          throw new ConfigIoError("CFG_INVALID_PATH");
        return names.sort();
      },
      /** @param {string} path */
      async read(path) {
        return decodeUtf8(await project.readBytes(path));
      },
      /** @param {string} path */
      async readBytes(path) {
        const before = await inspect(path);
        if (!before)
          throw new ConfigIoError(
            path === "frontspan.config.json"
              ? "CFG_MISSING_ROOT"
              : "CFG_READ_FAILED",
          );
        if (!before.stat.isFile()) throw new ConfigIoError("CFG_INVALID_PATH");
        const handle = await open(
          before.absolute,
          constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
        );
        try {
          const start = await handle.stat();
          if (!start.isFile() || !sameFile(before.stat, start))
            throw new ConfigIoError("CFG_INVALID_PATH");
          const limit = Math.min(MAX_FILE_BYTES, MAX_TOTAL_BYTES - bytes);
          if (start.size > limit) throw new ConfigIoError("CFG_LIMIT_EXCEEDED");
          const buffer = new Uint8Array(limit + 1);
          let length = 0;
          while (length < buffer.length) {
            const { bytesRead } = await handle.read(
              buffer,
              length,
              buffer.length - length,
              length,
            );
            if (!bytesRead) break;
            length += bytesRead;
          }
          if (length > limit) throw new ConfigIoError("CFG_LIMIT_EXCEEDED");
          const end = await handle.stat();
          const after = await inspect(path);
          if (
            !after ||
            !sameFile(end, after.stat) ||
            end.size !== length ||
            end.mtimeMs !== start.mtimeMs ||
            end.ctimeMs !== start.ctimeMs
          ) {
            throw new ConfigIoError("CFG_READ_FAILED");
          }
          bytes += length;
          return buffer.subarray(0, length);
        } finally {
          await handle.close();
        }
      },
    };
    return project;
  } catch (error) {
    if (error instanceof ConfigIoError) throw error;
    throw new ConfigIoError("CFG_READ_FAILED");
  }
}
