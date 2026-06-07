const test = require("node:test");
const assert = require("node:assert/strict");

const { AI_WEB_APPS, API_PROVIDER_PRESETS, DEFAULT_SETTINGS, VIEW_TYPE_AI_WEBAPP } = require("../lib/constants");
const fs = require("node:fs");
const path = require("node:path");

test("default settings open the bridge view on startup", () => {
  assert.equal(DEFAULT_SETTINGS.openViewOnStartup, true);
});

test("default settings keep provider model option caches empty", () => {
  assert.deepEqual(DEFAULT_SETTINGS.oauthModelOptions, []);
  assert.deepEqual(DEFAULT_SETTINGS.apiModelOptions, []);
});

test("default settings use automatic UI language", () => {
  assert.equal(DEFAULT_SETTINGS.uiLanguage, "auto");
});

test("default settings do not include experimental local sync settings", () => {
  assert.equal(Object.hasOwn(DEFAULT_SETTINGS, "sync" + "Enabled"), false);
  assert.equal(Object.hasOwn(DEFAULT_SETTINGS, "server" + "Url"), false);
  assert.equal(Object.hasOwn(DEFAULT_SETTINGS, "server" + "Token"), false);
});

test("main plugin includes localized UI label keys for the bridge panel", () => {
  const mainSource = fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8");

  assert.match(mainSource, /askCurrentNote:/);
  assert.match(mainSource, /inputPlaceholder:/);
  assert.match(mainSource, /uiLanguageName:/);
});

test("main plugin exposes an explicit openai-oauth setup terminal launcher", () => {
  const mainSource = fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8");

  assert.match(mainSource, /getPlatformLabel/);
  assert.match(mainSource, /detectedOsName/);
  assert.match(mainSource, /openNodeJsInstallTerminal/);
  assert.match(mainSource, /winget install -e --id OpenJS\.NodeJS\.LTS/);
  assert.match(mainSource, /brew install node/);
  assert.match(mainSource, /sudo apt-get update/);
  assert.match(mainSource, /Get-Command codex/);
  assert.match(mainSource, /npm install -g @openai\/codex/);
  assert.match(mainSource, /Get-Command openai-oauth/);
  assert.match(mainSource, /npm install -g openai-oauth/);
  assert.match(mainSource, /openOpenAiOauthSetupTerminal/);
  assert.match(mainSource, /npx @openai\/codex login/);
  assert.match(mainSource, /npx openai-oauth/);
});

test("manifest is shaped for Obsidian community submission", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "manifest.json"), "utf8"));

  assert.equal(manifest.id, "vault-pilot");
  assert.equal(manifest.name, "Vault Pilot");
  assert.doesNotMatch(manifest.id, /obsidian/i);
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.equal(typeof manifest.isDesktopOnly, "boolean");
});

test("release documentation files are present", () => {
  assert.equal(fs.existsSync(path.join(__dirname, "..", "README.md")), true);
  assert.equal(fs.existsSync(path.join(__dirname, "..", "CONTRIBUTING.md")), true);
  assert.equal(fs.existsSync(path.join(__dirname, "..", "LICENSE")), true);
  assert.equal(fs.existsSync(path.join(__dirname, "..", "SECURITY.md")), true);
  assert.equal(fs.existsSync(path.join(__dirname, "..", "docs", "ARCHITECTURE.md")), true);
  assert.equal(fs.existsSync(path.join(__dirname, "..", "docs", "RELEASE.md")), true);
  assert.equal(fs.existsSync(path.join(__dirname, "..", ".github", "ISSUE_TEMPLATE", "bug_report.md")), true);
  assert.equal(fs.existsSync(path.join(__dirname, "..", ".github", "ISSUE_TEMPLATE", "feature_request.md")), true);
  assert.equal(fs.existsSync(path.join(__dirname, "..", ".github", "PULL_REQUEST_TEMPLATE.md")), true);
  assert.equal(fs.existsSync(path.join(__dirname, "..", ".github", "workflows", "test.yml")), true);
  assert.equal(fs.existsSync(path.join(__dirname, "..", "scripts", "release-check.js")), true);
});

test("GitHub templates request provider and safety context", () => {
  const bugReport = fs.readFileSync(path.join(__dirname, "..", ".github", "ISSUE_TEMPLATE", "bug_report.md"), "utf8");
  const featureRequest = fs.readFileSync(path.join(__dirname, "..", ".github", "ISSUE_TEMPLATE", "feature_request.md"), "utf8");
  const pullRequest = fs.readFileSync(path.join(__dirname, "..", ".github", "PULL_REQUEST_TEMPLATE.md"), "utf8");
  const experimentalSyncPattern = new RegExp(["self-" + "host sync", "M" + "CP server"].join("|"), "i");

  assert.match(bugReport, /Connection mode/);
  assert.match(featureRequest, /Provider Or Vault Impact/);
  assert.match(featureRequest, /Safety And Privacy Notes/);
  assert.match(pullRequest, /AI-suggested vault writes still require user review/);
  assert.doesNotMatch(bugReport, experimentalSyncPattern);
  assert.doesNotMatch(featureRequest, experimentalSyncPattern);
  assert.doesNotMatch(pullRequest, experimentalSyncPattern);
});

