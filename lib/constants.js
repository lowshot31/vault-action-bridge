const VIEW_TYPE_VAULT_PILOT = "vault-pilot-view";
const VIEW_TYPE_AI_WEBAPP = "vault-pilot-ai-webapp-view";
const CHATGPT_URL = "https://chatgpt.com/";
const AI_WEB_APPS = {
  chatgpt: {
    id: "chatgpt",
    name: "ChatGPT",
    url: "https://chatgpt.com/",
  },
  claude: {
    id: "claude",
    name: "Claude",
    url: "https://claude.ai/new",
  },
  gemini: {
    id: "gemini",
    name: "Gemini",
    url: "https://gemini.google.com/app",
  },
};
const API_PROVIDER_PRESETS = {
  openai: {
    id: "openai",
    name: "OpenAI",
    type: "openai-compatible",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4.1-mini",
  },
  anthropic: {
    id: "anthropic",
    name: "Anthropic Claude",
    type: "anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    model: "claude-sonnet-4-20250514",
  },
  openrouter: {
    id: "openrouter",
    name: "OpenRouter",
    type: "openai-compatible",
    baseUrl: "https://openrouter.ai/api/v1",
    model: "openai/gpt-4.1-mini",
  },
  groq: {
    id: "groq",
    name: "Groq",
    type: "openai-compatible",
    baseUrl: "https://api.groq.com/openai/v1",
    model: "llama-3.3-70b-versatile",
  },
  gemini: {
    id: "gemini",
    name: "Gemini API",
    type: "openai-compatible",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    model: "gemini-2.5-flash",
  },
  deepseek: {
    id: "deepseek",
    name: "DeepSeek",
    type: "openai-compatible",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-chat",
  },
  ollama: {
    id: "ollama",
    name: "Ollama / local",
    type: "openai-compatible",
    baseUrl: "http://127.0.0.1:11434/v1",
    model: "llama3.1",
  },
  custom: {
    id: "custom",
    name: "Custom",
    type: "openai-compatible",
    baseUrl: "",
    model: "",
  },
};

const DEFAULT_SETTINGS = {
  provider: "openai-oauth",
  oauthBaseUrl: "http://127.0.0.1:10531/v1",
  oauthModel: "gpt-5.4",
  oauthModelOptions: [],
  apiProviderPreset: "openai",
  apiProviderType: "openai-compatible",
  apiBaseUrl: "https://api.openai.com/v1",
  apiModel: "gpt-4.1-mini",
  apiModelOptions: [],
  apiKey: "",
  temperature: 0.2,
  uiLanguage: "auto",
  promptTemplate: [
    "You are helping me with notes from Obsidian.",
    "File: {{filePath}}",
    "",
    "Content:",
    "{{content}}",
  ].join("\n"),
  autoSend: false,
  showBetaWarning: true,
  openViewOnStartup: true,
};

const REVIEW_FILES = [
  "README.md",
  "manifest.json",
  "main.js",
];

module.exports = {
  AI_WEB_APPS,
  API_PROVIDER_PRESETS,
  CHATGPT_URL,
  DEFAULT_SETTINGS,
  REVIEW_FILES,
  VIEW_TYPE_AI_WEBAPP,
  VIEW_TYPE_VAULT_PILOT,
};
