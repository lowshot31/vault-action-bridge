const test = require("node:test");
const assert = require("node:assert/strict");

const { isMarkdownView, selectMarkdownView } = require("../lib/obsidian-view-utils");

test("isMarkdownView detects views with editor and file", () => {
  assert.equal(isMarkdownView({ editor: {}, file: {} }), true);
  assert.equal(isMarkdownView({ editor: {} }), false);
  assert.equal(isMarkdownView(null), false);
});

test("selectMarkdownView prefers the active markdown view", () => {
  const activeView = { editor: {}, file: { path: "active.md" } };
  const fallbackView = { editor: {}, file: { path: "fallback.md" } };

  assert.equal(selectMarkdownView({
    activeView,
    markdownLeaves: [{ view: fallbackView }],
  }), activeView);
});

test("selectMarkdownView falls back to visible markdown leaves", () => {
  const fallbackView = { editor: {}, file: { path: "fallback.md" } };

  assert.equal(selectMarkdownView({
    activeView: { notMarkdown: true },
    markdownLeaves: [{ view: fallbackView }],
  }), fallbackView);
});
