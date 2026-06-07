const test = require("node:test");
const assert = require("node:assert/strict");

const {
  executeVaultAction,
  executeVaultActions,
  extractVaultActionJsonFromModelAnswer,
  hasVaultWriteIntent,
  buildAppendCurrentNoteActionJson,
  summarizeVaultActions,
  parseVaultActionJson,
  stripVaultActionJsonFromModelAnswer,
} = require("../lib/vault-actions");

function createFakeVault() {
  const files = new Map();
  const folders = [];
  const processedFiles = [];

  return {
    files,
    folders,
    processedFiles,
    vault: {
      getAbstractFileByPath(path) {
        if (!files.has(path)) {
          return null;
        }
        return { path, extension: "md" };
      },
      async create(path, content) {
        files.set(path, content);
        return { path };
      },
      async modify(file, content) {
        files.set(file.path, content);
        return file;
      },
      async process(file, callback) {
        processedFiles.push(file.path);
        const nextContent = callback(files.get(file.path));
        files.set(file.path, nextContent);
        return nextContent;
      },
      async read(file) {
        return files.get(file.path);
      },
      async createFolder(path) {
        folders.push(path);
      },
      adapter: {
        async mkdir(path) {
          folders.push(`adapter:${path}`);
        },
      },
    },
  };
}

test("executeVaultAction creates a new note", async () => {
  const fake = createFakeVault();

  const result = await executeVaultAction(fake.vault, {
    action: "create_note",
    path: "Inbox/idea.md",
    content: "# Idea",
  });

  assert.deepEqual(result, {
    ok: true,
    action: "create_note",
    path: "Inbox/idea.md",
  });
  assert.equal(fake.files.get("Inbox/idea.md"), "# Idea");
});

test("executeVaultAction modifies an existing note", async () => {
  const fake = createFakeVault();
  fake.files.set("Inbox/idea.md", "old");

  await executeVaultAction(fake.vault, {
    action: "modify_note",
    path: "Inbox/idea.md",
    content: "new",
  });

  assert.equal(fake.files.get("Inbox/idea.md"), "new");
  assert.deepEqual(fake.processedFiles, ["Inbox/idea.md"]);
});

test("executeVaultAction creates a folder through the Vault API", async () => {
  const fake = createFakeVault();

  await executeVaultAction(fake.vault, {
    action: "create_folder",
    path: "Projects/New Project",
  });

  assert.deepEqual(fake.folders, ["Projects/New Project"]);
});

test("executeVaultAction appends content to an existing note", async () => {
  const fake = createFakeVault();
  fake.files.set("Inbox/idea.md", "old");

  await executeVaultAction(fake.vault, {
    action: "append_note",
    path: "Inbox/idea.md",
    content: "new",
  });

  assert.equal(fake.files.get("Inbox/idea.md"), "old\n\nnew");
  assert.deepEqual(fake.processedFiles, ["Inbox/idea.md"]);
});

test("executeVaultAction rejects absolute paths", async () => {
  const fake = createFakeVault();

  await assert.rejects(
    executeVaultAction(fake.vault, {
      action: "create_note",
      path: "C:/Users/lowshot/secret.md",
      content: "nope",
    }),
    /vault-relative path/,
  );
});

test("parseVaultActionJson accepts fenced JSON with a single action", () => {
  const actions = parseVaultActionJson([
    "```json",
    "{",
    '  "action": "create_note",',
    '  "path": "Inbox/idea.md",',
    '  "content": "hello"',
    "}",
    "```",
  ].join("\n"));

  assert.deepEqual(actions, [
    {
      action: "create_note",
      path: "Inbox/idea.md",
      content: "hello",
    },
  ]);
});

test("parseVaultActionJson accepts an actions array payload", () => {
  const actions = parseVaultActionJson(JSON.stringify({
    actions: [
      { action: "create_folder", path: "Projects/New Project" },
      { action: "create_note", path: "Projects/New Project/index.md", content: "hello" },
    ],
  }));

  assert.equal(actions.length, 2);
  assert.equal(actions[0].action, "create_folder");
  assert.equal(actions[1].path, "Projects/New Project/index.md");
});

test("executeVaultActions runs multiple actions in order", async () => {
  const fake = createFakeVault();

  const results = await executeVaultActions(fake.vault, [
    { action: "create_note", path: "Inbox/idea.md", content: "old" },
    { action: "append_note", path: "Inbox/idea.md", content: "new" },
  ]);

  assert.equal(fake.files.get("Inbox/idea.md"), "old\n\nnew");
  assert.deepEqual(results.map((result) => result.action), ["create_note", "append_note"]);
});

test("extractVaultActionJsonFromModelAnswer detects a full JSON answer", () => {
  const json = JSON.stringify({
    actions: [
      { action: "create_note", path: "Inbox/generated.md", content: "hello" },
    ],
  });

  assert.equal(extractVaultActionJsonFromModelAnswer(json), json);
});

