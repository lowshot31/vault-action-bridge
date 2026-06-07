const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildChatGptPrompt,
  DEFAULT_PROMPT_TEMPLATE,
  formatChatHistory,
} = require("../lib/context-builder");

test("buildChatGptPrompt includes file path and note content", () => {
  const prompt = buildChatGptPrompt({
    filePath: "Inbox/today.md",
    content: "# Today\nship plugin",
  });

  assert.match(prompt, /Inbox\/today\.md/);
  assert.match(prompt, /# Today/);
  assert.match(prompt, /ship plugin/);
});

test("buildChatGptPrompt prefers selected text when provided", () => {
  const prompt = buildChatGptPrompt({
    filePath: "Inbox/today.md",
    content: "# Today\nship plugin",
    selectedText: "ship plugin",
  });

  assert.doesNotMatch(prompt, /# Today/);
  assert.match(prompt, /ship plugin/);
});

test("buildChatGptPrompt applies custom template", () => {
  const prompt = buildChatGptPrompt({
    filePath: "Inbox/today.md",
    content: "body",
    template: "PATH={{filePath}}\nBODY={{content}}",
  });

  assert.equal(prompt, "PATH=Inbox/today.md\nBODY=body");
});

test("default template keeps user-facing context block labels", () => {
  assert.match(DEFAULT_PROMPT_TEMPLATE, /File:/);
  assert.match(DEFAULT_PROMPT_TEMPLATE, /Content:/);
});

test("formatChatHistory includes recent user and assistant messages", () => {
  const history = formatChatHistory([
    { role: "user", content: "백룸에 대해 알려줘" },
    { role: "assistant", content: "1. 요약\n2. 분위기 설명\n3. 백룸 정리 문서 작성" },
  ]);

  assert.match(history, /Previous conversation:/);
  assert.match(history, /User: 백룸에 대해 알려줘/);
  assert.match(history, /Assistant: 1\. 요약/);
  assert.match(history, /3\. 백룸 정리 문서 작성/);
});

test("formatChatHistory keeps only the most recent messages", () => {
  const history = formatChatHistory([
    { role: "user", content: "old" },
    { role: "assistant", content: "older" },
    { role: "user", content: "recent user" },
    { role: "assistant", content: "recent assistant" },
  ], 2);

  assert.doesNotMatch(history, /old/);
  assert.match(history, /recent user/);
  assert.match(history, /recent assistant/);
});
