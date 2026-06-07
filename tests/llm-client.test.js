const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildChatCompletionRequest,
  buildModelsRequest,
  createRequestUrlFetch,
  createProviderConfig,
  normalizeLlmSettings,
  parseChatCompletionResponse,
} = require("../lib/llm-client");

test("createProviderConfig uses openai-oauth local proxy without an api key", () => {
  const config = createProviderConfig({
    provider: "openai-oauth",
    oauthBaseUrl: "http://127.0.0.1:10531/v1",
    oauthModel: "gpt-5.4",
  });

  assert.equal(config.baseUrl, "http://127.0.0.1:10531/v1");
  assert.equal(config.model, "gpt-5.4");
  assert.equal(config.requiresApiKey, false);
  assert.equal(config.apiKey, "");
});

test("createProviderConfig requires api key for openai-compatible providers", () => {
  const config = createProviderConfig({
    provider: "openai-compatible",
    apiProviderType: "openai-compatible",
    apiBaseUrl: "https://api.openai.com/v1",
    apiModel: "gpt-4.1-mini",
    apiKey: "sk-test",
  });

  assert.equal(config.providerType, "openai-compatible");
  assert.equal(config.baseUrl, "https://api.openai.com/v1");
  assert.equal(config.model, "gpt-4.1-mini");
  assert.equal(config.requiresApiKey, true);
  assert.equal(config.apiKey, "sk-test");
});

test("createProviderConfig allows Ollama local provider without an api key", () => {
  const config = createProviderConfig({
    provider: "openai-compatible",
    apiProviderPreset: "ollama",
    apiProviderType: "openai-compatible",
    apiBaseUrl: "http://127.0.0.1:11434/v1",
    apiModel: "llama3.1",
    apiKey: "",
  });

  assert.equal(config.providerType, "openai-compatible");
  assert.equal(config.baseUrl, "http://127.0.0.1:11434/v1");
  assert.equal(config.model, "llama3.1");
  assert.equal(config.requiresApiKey, false);
  assert.equal(config.apiKey, "");
});

test("createProviderConfig supports Anthropic direct API providers", () => {
  const config = createProviderConfig({
    provider: "openai-compatible",
    apiProviderType: "anthropic",
    apiBaseUrl: "https://api.anthropic.com/v1",
    apiModel: "claude-sonnet-4-20250514",
    apiKey: "sk-ant-test",
  });

  assert.equal(config.providerType, "anthropic");
  assert.equal(config.baseUrl, "https://api.anthropic.com/v1");
  assert.equal(config.model, "claude-sonnet-4-20250514");
  assert.equal(config.requiresApiKey, true);
  assert.equal(config.apiKey, "sk-ant-test");
});

test("buildChatCompletionRequest includes authorization only when api key is present", () => {
  const oauthRequest = buildChatCompletionRequest({
    baseUrl: "http://127.0.0.1:10531/v1",
    model: "gpt-5.4",
    apiKey: "",
    messages: [{ role: "user", content: "hello" }],
  });

  assert.equal(oauthRequest.url, "http://127.0.0.1:10531/v1/chat/completions");
  assert.equal(oauthRequest.options.headers.authorization, undefined);

  const apiRequest = buildChatCompletionRequest({
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4.1-mini",
    apiKey: "sk-test",
    messages: [{ role: "user", content: "hello" }],
  });

  assert.equal(apiRequest.options.headers.authorization, "Bearer sk-test");
});

test("buildChatCompletionRequest builds Anthropic messages API requests", () => {
  const request = buildChatCompletionRequest({
    providerType: "anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    model: "claude-sonnet-4-20250514",
    apiKey: "sk-ant-test",
    messages: [
      { role: "system", content: "Be useful." },
      { role: "user", content: "hello" },
    ],
    temperature: 0.3,
  });

  const body = JSON.parse(request.options.body);
  assert.equal(request.url, "https://api.anthropic.com/v1/messages");
  assert.equal(request.options.headers["x-api-key"], "sk-ant-test");
  assert.equal(request.options.headers["anthropic-version"], "2023-06-01");
  assert.equal(request.options.headers.authorization, undefined);
  assert.equal(body.model, "claude-sonnet-4-20250514");
  assert.equal(body.system, "Be useful.");
  assert.equal(body.max_tokens, 4096);
  assert.deepEqual(body.messages, [{ role: "user", content: "hello" }]);
  assert.equal(body.temperature, 0.3);
});

test("buildModelsRequest checks provider availability", () => {
  const oauthRequest = buildModelsRequest({
    baseUrl: "http://127.0.0.1:10531/v1",
    apiKey: "",
  });

  assert.equal(oauthRequest.url, "http://127.0.0.1:10531/v1/models");
  assert.equal(oauthRequest.options.headers.authorization, undefined);

  const apiRequest = buildModelsRequest({
    baseUrl: "https://api.openai.com/v1",
    apiKey: "sk-test",
  });

  assert.equal(apiRequest.options.headers.authorization, "Bearer sk-test");
});

test("buildModelsRequest builds Anthropic model list requests", () => {
  const request = buildModelsRequest({
    providerType: "anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    apiKey: "sk-ant-test",
  });

  assert.equal(request.url, "https://api.anthropic.com/v1/models");
  assert.equal(request.options.headers["x-api-key"], "sk-ant-test");
  assert.equal(request.options.headers["anthropic-version"], "2023-06-01");
  assert.equal(request.options.headers.authorization, undefined);
});

test("parseChatCompletionResponse extracts assistant text", () => {
  const text = parseChatCompletionResponse({
    choices: [{ message: { content: "answer" } }],
  });

  assert.equal(text, "answer");
});

test("parseChatCompletionResponse extracts Anthropic assistant text", () => {
  const text = parseChatCompletionResponse({
    content: [
      { type: "text", text: "hello " },
      { type: "text", text: "claude" },
    ],
  });

  assert.equal(text, "hello claude");
});

test("normalizeLlmSettings keeps safe defaults", () => {
  const settings = normalizeLlmSettings({});

  assert.equal(settings.provider, "openai-oauth");
  assert.equal(settings.oauthBaseUrl, "http://127.0.0.1:10531/v1");
  assert.equal(settings.apiBaseUrl, "https://api.openai.com/v1");
});

test("createRequestUrlFetch adapts Obsidian requestUrl responses", async () => {
  const calls = [];
  const fetchImpl = createRequestUrlFetch(async (request) => {
    calls.push(request);
    return {
      status: 200,
      text: '{"ok":true}',
      json: { ok: true },
    };
  });

  const response = await fetchImpl("http://127.0.0.1:10531/v1/models", {
    method: "GET",
    headers: { "content-type": "application/json" },
  });

  assert.equal(response.ok, true);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(calls[0].url, "http://127.0.0.1:10531/v1/models");
});
