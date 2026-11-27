import {
  canonicalLiteralUrl,
  ConfigIoError,
  isProjectPath,
  openProject,
  pathsOverlap,
} from "./config-io.mjs";
import { validateShape, type DocumentKind } from "./config-schema.js";
import type {
  AuthoredDocuments,
  AuthoredFile,
  ConfigDiagnostic,
  ConfigErrorCode,
  ConfigPaths,
  LoadConfigResult,
  LoadedConfig,
  ValueRef,
} from "./config-types.js";
import { parseStrictJson, StrictJsonError } from "./strict-json.js";

const rootFile = "frontspan.config.json";
const reservedDirectory = "frontspan/modules";
const reservedPaths = [
  rootFile,
  "frontspan/frontspan.lock.json",
  reservedDirectory,
];
const defaultPaths: ConfigPaths = {
  resources: "frontspan/resources",
  endpoints: "frontspan/endpoints",
  environments: "frontspan/environments",
  generated: "src/generated",
};

const reservedNames = new Set(
  "arguments await break case catch class const constructor continue debugger default delete do else enum eval export extends false finally for function if implements import in instanceof interface let new null package private protected prototype public return static super switch this throw true try typeof var void while with yield __proto__".split(
    " ",
  ),
);

type Location = Pick<ConfigDiagnostic, "document" | "index">;
type Project = Awaited<ReturnType<typeof openProject>>;

class ConfigFailure extends Error {
  constructor(readonly diagnostic: ConfigDiagnostic) {
    super(diagnostic.message);
  }
}

function fail(
  location: Location,
  code: ConfigErrorCode,
  message: string,
  pointer = "",
  phase: ConfigDiagnostic["phase"] = "config",
): never {
  throw new ConfigFailure({
    ...location,
    severity: "error",
    phase,
    code,
    pointer,
    message,
  });
}

async function io<T>(
  location: Location,
  action: () => Promise<T>,
  pointer = "",
): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (error instanceof ConfigIoError)
      fail(
        location,
        error.code,
        error.message,
        pointer,
        error.code === "CFG_INVALID_JSON" ? "parse" : "load",
      );
    fail(
      location,
      "CFG_READ_FAILED",
      "Could not read configuration from the project.",
      pointer,
      "load",
    );
  }
}

async function readDocument<K extends DocumentKind>(
  project: Project,
  document: K,
  file: string,
  index?: number,
): Promise<AuthoredFile<AuthoredDocuments[K]>> {
  const location = index === undefined ? { document } : { document, index };
  const text = await io(location, () => project.read(file));
  let parsed: unknown;
  try {
    parsed = parseStrictJson(text);
  } catch (error) {
    if (error instanceof StrictJsonError)
      fail(location, error.code, error.message, error.pointer, "parse");
    throw error;
  }
  const version =
    parsed !== null &&
    typeof parsed === "object" &&
    Object.hasOwn(parsed, "schemaVersion")
      ? (parsed as Record<string, unknown>).schemaVersion
      : undefined;
  if (
    typeof version === "number" &&
    Number.isInteger(version) &&
    version !== 1
  ) {
    fail(
      location,
      "CFG_UNKNOWN_VERSION",
      "Unsupported configuration schema version. Use tooling compatible with the authored version and migrate explicitly.",
      "/schemaVersion",
    );
  }
  const issue = validateShape(document, parsed);
  if (issue) fail(location, "CFG_SCHEMA_INVALID", issue.message, issue.pointer);
  return { file, value: parsed as AuthoredDocuments[K] };
}

