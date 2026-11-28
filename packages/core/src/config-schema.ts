import endpoint from "./schemas/endpoint.schema.json" with { type: "json" };
import environment from "./schemas/environment.schema.json" with { type: "json" };
import resource from "./schemas/resource.schema.json" with { type: "json" };
import root from "./schemas/root.schema.json" with { type: "json" };

import preset from "./schemas/preset.schema.json" with { type: "json" };

interface ShapeSchema {
  readonly $ref?: string;
  readonly type?: string;
  readonly const?: string | number;
  readonly enum?: readonly string[];
  readonly oneOf?: readonly ShapeSchema[];
  readonly required?: readonly string[];
  readonly properties?: SchemaMap;
  readonly propertyNames?: ShapeSchema;
  readonly additionalProperties?: boolean | ShapeSchema;
  readonly items?: ShapeSchema;
  readonly pattern?: string;
  readonly minLength?: number;
  readonly minimum?: number;
  readonly maximum?: number;
}

type SchemaMap = Readonly<Record<string, ShapeSchema | undefined>>;
type DocumentSchema = ShapeSchema & { readonly $defs: SchemaMap };
type ShapeIssue = { pointer: string; message: string };

const schemas = { root, resource, endpoint, environment } satisfies Record<
  string,
  DocumentSchema
>;
export type DocumentKind = keyof typeof schemas;

/** Validates decoded JSON against a bundled v1 schema, without resolving authored references. */
export function validateShape(
  kind: DocumentKind,
  value: unknown,
): ShapeIssue | undefined {
  const schema = schemas[kind];
  return check(schema, value, "", schema.$defs);
}

export function validatePresetShape(value: unknown): ShapeIssue | undefined {
  return check(preset, value, "", preset.$defs);
}

function resolve(schema: ShapeSchema, definitions: SchemaMap): ShapeSchema {
  if (schema.$ref === undefined) return schema;
  const prefix = "#/$defs/";
  if (schema.$ref.startsWith(prefix)) {
    const key = schema.$ref.slice(prefix.length);
    const target = Object.hasOwn(definitions, key)
      ? definitions[key]
      : undefined;
    if (target && target.$ref === undefined) return target;
  }
  throw new Error("Unsupported reference in bundled configuration schema.");
}

function isObject(value: unknown): value is object {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function ownValue(value: object, key: string | number): unknown {
  return Object.getOwnPropertyDescriptor(value, key)?.value;
}

function matchesType(type: string, value: unknown): boolean {
  switch (type) {
    case "object":
      return isObject(value);
    case "array":
      return Array.isArray(value);
    case "string":
    case "boolean":
      return typeof value === type;
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    default:
      throw new Error("Unsupported type in bundled configuration schema.");
  }
}

function childPointer(pointer: string, key: string): string {
  return `${pointer}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`;
}

function checkUnion(
  alternatives: readonly ShapeSchema[],
  value: unknown,
  pointer: string,
  definitions: SchemaMap,
): ShapeIssue | undefined {
  if (!isObject(value)) return { pointer, message: "Expected an object." };

  // Every bundled oneOf is a tagged object union with distinct, required constant tags.
  const branches = alternatives.map((branch) => resolve(branch, definitions));
  const tag = (["kind", "mode"] as const).find((key) =>
    branches.every(
      (branch) =>
        typeof branch.properties?.[key]?.const === "string" &&
        branch.required?.includes(key),
    ),
  );
  if (tag === undefined)
    throw new Error("Missing discriminator in bundled configuration schema.");

  const tagPointer = childPointer(pointer, tag);
  if (!Object.hasOwn(value, tag))
    return { pointer: tagPointer, message: "Required property is missing." };
  const tagValue = ownValue(value, tag);
  const matching = branches.filter(
    (branch) => branch.properties?.[tag]?.const === tagValue,
  );
  if (matching.length !== 1)
    return { pointer: tagPointer, message: "Unsupported discriminator." };
  return check(matching[0], value, pointer, definitions);
}

function checkObject(
  schema: ShapeSchema,
  value: object,
  pointer: string,
  definitions: SchemaMap,
): ShapeIssue | undefined {
  const properties = schema.properties ?? {};
  for (const key of schema.required ?? []) {
    if (!Object.hasOwn(value, key)) {
      return {
        pointer: childPointer(pointer, key),
        message: "Required property is missing.",
      };
    }
  }

  const extraKeys = Object.keys(value).filter(
    (key) => !Object.hasOwn(properties, key),
  );
  if (schema.additionalProperties === false && extraKeys.length > 0) {
    return { pointer, message: "Unknown property." };
  }
  for (const [key, property] of Object.entries(properties)) {
    if (!property || !Object.hasOwn(value, key)) continue;
    const issue = check(
      property,
      ownValue(value, key),
      childPointer(pointer, key),
      definitions,
    );
    if (issue) return issue;
  }

  const entry = schema.additionalProperties;
  if (typeof entry === "object") {
    const names = schema.propertyNames;
    for (const key of extraKeys.sort()) {
      // Map keys are authored IDs. Point at the map rather than disclosing any key.
      if (names && check(names, key, pointer, definitions))
        return { pointer, message: "Invalid map key." };
      const issue = check(entry, ownValue(value, key), pointer, definitions);
      if (issue) return { pointer, message: issue.message };
    }
  }
  return undefined;
}

function check(
  input: ShapeSchema,
  value: unknown,
  pointer: string,
  definitions: SchemaMap,
): ShapeIssue | undefined {
  const schema = resolve(input, definitions);
  if (schema.type !== undefined && !matchesType(schema.type, value)) {
    return {
      pointer,
      message: `Expected ${schema.type === "object" || schema.type === "array" || schema.type === "integer" ? "an" : "a"} ${schema.type}.`,
    };
  }
  if (schema.const !== undefined && value !== schema.const)
    return { pointer, message: "Unexpected value." };
  if (schema.enum && !schema.enum.some((allowed) => allowed === value)) {
    return { pointer, message: "Unsupported value." };
  }
  if (schema.oneOf)
    return checkUnion(schema.oneOf, value, pointer, definitions);

  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      return { pointer, message: "String is too short." };
    }
    if (
      schema.pattern !== undefined &&
      !new RegExp(schema.pattern, "u").test(value)
    ) {
      return { pointer, message: "String does not match the required format." };
    }
  }
  if (
    typeof value === "number" &&
    ((schema.minimum !== undefined && value < schema.minimum) ||
      (schema.maximum !== undefined && value > schema.maximum))
  ) {
    return { pointer, message: "Number is outside the allowed range." };
  }

  if (isObject(value)) return checkObject(schema, value, pointer, definitions);
  if (Array.isArray(value) && schema.items) {
    for (let i = 0; i < value.length; i++) {
      const issue = check(
        schema.items,
        ownValue(value, i),
        childPointer(pointer, String(i)),
        definitions,
      );
      if (issue) return issue;
    }
  }
  return undefined;
}