test("README discloses provider network use and setup commands", () => {
  const readme = fs.readFileSync(path.join(__dirname, "..", "README.md"), "utf8");

  for (const providerName of [
    "ChatGPT subscription",
    "OpenAI",
    "Anthropic Claude",
    "OpenRouter",
    "Groq",
    "Gemini API",
    "DeepSeek",
    "Ollama / local",
    "Custom OpenAI-compatible endpoint",
  ]) {
    assert.match(readme, new RegExp(providerName.replace("/", "\\/")));
  }
  assert.match(readme, /Supported Connections/);
  assert.match(readme, /Anthropic Messages API/);
  assert.match(readme, /OpenAI-compatible providers use/);
  assert.match(readme, /visible terminal buttons/);
  assert.match(readme, /does not include client-side telemetry/);
  assert.match(readme, /SECURITY\.md/);
  assert.match(readme, /docs\/ARCHITECTURE\.md/);
  assert.match(readme, /CONTRIBUTING\.md/);
  assert.match(readme, /Release guide/);
  assert.match(readme, /npm run verify/);
  assert.doesNotMatch(readme, new RegExp(["self-" + "host sync", "M" + "CP server"].join("|"), "i"));
});

test("localized READMEs list every supported connection", () => {
  const localizedReadmes = [
    {
      path: "ko/README.ko.md",
      headingPattern: /## 지원 연결/,
      presetLabelPattern: /API 키 프리셋/,
    },
    {
      path: "ja/README.ja.md",
      headingPattern: /## サポートする接続/,
      presetLabelPattern: /APIキープリセット/,
    },
  ];

  for (const { path: relativePath, headingPattern, presetLabelPattern } of localizedReadmes) {
    const readme = fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8");

    assert.match(readme, headingPattern);
    assert.match(readme, presetLabelPattern);
    assert.match(readme, /Providers-openai--oauth%20%7C%20OpenAI%20%7C%20Anthropic%20%7C%20OpenRouter%20%7C%20Groq%20%7C%20Gemini%20%7C%20DeepSeek%20%7C%20Ollama-orange/);

    for (const providerName of [
      "ChatGPT",
      "openai-oauth",
      "OpenAI",
      "Anthropic Claude",
      "OpenRouter",
      "Groq",
      "Gemini API",
      "DeepSeek",
      "Ollama / local",
      "Custom OpenAI-compatible endpoint",
    ]) {
      assert.match(readme, new RegExp(providerName.replace("/", "\\/")), `${relativePath} should mention ${providerName}`);
    }
  }
});

test("architecture and contribution docs explain extension points", () => {
  const architecture = fs.readFileSync(path.join(__dirname, "..", "docs", "ARCHITECTURE.md"), "utf8");
  const contributing = fs.readFileSync(path.join(__dirname, "..", "CONTRIBUTING.md"), "utf8");

  assert.match(architecture, /Model API Layer/);
  assert.match(architecture, /Vault Action Layer/);
  assert.match(contributing, /Provider or model changes/);
  assert.match(contributing, /Vault action changes/);
  assert.match(contributing, /Privacy or network changes/);
  const experimentalSyncPattern = new RegExp(["Self-" + "host Sync Layer", "Self-" + "host sync changes", "M" + "CP server"].join("|"), "i");
  assert.doesNotMatch(architecture, experimentalSyncPattern);
  assert.doesNotMatch(contributing, experimentalSyncPattern);
});

test("package scripts include test and release verification", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"));

  assert.equal(packageJson.scripts.test, "node --test tests/*.test.js");
  assert.equal(packageJson.scripts["release:check"], "node scripts/release-check.js");
  assert.equal(packageJson.scripts.verify, "npm test && npm run release:check");
});

test("commands use provider-neutral ask action names", () => {
  const mainSource = fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8");

  assert.match(mainSource, /id: "ask-current-note"/);
  assert.match(mainSource, /id: "ask-selected-text"/);
  assert.doesNotMatch(mainSource, /id: "send-current-note-to-chatgpt"/);
  assert.doesNotMatch(mainSource, /name: "Ask ChatGPT about current note"/);
});

test("AI web apps include ChatGPT, Claude, and Gemini targets", () => {
  assert.equal(VIEW_TYPE_AI_WEBAPP, "vault-pilot-ai-webapp-view");
  assert.equal(AI_WEB_APPS.chatgpt.url, "https://chatgpt.com/");
  assert.equal(AI_WEB_APPS.claude.url, "https://claude.ai/new");
  assert.equal(AI_WEB_APPS.gemini.url, "https://gemini.google.com/app");
});

test("API provider presets include common OpenAI-compatible services", () => {
  assert.equal(DEFAULT_SETTINGS.apiProviderPreset, "openai");
  assert.equal(API_PROVIDER_PRESETS.anthropic.baseUrl, "https://api.anthropic.com/v1");
  assert.equal(API_PROVIDER_PRESETS.anthropic.type, "anthropic");
  assert.equal(API_PROVIDER_PRESETS.anthropic.model, "claude-sonnet-4-20250514");
  assert.equal(API_PROVIDER_PRESETS.openrouter.baseUrl, "https://openrouter.ai/api/v1");
  assert.equal(API_PROVIDER_PRESETS.groq.baseUrl, "https://api.groq.com/openai/v1");
  assert.equal(API_PROVIDER_PRESETS.gemini.baseUrl, "https://generativelanguage.googleapis.com/v1beta/openai");
  assert.equal(API_PROVIDER_PRESETS.deepseek.baseUrl, "https://api.deepseek.com");
  assert.equal(API_PROVIDER_PRESETS.ollama.baseUrl, "http://127.0.0.1:11434/v1");
});
