type StrictJsonErrorCode =
  | "CFG_INVALID_JSON"
  | "CFG_DUPLICATE_KEY"
  | "CFG_FORBIDDEN_KEY"
  | "CFG_LIMIT_EXCEEDED";

const messages: Record<StrictJsonErrorCode, string> = {
  CFG_INVALID_JSON: "Invalid JSON.",
  CFG_DUPLICATE_KEY: "Duplicate JSON object key.",
  CFG_FORBIDDEN_KEY: "Forbidden JSON object key.",
  CFG_LIMIT_EXCEEDED: "JSON nesting limit exceeded.",
};

const MAX_NESTING = 64;
const forbiddenKeys = new Set(["__proto__", "constructor", "prototype"]);
const simpleEscapes = new Map([
  ['"', '"'],
  ["\\", "\\"],
  ["/", "/"],
  ["b", "\b"],
  ["f", "\f"],
  ["n", "\n"],
  ["r", "\r"],
  ["t", "\t"],
]);

export class StrictJsonError extends Error {
  constructor(
    readonly code: StrictJsonErrorCode,
    readonly pointer: string,
  ) {
    super(messages[code]);
    this.name = "StrictJsonError";
  }
}

/** Parses JSON with at most 64 enclosing objects or arrays (a root container counts as one). */
export function parseStrictJson(text: string): unknown {
  let cursor = 0;
  const path: (number | null)[] = [];

  function fail(code: StrictJsonErrorCode = "CFG_INVALID_JSON"): never {
    // Before schema validation, no object member name is safe to report.
    // Keep only the array-index prefix; an empty pointer denotes the root.
    let pointer = "";
    for (const index of path) {
      if (index === null) break;
      pointer += `/${index}`;
    }
    throw new StrictJsonError(code, pointer);
  }

  function take(char: string): boolean {
    if (text[cursor] !== char) return false;
    cursor++;
    return true;
  }

  function skipWhitespace(): void {
    while (true) {
      const char = text[cursor];
      if (char !== " " && char !== "\t" && char !== "\r" && char !== "\n")
        return;
      cursor++;
    }
  }

  function readEscape(): string {
    const char = text[cursor++];
    if (char !== "u") return simpleEscapes.get(char) ?? fail();

    let value = 0;
    for (let i = 0; i < 4; i++) {
      const digit = text.charCodeAt(cursor++);
      value *= 16;
      if (digit >= 48 && digit <= 57) value += digit - 48;
      else if (digit >= 65 && digit <= 70) value += digit - 55;
      else if (digit >= 97 && digit <= 102) value += digit - 87;
      else fail();
    }
    return String.fromCharCode(value);
  }

  function readString(): string {
    if (!take('"')) fail();
    const chunks: string[] = [];
    let start = cursor;

    while (cursor < text.length) {
      const char = text[cursor++];
      if (char === '"') {
        const last = text.slice(start, cursor - 1);
        if (chunks.length === 0) return last;
        chunks.push(last);
        return chunks.join("");
      }
      if (char === "\\") {
        chunks.push(text.slice(start, cursor - 1), readEscape());
        start = cursor;
      } else if (char.charCodeAt(0) < 0x20) {
        fail();
      }
    }
    return fail();
  }

  function takeDigits(): boolean {
    const start = cursor;
    while (text[cursor] >= "0" && text[cursor] <= "9") cursor++;
    return cursor > start;
  }

  function readNumber(): number {
    const start = cursor;
    take("-");
    if (!take("0") && !takeDigits()) fail();
    if (take(".") && !takeDigits()) fail();
    if (take("e") || take("E")) {
      if (!take("+")) take("-");
      if (!takeDigits()) fail();
    }

    const token = text.slice(start, cursor);
    const value = Number(token);
    if (!Number.isFinite(value)) fail();
    if (Number.isInteger(value) && /[.eE]/u.test(token)) {
      // An authored fraction that rounds to an integer must not pass schema integer checks.
      const [coefficient, exponent = "0"] = token.split(/[eE]/u);
      const [whole, fraction = ""] = coefficient.split(".");
      const digits = whole + fraction;
      if (/[1-9]/u.test(digits)) {
        let end = digits.length;
        while (digits[end - 1] === "0") end--;
        const trailingZeros = digits.length - end;
        if (fraction.length - Number(exponent) > trailingZeros) fail();
      }
    }
    return value;
  }

  function readLiteral<T>(token: string, value: T): T {
    if (!text.startsWith(token, cursor)) fail();
    cursor += token.length;
    return value;
  }

  function readObject(): Record<string, unknown> {
    const object: Record<string, unknown> = Object.create(null);
    skipWhitespace();
    if (take("}")) return object;

    while (true) {
      const key = readString();
      if (forbiddenKeys.has(key)) fail("CFG_FORBIDDEN_KEY");
      if (Object.hasOwn(object, key)) fail("CFG_DUPLICATE_KEY");
      skipWhitespace();
      if (!take(":")) fail();

      path.push(null);
      object[key] = readValue();
      path.pop();

      skipWhitespace();
      if (take("}")) return object;
      if (!take(",")) fail();
      skipWhitespace();
    }
  }

  function readArray(): unknown[] {
    const array: unknown[] = [];
    skipWhitespace();
    if (take("]")) return array;

    while (true) {
      path.push(array.length);
      array.push(readValue());
      path.pop();

      skipWhitespace();
      if (take("]")) return array;
      if (!take(",")) fail();
    }
  }

  function readValue(): unknown {
    skipWhitespace();
    switch (text[cursor]) {
      case "{":
      case "[":
        if (path.length >= MAX_NESTING) fail("CFG_LIMIT_EXCEEDED");
        return text[cursor++] === "{" ? readObject() : readArray();
      case '"':
        return readString();
      case "t":
        return readLiteral("true", true);
      case "f":
        return readLiteral("false", false);
      case "n":
        return readLiteral("null", null);
      default:
        return readNumber();
    }
  }

  const value = readValue();
  skipWhitespace();
  if (cursor !== text.length) fail();
  return value;
}