async function listDocuments<K extends Exclude<DocumentKind, "root">>(
  project: Project,
  document: K,
  directory: string,
): Promise<AuthoredFile<AuthoredDocuments[K]>[]> {
  const location = { document };
  const files: string[] = [];
  const add = (file: string) => {
    if (!isProjectPath(file))
      fail(
        location,
        "CFG_INVALID_PATH",
        "Invalid configuration file path.",
        "",
        "load",
      );
    if (file.split("/").at(-1) === ".json" || !file.endsWith(".json"))
      fail(
        location,
        "CFG_UNKNOWN_FILE",
        "Expected a JSON file in this configuration directory.",
        "",
        "load",
      );
    files.push(file);
  };
  for (const name of await io(location, () => project.list(directory, true))) {
    const path = `${directory}/${name}`;
    if (document === "endpoint") {
      for (const entry of await io(location, () => project.list(path)))
        add(`${path}/${entry}`);
    } else add(path);
  }
  const documents: AuthoredFile<AuthoredDocuments[K]>[] = [];
  for (const [index, file] of files.sort().entries())
    documents.push(await readDocument(project, document, file, index));
  return documents;
}

function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

function checkUrl(
  ref: ValueRef,
  location: Location,
  pointer: string,
  httpsOnly = false,
): void {
  if (ref.kind === "literal" && !canonicalLiteralUrl(ref.value, httpsOnly)) {
    fail(
      location,
      "CFG_INVALID_URL",
      "Expected an absolute credential-free URL without a query or fragment.",
      pointer,
    );
  }
}

function sameUrl(a: ValueRef, b: ValueRef) {
  return a.kind === "env" && b.kind === "env"
    ? a.name === b.name
    : a.kind === "literal" &&
        b.kind === "literal" &&
        canonicalLiteralUrl(a.value, false) ===
          canonicalLiteralUrl(b.value, false);
}

