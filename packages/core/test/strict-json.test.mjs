import { expect, test } from "vitest";
import { parseStrictJson, StrictJsonError } from "../src/strict-json.ts";

function expectError(text, code, pointer = "") {
  expect(() => parseStrictJson(text)).toThrow(
    expect.objectContaining({ name: "StrictJsonError", code, pointer }),
  );
}

test("parses JSON values and builds null-prototype objects at every depth", () => {
  const result = parseStrictJson(
    ' \t\r\n{"":[],"toString":{},"items":[null,true,false,-0,12.5e-2,1E+308,{"hasOwnProperty":1}]}\n',
  );
  expect(result).toEqual({
    "": [],
    toString: {},
    items: [null, true, false, -0, 0.125, 1e308, { hasOwnProperty: 1 }],
  });
  expect(Object.getPrototypeOf(result)).toBeNull();
  expect(Object.getPrototypeOf(result.toString)).toBeNull();
  expect(Object.getPrototypeOf(result.items[6])).toBeNull();
  expect(Object.is(result.items[3], -0)).toBe(true);
  expect(parseStrictJson("true")).toBe(true);
  expect(parseStrictJson("42")).toBe(42);
});

test("decodes JSON escapes without normalizing distinct keys or rejecting string values", () => {
  const text = String.raw`["\"\\\/\b\f\n\r\t\u0041\u00e9\uD83D\uDE00\ud800","__proto__","constructor","prototype",{"é":1,"e\u0301":2}]`;
  expect(parseStrictJson(text)).toEqual([
    '"\\/\b\f\n\r\tAé😀\ud800',
    "__proto__",
    "constructor",
    "prototype",
    { é: 1, "e\u0301": 2 },
  ]);
});

test("rejects duplicate decoded keys only within the same object", () => {
  expectError('{"item":1,"item":2}', "CFG_DUPLICATE_KEY");
  expectError(
    String.raw`[{"item":1,"\u0069tem":2}]`,
    "CFG_DUPLICATE_KEY",
    "/0",
  );
  expectError(String.raw`{"😀":1,"\ud83d\ude00":2}`, "CFG_DUPLICATE_KEY");
  expect(parseStrictJson('[{"item":1},{"item":2}]')).toEqual([
    { item: 1 },
    { item: 2 },
  ]);
});

test.each(["__proto__", "constructor", "prototype"])(
  "rejects the forbidden key %s",
  (key) => {
    expectError(`[{"${key}":null}]`, "CFG_FORBIDDEN_KEY", "/0");
  },
);

test("rejects a forbidden key after escape decoding inside nested objects", () => {
  expectError(
    String.raw`{"group":[{"pr\u006ftotype":0}]}`,
    "CFG_FORBIDDEN_KEY",
  );
});

test("errors expose only a fixed message and the nearest safe pointer prefix", () => {
  function getError(text) {
    try {
      parseStrictJson(text);
    } catch (error) {
      expect(error).toBeInstanceOf(StrictJsonError);
      return error;
    }
    throw new Error("Expected a strict JSON error.");
  }

  const first = getError(
    '[0,{"synthetic/key~":[{"sample":"synthetic value","sample":0}]}]',
  );
  const second = getError('[0,{"different":[{"other":1,"other":2}]}]');
  expect(first).toMatchObject({
    code: "CFG_DUPLICATE_KEY",
    pointer: "/1",
    message: "Duplicate JSON object key.",
  });
  expect(second).toMatchObject({
    code: first.code,
    pointer: first.pointer,
    message: first.message,
  });
  expect(first.cause).toBeUndefined();
  expectError('[{"synthetic/key~":"\\q"}]', "CFG_INVALID_JSON", "/0");
});

test.each([
  "",
  " \t\r\n",
  "\ufeff{}",
  "\u00a0null",
  "// comment\n{}",
  "{'key':0}",
  '{"key" 0}',
  '{"key":0,}',
  '{"key":0 "other":1}',
  "[1,]",
  "[,1]",
  "[1 2]",
  "[1",
  "true false",
  "nul",
  "falsex",
  '"unterminated',
  '"ends with a backslash\\',
  '"raw\nnewline"',
  '"raw\u0000control"',
  String.raw`"\x41"`,
  String.raw`"\u12g4"`,
  String.raw`"\u123"`,
  "-",
  "+1",
  "01",
  "-01",
  ".5",
  "1.",
  "1e",
  "1e+-2",
  "0x10",
  "NaN",
  "Infinity",
  "1e309",
  "-1e309",
])("rejects invalid JSON or numbers outside the finite range: %j", (text) => {
  expect(() => parseStrictJson(text)).toThrow(
    expect.objectContaining({
      code: "CFG_INVALID_JSON",
      message: "Invalid JSON.",
    }),
  );
});

test("permits 64 mixed containers and rejects the 65th before descending", () => {
  const prefix = '[{"item":'.repeat(32);
  const suffix = "}]".repeat(32);
  expect(() => parseStrictJson(`${prefix}0${suffix}`)).not.toThrow();
  expectError(`${prefix}[]${suffix}`, "CFG_LIMIT_EXCEEDED", "/0");
  expectError(
    `[${"[".repeat(64)}${"]".repeat(65)}`,
    "CFG_LIMIT_EXCEEDED",
    "/0".repeat(64),
  );
});
