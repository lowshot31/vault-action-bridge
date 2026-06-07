const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildInjectionScript,
  normalizeInjectionError,
} = require("../lib/webview-bridge");

test("buildInjectionScript embeds escaped prompt content", () => {
  const script = buildInjectionScript("hello `world`");
  assert.match(script, /hello \\`world\\`/);
  assert.match(script, /composer selectors/);
});

test("normalizeInjectionError returns a user-safe selector failure", () => {
  const message = normalizeInjectionError(new Error("ChatGPT composer not found"));
  assert.match(message, /ChatGPT input box/);
});
