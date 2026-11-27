import { expect, test } from "vitest";
import * as core from "../src/index.ts";

test("the bootstrap entry point exposes no product API", () => {
  expect(Object.keys(core)).toEqual([]);
});
