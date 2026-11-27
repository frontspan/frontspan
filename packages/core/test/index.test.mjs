import { expect, test } from "vitest";
import * as core from "../src/index.ts";

test("the type-only entry point exposes no Node loader", () => {
  expect(Object.keys(core)).toEqual([]);
});