test("extractVaultActionJsonFromModelAnswer detects a fenced vault action block", () => {
  const answer = [
    "작성 가능한 작업을 준비했습니다.",
    "",
    "```json",
    "{",
    '  "actions": [',
    '    { "action": "append_note", "path": "Inbox/generated.md", "content": "hello" }',
    "  ]",
    "}",
    "```",
  ].join("\n");

  const extracted = extractVaultActionJsonFromModelAnswer(answer);
  assert.match(extracted, /append_note/);
  assert.match(extracted, /Inbox\/generated\.md/);
});

test("extractVaultActionJsonFromModelAnswer accepts type as an action alias", () => {
  const answer = [
    "확인해 주세요.",
    "```json",
    "{",
    '  "actions": [',
    '    { "type": "append_note", "path": "Inbox/generated.md", "content": "hello" }',
    "  ]",
    "}",
    "```",
  ].join("\n");

  const extracted = extractVaultActionJsonFromModelAnswer(answer);
  assert.match(extracted, /append_note/);
});

test("extractVaultActionJsonFromModelAnswer ignores unrelated JSON", () => {
  const answer = [
    "Example:",
    "```json",
    "{ \"theme\": \"dark\", \"enabled\": true }",
    "```",
  ].join("\n");

  assert.equal(extractVaultActionJsonFromModelAnswer(answer), null);
});

test("extractVaultActionJsonFromModelAnswer ignores malformed JSON", () => {
  assert.equal(extractVaultActionJsonFromModelAnswer("```json\n{ nope\n```"), null);
});

test("stripVaultActionJsonFromModelAnswer hides vault action JSON from chat display", () => {
  const answer = [
    "확인용으로 작업을 준비했습니다.",
    "",
    "```json",
    "{",
    '  "actions": [',
    '    { "type": "append_note", "path": "Inbox/generated.md", "content": "hello" }',
    "  ]",
    "}",
    "```",
  ].join("\n");

  assert.equal(stripVaultActionJsonFromModelAnswer(answer), "확인용으로 작업을 준비했습니다.");
});

test("stripVaultActionJsonFromModelAnswer keeps ordinary JSON examples visible", () => {
  const answer = [
    "Example:",
    "```json",
    "{ \"theme\": \"dark\" }",
    "```",
  ].join("\n");

  assert.equal(stripVaultActionJsonFromModelAnswer(answer), answer);
});

test("stripVaultActionJsonFromModelAnswer hides an unclosed vault action JSON fence", () => {
  const answer = [
    "검토 후 적용할 변경안을 만들었습니다.",
    "```json",
    '{"actions":[{"action":"create_note","path":"백룸/index.md","content":"# 백룸"}]}',
  ].join("\n");

  assert.equal(stripVaultActionJsonFromModelAnswer(answer), "검토 후 적용할 변경안을 만들었습니다.");
});

test("hasVaultWriteIntent detects Korean and English write requests", () => {
  assert.equal(hasVaultWriteIntent("현재 파일에 작성해줘"), true);
  assert.equal(hasVaultWriteIntent("append this to the current note"), true);
  assert.equal(hasVaultWriteIntent("save this into my note"), true);
  assert.equal(hasVaultWriteIntent("백룸에 대해 설명해줘"), false);
});

test("buildAppendCurrentNoteActionJson creates an editable append fallback", () => {
  const json = buildAppendCurrentNoteActionJson({
    path: "Projects/Data Pump/index.md",
    content: "세계관 핵심 요약입니다.",
  });
  const actions = parseVaultActionJson(json);

  assert.deepEqual(actions, [
    {
      action: "append_note",
      path: "Projects/Data Pump/index.md",
      content: "\n\n세계관 핵심 요약입니다.",
    },
  ]);
});

test("summarizeVaultActions returns user-friendly action summaries", () => {
  const summary = summarizeVaultActions([
    { action: "create_folder", path: "Projects/Data Pump/백룸" },
    { action: "create_note", path: "Projects/Data Pump/백룸/index.md", content: "# 백룸 조사\n본문" },
    { action: "append_note", path: "Daily/today.md", content: "추가 내용입니다." },
  ]);

  assert.deepEqual(summary, [
    {
      label: "Create folder",
      path: "Projects/Data Pump/백룸",
      detail: "",
      risk: "low",
    },
    {
      label: "Create note",
      path: "Projects/Data Pump/백룸/index.md",
      detail: "# 백룸 조사",
      risk: "low",
    },
    {
      label: "Append to note",
      path: "Daily/today.md",
      detail: "추가 내용입니다.",
      risk: "low",
    },
  ]);
});

test("summarizeVaultActions marks full note replacement as high risk", () => {
  const summary = summarizeVaultActions([
    { action: "modify_note", path: "Daily/today.md", content: "# New content" },
  ]);

  assert.deepEqual(summary, [
    {
      label: "Replace note",
      path: "Daily/today.md",
      detail: "# New content",
      risk: "high",
    },
  ]);
});
