type Versioned = { readonly schemaVersion: 1; readonly $schema?: string };
export type ValueRef =
  | { readonly kind: "literal"; readonly value: string }
  | { readonly kind: "env"; readonly name: string };
export type ExecutionMode = "direct" | "proxy";
export type HttpMethod =
  "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";
export type OperationalPolicies = Readonly<{
  timeoutMs?: number;
  retries?: number;
  validation?: "strict" | "warn" | "off";
}>;
export type ConfigPaths = Readonly<
  Record<"resources" | "endpoints" | "environments" | "generated", string>
>;

export type RootConfig = Versioned & {
  readonly project: { readonly name: string };
  readonly presets?: readonly {
    readonly package: string;
    readonly version: string;
  }[];
  readonly modules?: Readonly<
    Partial<Record<"codegen" | "query" | "bff" | "validation", boolean>>
  >;
  readonly paths?: Partial<ConfigPaths>;
  readonly defaults?: OperationalPolicies & {
    readonly execution?: ExecutionMode;
  };
};

export type ResourceConfig = Versioned & {
  readonly id: string;
  readonly kind: "http";
  readonly contract:
    | { readonly kind: "file"; readonly path: string }
    | { readonly kind: "url"; readonly url: ValueRef };
  readonly upstream: {
    readonly baseUrl: ValueRef;
    readonly auth?:
      | { readonly kind: "none" }
      | { readonly kind: "forward"; readonly adapterId: string };
  };
  readonly direct?: {
    readonly allowed?: boolean;
    readonly publicBaseUrl?: ValueRef;
  };
  readonly defaults?: OperationalPolicies;
};

type Route = { readonly method: HttpMethod; readonly path: string };
type ResponseConfig =
  | { readonly kind: "data"; readonly mapping?: { readonly data?: string } }
  | {
      readonly kind: "paginated";
      readonly mapping: Readonly<
        Record<"items" | "page" | "pageSize" | "totalCount", string>
      >;
    }
  | { readonly kind: "empty" | "binary" };

export type EndpointConfig = Versioned & {
  readonly id: string;
  readonly resourceId: string;
  readonly source: Route;
  readonly domain: string;
  readonly name: string;
  readonly execution:
    { readonly mode: "direct" } | ({ readonly mode: "proxy" } & Route);
  readonly response: ResponseConfig;
  readonly query?: { readonly kind: "query" | "mutation" | "none" };
  readonly policies?: OperationalPolicies;
};

export type EnvironmentConfig = Versioned & {
  readonly name: string;
  readonly resources?: Readonly<
    Record<
      string,
      | {
          readonly upstream?: { readonly baseUrl?: ValueRef };
          readonly defaults?: OperationalPolicies;
        }
      | undefined
    >
  >;
  readonly endpoints?: Readonly<
    Record<string, { readonly policies?: OperationalPolicies } | undefined>
  >;
};

export type AuthoredDocuments = {
  readonly root: RootConfig;
  readonly resource: ResourceConfig;
  readonly endpoint: EndpointConfig;
  readonly environment: EnvironmentConfig;
};

export type AuthoredFile<T> = { readonly file: string; readonly value: T };
export type LoadedConfig = Readonly<{
  root: AuthoredFile<RootConfig>;
  paths: ConfigPaths;
  resources: readonly AuthoredFile<ResourceConfig>[];
  endpoints: readonly AuthoredFile<EndpointConfig>[];
  environments: readonly AuthoredFile<EnvironmentConfig>[];
}>;

export type ConfigErrorCode =
  | "CFG_INVALID_PATH"
  | "CFG_READ_FAILED"
  | "CFG_MISSING_ROOT"
  | "CFG_UNKNOWN_FILE"
  | "CFG_INVALID_JSON"
  | "CFG_DUPLICATE_KEY"
  | "CFG_FORBIDDEN_KEY"
  | "CFG_LIMIT_EXCEEDED"
  | "CFG_UNKNOWN_VERSION"
  | "CFG_SCHEMA_INVALID"
  | "CFG_DUPLICATE_ID"
  | "CFG_MISSING_RESOURCE"
  | "CFG_MISSING_ENDPOINT"
  | "CFG_MODULE_REQUIRED"
  | "CFG_INVALID_URL"
  | "CFG_DIRECT_NOT_ALLOWED"
  | "CFG_INVALID_ROUTE"
  | "CFG_ROUTE_COLLISION"
  | "CFG_INVALID_NAME"
  | "CFG_NAME_COLLISION";

export type ConfigDiagnostic = Readonly<{
  code: ConfigErrorCode;
  severity: "error";
  phase: "config" | "load" | "parse";
  document: keyof AuthoredDocuments;
  index?: number;
  pointer: string;
  message: string;
}>;

export type LoadConfigResult =
  | { readonly ok: true; readonly config: LoadedConfig }
  | { readonly ok: false; readonly diagnostics: readonly [ConfigDiagnostic] };
