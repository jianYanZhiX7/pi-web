import test from "node:test";
import assert from "node:assert/strict";
import { displayModelName } from "./model-display-name.ts";

test("drops the vendor suffix a models.json name carries", () => {
  assert.equal(displayModelName("DeepSeek-V4.1-Flash · WorkBuddy"), "DeepSeek-V4.1-Flash");
  assert.equal(displayModelName("GLM-5.3 · routing group"), "GLM-5.3");
  assert.equal(displayModelName("Qwen 3.8-Max · JoyCode"), "Qwen 3.8-Max");
});

test("cuts at the first separator only", () => {
  assert.equal(displayModelName("Kimi-K3.1 · JoyCode · jcloud"), "Kimi-K3.1");
});

test("keeps a name without a suffix, and without a usable prefix", () => {
  assert.equal(displayModelName("Claude Sonnet 4.6"), "Claude Sonnet 4.6");
  assert.equal(displayModelName(" · orphan"), " · orphan");
  assert.equal(displayModelName("a·b"), "a·b");
});
