const DEFAULT_LLM_SETTINGS = {
  provider: "openai-oauth",
  oauthBaseUrl: "http://127.0.0.1:10531/v1",
  oauthModel: "gpt-5.4",
  apiProviderPreset: "openai",
  apiProviderType: "openai-compatible",
  apiBaseUrl: "https://api.openai.com/v1",
  apiModel: "gpt-4.1-mini",
  apiKey: "",
  temperature: 0.2,
};

function normalizeBaseUrl(url) {
  return `${url || ""}`.trim().replace(/\/+$/, "");
}

function normalizeLlmSettings(input = {}) {
  return {
    ...DEFAULT_LLM_SETTINGS,
    ...input,
    oauthBaseUrl: normalizeBaseUrl(input.oauthBaseUrl || DEFAULT_LLM_SETTINGS.oauthBaseUrl),
    apiProviderType: input.apiProviderPreset === "anthropic" ? "anthropic" : (input.apiProviderType || DEFAULT_LLM_SETTINGS.apiProviderType),
    apiBaseUrl: normalizeBaseUrl(input.apiBaseUrl || DEFAULT_LLM_SETTINGS.apiBaseUrl),
    apiKey: `${input.apiKey || ""}`.trim(),
  };
}

function createProviderConfig(settingsInput = {}) {
  const settings = normalizeLlmSettings(settingsInput);
  if (settings.provider === "openai-oauth") {
    return {
      provider: settings.provider,
      providerType: "openai-compatible",
      baseUrl: settings.oauthBaseUrl,
      model: settings.oauthModel,
      apiKey: "",
      requiresApiKey: false,
    };
  }

  return {
    provider: settings.provider,
    providerType: settings.apiProviderType || "openai-compatible",
    baseUrl: settings.apiBaseUrl,
    model: settings.apiModel,
    apiKey: settings.apiKey,
    requiresApiKey: true,
  };
}

function buildAnthropicMessages(messages = []) {
  const system = messages
    .filter((message) => message?.role === "system")
    .map((message) => `${message.content || ""}`.trim())
    .filter(Boolean)
    .join("\n\n");
  const conversation = messages
    .filter((message) => message?.role !== "system")
    .map((message) => ({
      role: message.role === "assistant" ? "assistant" : "user",
      content: message.content || "",
    }));

  return { system, messages: conversation };
}

function buildChatCompletionRequest({ providerType = "openai-compatible", baseUrl, model, apiKey, messages, temperature = 0.2 }) {
  if (providerType === "anthropic") {
    const { system, messages: anthropicMessages } = buildAnthropicMessages(messages);
    const body = {
      model,
      max_tokens: 4096,
      messages: anthropicMessages,
      temperature,
    };
    if (system) {
      body.system = system;
    }

    return {
      url: `${normalizeBaseUrl(baseUrl)}/messages`,
      options: {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
      },
    };
  }

  const headers = {
    "content-type": "application/json",
  };
  if (apiKey) {
    headers.authorization = `Bearer ${apiKey}`;
  }

  return {
    url: `${normalizeBaseUrl(baseUrl)}/chat/completions`,
    options: {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        messages,
        temperature,
      }),
    },
  };
}

function buildModelsRequest({ providerType = "openai-compatible", baseUrl, apiKey }) {
  if (providerType === "anthropic") {
    return {
      url: `${normalizeBaseUrl(baseUrl)}/models`,
      options: {
        method: "GET",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
      },
    };
  }

  const headers = {
    "content-type": "application/json",
  };
  if (apiKey) {
    headers.authorization = `Bearer ${apiKey}`;
  }
  return {
    url: `${normalizeBaseUrl(baseUrl)}/models`,
    options: {
      method: "GET",
      headers,
    },
  };
}

function parseChatCompletionResponse(payload) {
  if (Array.isArray(payload?.content)) {
    const text = payload.content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }
        return part?.text || "";
      })
      .join("")
      .trim();
    if (text) {
      return text;
    }
  }

  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }
        return part?.text || "";
      })
      .join("")
      .trim();
  }
  throw new Error("Model response did not include assistant text.");
}

function createRequestUrlFetch(requestUrlImpl) {
  return async function requestUrlFetch(url, options = {}) {
    const response = await requestUrlImpl({
      url,
      method: options.method || "GET",
      headers: options.headers || {},
      body: options.body,
    });

    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      text: async () => response.text,
      json: async () => {
        if (response.json !== undefined) {
          return response.json;
        }
        return JSON.parse(response.text || "{}");
      },
    };
  };
}

class LlmClient {
  constructor(settings, fetchImpl) {
    this.settings = normalizeLlmSettings(settings);
    this.fetchImpl = fetchImpl || globalThis.fetch;
  }

  async complete(messages) {
    const providerConfig = createProviderConfig(this.settings);
    if (providerConfig.requiresApiKey && !providerConfig.apiKey) {
      throw new Error("API key is required for the selected provider.");
    }
    if (!this.fetchImpl) {
      throw new Error("Fetch is not available in this environment.");
    }

    const request = buildChatCompletionRequest({
      ...providerConfig,
      messages,
      temperature: this.settings.temperature,
    });

    const response = await this.fetchImpl(request.url, request.options);
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Model request failed: ${response.status} ${body}`);
    }

    return parseChatCompletionResponse(await response.json());
  }

  async testConnection() {
    const providerConfig = createProviderConfig(this.settings);
    if (providerConfig.requiresApiKey && !providerConfig.apiKey) {
      throw new Error("API key is required for the selected provider.");
    }
    if (!this.fetchImpl) {
      throw new Error("Fetch is not available in this environment.");
    }
    const request = buildModelsRequest(providerConfig);
    let response;
    try {
      response = await this.fetchImpl(request.url, request.options);
    } catch (error) {
      throw new Error(`Provider is not reachable at ${providerConfig.baseUrl}. For openai-oauth, run npx @openai/codex login once, then run npx openai-oauth.`);
    }
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Provider check failed: ${response.status} ${body}`);
    }
    const payload = await response.json();
    return {
      ok: true,
      models: Array.isArray(payload.data) ? payload.data.map((model) => model.id).filter(Boolean) : [],
    };
  }
}

module.exports = {
  DEFAULT_LLM_SETTINGS,
  LlmClient,
  buildChatCompletionRequest,
  buildModelsRequest,
  createRequestUrlFetch,
  createProviderConfig,
  normalizeBaseUrl,
  normalizeLlmSettings,
  parseChatCompletionResponse,
};