type RouteSegment = { literal: string } | { parameter: string };
function routeTemplate(
  path: string,
  proxy: boolean,
  location: Location,
  pointer: string,
) {
  const invalid = () =>
    fail(
      location,
      "CFG_INVALID_ROUTE",
      "Invalid or unsupported HTTP path template.",
      pointer,
    );
  if (path === "/" && !proxy)
    return { segments: [], parameters: new Set<string>() };
  if (
    !path.startsWith("/") ||
    path.startsWith("//") ||
    (proxy && !path.startsWith("/api/frontspan/"))
  )
    invalid();
  const parameters = new Set<string>();
  const segments: RouteSegment[] = [];
  for (const raw of path.slice(1).split("/")) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(raw);
    } catch {
      return invalid();
    }
    if (
      !decoded.isWellFormed() ||
      decoded === "." ||
      decoded === ".." ||
      /[\\/]/u.test(decoded) ||
      /[?# ]/u.test(raw) ||
      Array.from(decoded).some(
        (c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127,
      ) ||
      (proxy && (!decoded || /[%?# ]/u.test(decoded)))
    )
      invalid();
    const tags = [...raw.matchAll(/\{([A-Za-z0-9_.-]+)\}/gu)];
    const rest = raw.replace(/\{[A-Za-z0-9_.-]+\}/gu, "");
    if (
      /[{}]/u.test(proxy ? decodeURIComponent(rest) : rest) ||
      (proxy && tags.length > 0 && (tags.length !== 1 || rest !== ""))
    )
      invalid();
    for (const [, name] of tags) {
      if (parameters.has(name)) invalid();
      parameters.add(name);
    }
    segments.push(
      tags.length > 0 ? { parameter: tags[0][1] } : { literal: decoded },
    );
  }
  return { segments, parameters };
}

function overlappingRoutes(a: RouteSegment[], b: RouteSegment[]) {
  return (
    a.length === b.length &&
    a.every((left, i) => {
      const right = b[i];
      return (
        !("literal" in left) ||
        !("literal" in right) ||
        left.literal === right.literal
      );
    })
  );
}

async function validateConfig(project: Project, config: LoadedConfig) {
  const {
    root: { value: root },
    paths,
    resources,
    endpoints,
    environments,
  } = config;
  const rootLocation = { document: "root" } as const;
  const modules = root.modules;
  for (const module of ["query", "validation"] as const) {
    if (modules?.[module] && !modules.codegen)
      fail(
        rootLocation,
        "CFG_MODULE_REQUIRED",
        "This module requires codegen.",
        `/modules/${module}`,
      );
  }
  const resourcesById = new Map<string, AuthoredDocuments["resource"]>();
  for (const [index, { value }] of resources.entries()) {
    const location = { document: "resource", index } as const;
    if (resourcesById.has(value.id))
      fail(location, "CFG_DUPLICATE_ID", "Duplicate resource ID.", "/id");
    resourcesById.set(value.id, value);
    checkUrl(value.upstream.baseUrl, location, "/upstream/baseUrl");
    const publicUrl = value.direct?.publicBaseUrl;
    if (publicUrl) {
      checkUrl(publicUrl, location, "/direct/publicBaseUrl");
      if (sameUrl(publicUrl, value.upstream.baseUrl))
        fail(
          location,
          "CFG_DIRECT_NOT_ALLOWED",
          "Direct mode must not reuse the configured upstream base URL.",
          "/direct/publicBaseUrl",
        );
    }
    if (value.contract.kind === "url")
      checkUrl(value.contract.url, location, "/contract/url", true);
    else {
      const path = value.contract.path;
      if (
        [...Object.values(paths), ...reservedPaths].some((other) =>
          pathsOverlap(other, path),
        )
      ) {
        fail(
          location,
          "CFG_INVALID_PATH",
          "Contract input must not overlap configuration or output paths.",
          "/contract/path",
        );
      }
      await io(
        location,
        () => project.checkPath(path, "file"),
        "/contract/path",
      );
    }
  }

  const endpointIds = new Set<string>();
  const generatedNames = new Set<string>();
  const routes: { method: string; segments: RouteSegment[] }[] = [];
  for (const [index, { value }] of endpoints.entries()) {
    const location = { document: "endpoint", index } as const;
    if (endpointIds.has(value.id))
      fail(location, "CFG_DUPLICATE_ID", "Duplicate endpoint ID.", "/id");
    endpointIds.add(value.id);
    if (!value.id.startsWith(`${value.domain}.`))
      fail(
        location,
        "CFG_SCHEMA_INVALID",
        "Endpoint ID must be qualified by its declared domain.",
        "/id",
      );
    if (reservedNames.has(value.name))
      fail(
        location,
        "CFG_INVALID_NAME",
        "Generated name is reserved.",
        "/name",
      );
    const nameKey = `${value.domain}.${value.name}`;
    if (generatedNames.has(nameKey))
      fail(
        location,
        "CFG_NAME_COLLISION",
        "Duplicate generated name in a domain.",
        "/name",
      );
    generatedNames.add(nameKey);
    const resource = resourcesById.get(value.resourceId);
    if (!resource)
      fail(
        location,
        "CFG_MISSING_RESOURCE",
        "Endpoint references an unknown resource ID.",
        "/resourceId",
      );
    const { parameters } = routeTemplate(
      value.source.path,
      false,
      location,
      "/source/path",
    );
    if (value.query && value.query.kind !== "none" && !modules?.query)
      fail(
        location,
        "CFG_MODULE_REQUIRED",
        "This endpoint requires the query module.",
        "/query",
      );
    if (value.execution.mode === "direct") {
      if (!resource.direct?.allowed || !resource.direct.publicBaseUrl)
        fail(
          location,
          "CFG_DIRECT_NOT_ALLOWED",
          "Direct execution requires explicit resource eligibility and a public base URL.",
          "/execution",
        );
      continue;
    }
    if (!modules?.bff)
      fail(
        location,
        "CFG_MODULE_REQUIRED",
        "Proxy execution requires the bff module.",
        "/execution",
      );
    if (value.execution.method !== value.source.method)
      fail(
        location,
        "CFG_INVALID_ROUTE",
        "Proxy and source methods must match.",
        "/execution/method",
      );
    const proxy = routeTemplate(
      value.execution.path,
      true,
      location,
      "/execution/path",
    );
    if (
      proxy.parameters.size !== parameters.size ||
      [...proxy.parameters].some((name) => !parameters.has(name))
    ) {
      fail(
        location,
        "CFG_INVALID_ROUTE",
        "Proxy parameters must match source path parameters by name.",
        "/execution/path",
      );
    }
    const proxyMethod = value.execution.method;
    if (
      routes.some(
        ({ method, segments }) =>
          method === proxyMethod && overlappingRoutes(segments, proxy.segments),
      )
    ) {
      fail(
        location,
        "CFG_ROUTE_COLLISION",
        "Proxy route overlaps another route for this method.",
        "/execution/path",
      );
    }
    routes.push({ method: proxyMethod, segments: proxy.segments });
  }

  const environmentNames = new Set<string>();
  for (const [index, { value }] of environments.entries()) {
    const location = { document: "environment", index } as const;
    if (environmentNames.has(value.name))
      fail(
        location,
        "CFG_DUPLICATE_ID",
        "Duplicate environment name.",
        "/name",
      );
    environmentNames.add(value.name);
    for (const id of Object.keys(value.resources ?? {}).sort()) {
      const resource = resourcesById.get(id);
      if (!resource)
        fail(
          location,
          "CFG_MISSING_RESOURCE",
          "Environment overrides an unknown resource ID.",
          "/resources",
        );
      const ref = value.resources?.[id]?.upstream?.baseUrl;
      if (ref) {
        checkUrl(ref, location, "/resources");
        if (
          resource.direct?.publicBaseUrl &&
          sameUrl(ref, resource.direct.publicBaseUrl)
        )
          fail(
            location,
            "CFG_DIRECT_NOT_ALLOWED",
            "Direct mode must not reuse the configured upstream base URL.",
            "/resources",
          );
      }
    }
    for (const id of Object.keys(value.endpoints ?? {}).sort()) {
      if (!endpointIds.has(id))
        fail(
          location,
          "CFG_MISSING_ENDPOINT",
          "Environment overrides an unknown endpoint ID.",
          "/endpoints",
        );
    }
  }
}

/** Loads authored v1 documents only, without imports, env resolution, policy merge, or writes. */
export async function loadConfig(
  projectRoot: string,
): Promise<LoadConfigResult> {
  const location = { document: "root" } as const;
  try {
    const project = await io(location, () => openProject(projectRoot));
    const root = await readDocument(project, "root", rootFile);
    const paths = { ...defaultPaths, ...root.value.paths };
    const checked = [...reservedPaths];
    for (const name of Object.keys(defaultPaths) as (keyof ConfigPaths)[]) {
      const path = paths[name];
      const pointer = `/paths/${name}`;
      if (checked.some((other) => pathsOverlap(other, path)))
        fail(
          location,
          "CFG_INVALID_PATH",
          "Configuration and output paths must not overlap.",
          pointer,
        );
      await io(location, () => project.checkPath(path, "directory"), pointer);
      checked.push(path);
    }
    if (
      await io(location, () =>
        project.checkPath(reservedDirectory, "directory"),
      )
    ) {
      fail(
        location,
        "CFG_UNKNOWN_FILE",
        "The reserved modules directory is not supported by configuration v1.",
        "",
        "load",
      );
    }
    const config = {
      root,
      paths,
      resources: await listDocuments(project, "resource", paths.resources),
      endpoints: await listDocuments(project, "endpoint", paths.endpoints),
      environments: await listDocuments(
        project,
        "environment",
        paths.environments,
      ),
    };
    await validateConfig(project, config);
    return { ok: true, config: freeze(config) };
  } catch (error) {
    if (!(error instanceof ConfigFailure)) throw error;
    return { ok: false, diagnostics: [error.diagnostic] };
  }
}

export type {
  ConfigDiagnostic,
  LoadedConfig,
  LoadConfigResult,
} from "./config-types.js";
