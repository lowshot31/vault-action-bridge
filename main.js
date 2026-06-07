const {
  ItemView,
  MarkdownView,
  Modal,
  Notice,
  Plugin,
  PluginSettingTab,
  requestUrl,
  Setting,
} = require("obsidian");
const childProcess = require("child_process");

const VIEW_TYPE_NOTE_PILOT = "note-pilot-view";
const VIEW_TYPE_AI_WEBAPP = "note-pilot-ai-webapp-view";
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

function requireString(value, name) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${name} is required.`);
  }
  return value.trim();
}

function requireVaultRelativePath(value) {
  const path = requireString(value, "path").replace(/\\/g, "/");
  if (path.startsWith("/") || /^[a-zA-Z]:\//.test(path) || path.split("/").includes("..")) {
    throw new Error("path must be a vault-relative path.");
  }
  return path;
}

function getExistingFile(vault, path) {
  const file = vault.getAbstractFileByPath(path);
  if (!file) {
    throw new Error(`File not found: ${path}`);
  }
  return file;
}

function stripJsonFence(input) {
  const text = `${input || ""}`.trim();
  const fenceMatch = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenceMatch ? fenceMatch[1].trim() : text;
}

function parseVaultActionJson(input) {
  const payload = JSON.parse(stripJsonFence(input));
  const normalizeAction = (action) => {
    if (action && typeof action === "object" && !action.action && action.type) {
      return { ...action, action: action.type };
    }
    return action;
  };
  if (Array.isArray(payload)) {
    return payload.map(normalizeAction);
  }
  if (Array.isArray(payload.actions)) {
    return payload.actions.map(normalizeAction);
  }
  return [normalizeAction(payload)];
}

function isSupportedVaultAction(action) {
  return ["create_note", "modify_note", "append_note", "create_folder"].includes(action);
}

function isVaultActionPayload(input) {
  let actions;
  try {
    actions = parseVaultActionJson(input);
  } catch (_error) {
    return false;
  }

  return actions.length > 0 && actions.every((action) => (
    action
    && typeof action === "object"
    && isSupportedVaultAction(action.action)
    && typeof action.path === "string"
    && action.path.trim()
  ));
}

function extractVaultActionJsonFromModelAnswer(answer) {
  const text = `${answer || ""}`.trim();
  if (!text) {
    return null;
  }

  if (isVaultActionPayload(text)) {
    return text;
  }

  const fencedBlocks = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)\s*```/gi)];
  for (const match of fencedBlocks) {
    const candidate = match[1].trim();
    if (isVaultActionPayload(candidate)) {
      return candidate;
    }
  }

  return null;
}

function stripVaultActionJsonFromModelAnswer(answer) {
  const text = `${answer || ""}`;
  if (isVaultActionPayload(text)) {
    return "Vault action proposed. Review the confirmation dialog to apply it.";
  }

  const withoutClosedFences = text.replace(/```(?:json)?\s*([\s\S]*?)\s*```/gi, (block, candidate) => {
    if (isVaultActionPayload(candidate.trim())) {
      return "";
    }
    return block;
  });

  return withoutClosedFences.replace(/```(?:json)?\s*([\s\S]*)$/i, (block, candidate) => {
    if (isVaultActionPayload(candidate.trim())) {
      return "";
    }
    return block;
  }).replace(/\n{3,}/g, "\n\n").trim();
}

function hasVaultWriteIntent(input) {
  const text = `${input || ""}`.toLowerCase();
  if (!text.trim()) {
    return false;
  }

  const patterns = [
    /작성해줘|써줘|만들어줘|저장해줘|추가해줘|붙여줘|이어서\s*써줘/,
    /수정해줘|바꿔줘|고쳐줘|업데이트해줘|반영해줘|넣어줘/,
    /현재\s*(파일|노트).*?(작성|저장|추가|수정|반영|넣)/,
    /\d+\s*번으로\s*진행|그걸로\s*해줘|위\s*내용\s*적용/,
    /\b(write|create|save|append|insert|update|edit|rewrite|replace|modify)\b/,
    /\b(add|put)\b.*\b(current note|current file|this note|this file|note|file)\b/,
    /\b(save|append|insert)\b.*\b(to|into)\b/,
  ];

  return patterns.some((pattern) => pattern.test(text));
}

function buildAppendCurrentNoteActionJson({ path, content }) {
  const normalizedPath = requireVaultRelativePath(path);
  const normalizedContent = `${content || ""}`.trim();
  return JSON.stringify({
    actions: [
      {
        action: "append_note",
        path: normalizedPath,
        content: `\n\n${normalizedContent}`,
      },
    ],
  }, null, 2);
}

function summarizeVaultActions(actions = []) {
  const labels = {
    create_folder: "Create folder",
    create_note: "Create note",
    append_note: "Append to note",
    modify_note: "Replace note",
  };

  return actions.map((action) => {
    const contentLines = `${action.content || ""}`
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    return {
      label: labels[action.action] || action.action || "Vault action",
      path: action.path || "",
      detail: contentLines[0] || "",
      risk: action.action === "modify_note" ? "high" : "low",
    };
  });
}

function getPathBasename(path) {
  return `${path || ""}`.replace(/\\/g, "/").split("/").filter(Boolean).pop() || "";
}

function getPathParent(path) {
  const parts = `${path || ""}`.replace(/\\/g, "/").split("/").filter(Boolean);
  parts.pop();
  return parts.join("/");
}

function joinVaultPath(parent, child) {
  const normalizedParent = `${parent || ""}`.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  const normalizedChild = `${child || ""}`.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  return normalizedParent ? `${normalizedParent}/${normalizedChild}` : normalizedChild;
}

function rewriteActionPathsForBase(actions = [], basePath = "") {
  return actions.map((action) => {
    if (!action || typeof action !== "object" || !action.path) {
      return action;
    }
    return {
      ...action,
      path: joinVaultPath(basePath, getPathBasename(action.path)),
    };
  });
}

function quoteBash(value) {
  return `'${`${value}`.replace(/'/g, "'\\''")}'`;
}

function spawnDetached(command, args) {
  const child = childProcess.spawn(command, args, {
    detached: true,
    stdio: "ignore",
    windowsHide: false,
  });
  child.unref();
  return child;
}

function encodePowerShellCommand(script) {
  return Buffer.from(script, "utf16le").toString("base64");
}

function getPlatformLabel() {
  if (process.platform === "win32") {
    return "Windows";
  }
  if (process.platform === "darwin") {
    return "macOS";
  }
  if (process.platform === "linux") {
    return "Linux";
  }
  return process.platform;
}

function buildSetupScript() {
  if (process.platform === "win32") {
    return [
      "$Host.UI.RawUI.WindowTitle = \"Note Pilot openai-oauth setup\"",
      "Write-Host 'Note Pilot openai-oauth setup'",
      "Write-Host 'This visible terminal will run ChatGPT login first, then start openai-oauth.'",
      "Write-Host 'Press Ctrl+C to stop openai-oauth when you are done.'",
      "npx @openai/codex login",
      "if ($LASTEXITCODE -eq 0) { npx openai-oauth } else { Write-Host 'Login command failed or was cancelled.' }",
    ].join("; ");
  }
  return [
    "echo 'Note Pilot openai-oauth setup'",
    "echo 'This visible terminal will run ChatGPT login first, then start openai-oauth.'",
    "echo 'Press Ctrl+C to stop openai-oauth when you are done.'",
    "npx @openai/codex login && npx openai-oauth",
  ].join("; ");
}

function buildNodeInstallScript() {
  if (process.platform === "win32") {
    return [
      "$Host.UI.RawUI.WindowTitle = \"Note Pilot Node.js install\"",
      "Write-Host 'Note Pilot Node.js install'",
      "Write-Host 'Detected OS: Windows'",
      "Write-Host 'This visible terminal will install Node.js LTS using winget.'",
      "Write-Host 'If Windows asks for permission, review it before accepting.'",
      "winget --version",
      "if ($LASTEXITCODE -eq 0) { winget install -e --id OpenJS.NodeJS.LTS } else { Write-Host 'winget is not available. Install Node.js manually from https://nodejs.org/' }",
      "Write-Host ''",
      "Write-Host 'After installation, restart Obsidian so npm/npx can be found.'",
    ].join("; ");
  }

  if (process.platform === "darwin") {
    return [
      "echo 'Note Pilot Node.js install'",
      "echo 'Detected OS: macOS'",
      "if command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then echo 'Node.js is already installed.'; node --version; npm --version; exit 0; fi",
      "if command -v brew >/dev/null 2>&1; then echo 'Homebrew found. Installing Node.js...'; brew install node; else echo 'Homebrew was not found. Install Node.js manually from https://nodejs.org/ or install Homebrew first.'; fi",
      "echo 'After installation, restart Obsidian so npm/npx can be found.'",
    ].join("; ");
  }

  return [
    "echo 'Note Pilot Node.js install'",
    "echo 'Detected OS: Linux'",
    "if command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then echo 'Node.js is already installed.'; node --version; npm --version; exit 0; fi",
    "echo 'Node.js/npm were not found.'",
    "echo 'Use the command for your distribution, then restart Obsidian:'",
    "if command -v apt-get >/dev/null 2>&1; then echo '  sudo apt-get update && sudo apt-get install -y nodejs npm'; fi",
    "if command -v dnf >/dev/null 2>&1; then echo '  sudo dnf install -y nodejs npm'; fi",
    "if command -v pacman >/dev/null 2>&1; then echo '  sudo pacman -S nodejs npm'; fi",
    "if command -v zypper >/dev/null 2>&1; then echo '  sudo zypper install nodejs npm'; fi",
    "echo 'Or download Node.js from https://nodejs.org/'",
  ].join("; ");
}

function buildToolInstallScript() {
  if (process.platform === "win32") {
    return [
      "$Host.UI.RawUI.WindowTitle = \"Note Pilot tool install\"",
      "Write-Host 'Note Pilot tool check/install'",
      "Write-Host 'Detected OS: Windows'",
      "Write-Host 'Node.js and npm must already be installed.'",
      "Write-Host 'This will check for required tools and install only missing packages.'",
      "node --version",
      "npm --version",
      "$codexCmd = Get-Command codex -ErrorAction SilentlyContinue",
      "if ($codexCmd) { Write-Host \"@openai/codex found: $($codexCmd.Source)\"; codex --version } else { Write-Host '@openai/codex not found. Installing...'; npm install -g @openai/codex }",
      "$oauthCmd = Get-Command openai-oauth -ErrorAction SilentlyContinue",
      "if ($oauthCmd) { Write-Host \"openai-oauth found: $($oauthCmd.Source)\"; openai-oauth --version } else { Write-Host 'openai-oauth not found. Installing...'; npm install -g openai-oauth }",
      "Write-Host ''",
      "Write-Host 'Check/install step finished. Return to Obsidian and open the setup terminal.'",
    ].join("; ");
  }

  return [
    "echo 'Note Pilot tool check/install'",
    "echo 'Detected OS: " + getPlatformLabel() + "'",
    "echo 'Node.js and npm must already be installed.'",
    "node --version || { echo 'node was not found. Install Node.js first.'; exit 1; }",
    "npm --version || { echo 'npm was not found. Install Node.js/npm first.'; exit 1; }",
    "if command -v codex >/dev/null 2>&1; then echo '@openai/codex found:'; command -v codex; codex --version; else echo '@openai/codex not found. Installing...'; npm install -g @openai/codex; fi",
    "if command -v openai-oauth >/dev/null 2>&1; then echo 'openai-oauth found:'; command -v openai-oauth; openai-oauth --version; else echo 'openai-oauth not found. Installing...'; npm install -g openai-oauth; fi",
    "echo 'Check/install step finished. Return to Obsidian and open the setup terminal.'",
  ].join("; ");
}

function openOpenAiOauthSetupTerminal() {
  openVisibleTerminal("Note Pilot openai-oauth setup", buildSetupScript());
}

function openNodeJsInstallTerminal() {
  openVisibleTerminal("Note Pilot Node.js install", buildNodeInstallScript());
}

function openOpenAiOauthInstallTerminal() {
  openVisibleTerminal("Note Pilot tool install", buildToolInstallScript());
}

function openVisibleTerminal(title, script) {
  if (process.platform === "win32") {
    spawnDetached("cmd.exe", [
      "/d",
      "/c",
      "start",
      "",
      "powershell.exe",
      "-NoExit",
      "-ExecutionPolicy",
      "Bypass",
      "-EncodedCommand",
      encodePowerShellCommand(script),
    ]);
    return;
  }

  const shellScript = [
    script,
    "exec $SHELL",
  ].join("; ");

  if (process.platform === "darwin") {
    spawnDetached("osascript", [
      "-e",
      "tell application \"Terminal\" to do script " + JSON.stringify(shellScript),
      "-e",
      "tell application \"Terminal\" to activate",
    ]);
    return;
  }

  spawnDetached("x-terminal-emulator", ["-e", "bash", "-lc", shellScript]);
}

const UI_TEXT = {
  en: {
    providerApiKey: "API key",
    appSubtitle: "Use your configured provider for note Q&A and vault file actions.",
    askCurrentNote: "Ask current note",
    askSelection: "Ask selection",
    testConnection: "Test connection",
    chatgptWeb: "ChatGPT web",
    claudeWeb: "Claude web",
    geminiWeb: "Gemini web",
    bridgeChat: "Bridge chat",
    reload: "Reload",
    model: "Model",
    ready: "Ready",
    introMessage: "Open a note, add an optional question below, then ask about the current note or selection.",
    inputPlaceholder: "Optional question, e.g. Summarize this in Korean and point out unclear parts.",
    askWithNote: "Ask with note",
    you: "You",
    assistant: "Assistant",
    copy: "Copy",
    messageCopied: "Message copied.",
    copyFailed: "Copy failed",
    modelSelected: (model) => `Model selected: ${model}`,
    working: "Working",
    waitingForModel: "Waiting for model response",
    thinking: "Thinking",
    testConnectionMessage: "Test connection.",
    checkingProvider: "Checking provider",
    connectionOk: "Connection OK.",
    availableModels: "Available models",
    connectionFailed: "Connection failed",
    errorPrefix: "Error",
    openMarkdownFirst: "Open a Markdown note in the workspace first.",
    couldNotReadNote: "Could not read the current note.",
    selectTextFirst: "Select text before using the selection command.",
    askCurrentNoteFallback: "Ask about current note.",
    askSelectionFallback: "Ask about selected text.",
    changesReady: (count) => `${count} change${count === 1 ? "" : "s"} ready for review`,
    createFolder: "Create folder",
    createNote: "Create note",
    appendNote: "Append to note",
    replaceNote: "Replace note",
    replacesFullNote: "Replaces the full note",
    saveLocation: "Save location",
    vaultRoot: "Vault root",
    currentFolder: "Current folder",
    reviewVaultActions: "Review vault actions",
    reviewVaultActionsDescription: "The model proposed Obsidian vault changes. Review the summary before applying.",
    reviewClipboardDescription: "These actions can create or modify notes in this vault. Review the summary before applying.",
    reviewAppendFallback: "Review append fallback",
    reviewAppendFallbackDescription: "The model did not provide vault action JSON, but your request looks like a note change. Review this append action before applying.",
    applyActions: "Apply actions",
    appendToNote: "Append to note",
    editJson: "Edit JSON",
    cancel: "Cancel",
    sendNow: "Send now",
    insertIntoChatGPT: "Insert into ChatGPT",
    couldNotUpdatePaths: "Could not update paths",
    clipboardUnavailable: "Clipboard is not available in this environment.",
    invalidClipboardJson: "Clipboard content must be valid vault action JSON.",
    invalidModelActionJson: "Model-proposed vault actions must be valid JSON.",
    invalidFallbackActionJson: "Fallback vault action must be valid JSON.",
    appliedVaultActions: (count) => `Applied ${count} vault action${count === 1 ? "" : "s"}.`,
    vaultActionFailed: "Vault action failed",
    askingModel: "Asking model...",
    modelRequestFailed: "Model request failed",
    settingsTitle: "Note Pilot settings",
    settingsHelp: "Use openai-oauth for a ChatGPT subscription account, or switch to an API key provider for hosted APIs and Ollama/local.",
    providerModeName: "Connection mode",
    providerModeDesc: "ChatGPT subscription and API key modes need different settings.",
    providerOAuth: "ChatGPT subscription account (openai-oauth)",
    providerApi: "API key provider",
    testConnectionName: "Connection check",
    testConnectionDesc: "Connect with the selected provider and refresh the available model list.",
    uiLanguageName: "UI language",
    uiLanguageDesc: "Controls plugin labels such as review dialogs, action buttons, notices, and settings.",
    autoLanguage: "Auto",
    koreanLanguage: "Korean",
    englishLanguage: "English",
    oauthSection: "ChatGPT subscription account",
    detectedOsName: "Detected OS",
    detectedOsDesc: (platform) => `Setup buttons will use ${platform}-specific terminal commands.`,
    nodeInstallName: "1. Install Node.js",
    nodeInstallDesc: "Opens a visible terminal and installs Node.js LTS with winget on Windows. Restart Obsidian after installing.",
    nodeInstallButton: "Open Node.js install terminal",
    nodeInstallNotice: "Node.js install terminal opened. Restart Obsidian after installation finishes.",
    nodeInstallFailed: "Could not open Node.js install terminal",
    oauthInstallName: "2. Install/update openai-oauth tools",
    oauthInstallDesc: "Opens a visible terminal and runs npm install -g @openai/codex openai-oauth. Requires Node.js/npm.",
    oauthInstallButton: "Open tool install terminal",
    oauthInstallNotice: "Tool install terminal opened. After it finishes, open the setup terminal.",
    oauthInstallFailed: "Could not open tool install terminal",
    oauthSetupName: "3. Login and run openai-oauth",
    oauthSetupDesc: "Opens a visible terminal and runs npx @openai/codex login, then npx openai-oauth. Node.js/npm must already be installed.",
    oauthSetupButton: "Open setup terminal",
    oauthSetupNotice: "Setup terminal opened. Complete login there, then keep openai-oauth running.",
    oauthSetupFailed: "Could not open setup terminal",
    oauthBaseUrlName: "openai-oauth URL",
    oauthBaseUrlDesc: "Default EvanZhouDev/openai-oauth URL is http://127.0.0.1:10531/v1.",
    modelName: "Model",
    modelDesc: "After a connection check, available models can be selected from the dropdown.",
    modelManualPlaceholder: "Enter model manually",
    apiSection: "API key connection",
    apiProviderName: "API provider",
    apiProviderDesc: "Choosing a preset fills the API URL, provider type, and default model. Choose custom for OpenAI-compatible services.",
    apiBaseUrlName: "API URL",
    apiBaseUrlDesc: "Enter the provider API endpoint. Custom endpoints use the OpenAI-compatible request format.",
    apiModelName: "API model",
    apiKeyName: "API key",
    apiKeyDesc: "Required for hosted API providers. Leave empty for Ollama / local.",
    temperatureName: "Temperature",
    temperatureDesc: "Lower values are more stable; higher values are more varied.",
    promptSection: "Prompt and behavior",
    promptTemplateName: "Prompt template",
    promptTemplateDesc: "You can use {{filePath}} and {{content}}.",
    autoSendName: "Auto-send after web injection",
    autoSendDesc: "When off, the plugin fills the ChatGPT web input but does not send it.",
    betaWarningName: "Show beta warning",
    betaWarningDesc: "Show a warning that ChatGPT web automation can break.",
    openStartupName: "Open sidebar on startup",
    openStartupDesc: "Open the Note Pilot pane automatically when the plugin loads.",
    testing: "Checking...",
    connected: "Connection OK.",
    providerFailed: "Connection failed",
  },
  ko: {
    providerApiKey: "API 키",
    appSubtitle: "설정한 제공자로 노트 질문과 vault 파일 작업을 처리합니다.",
    askCurrentNote: "현재 노트 질문",
    askSelection: "선택 영역 질문",
    testConnection: "연결 확인",
    chatgptWeb: "ChatGPT 웹",
    claudeWeb: "Claude 웹",
    geminiWeb: "Gemini 웹",
    bridgeChat: "Bridge 채팅",
    reload: "새로고침",
    model: "모델",
    ready: "준비됨",
    introMessage: "노트를 열고, 필요하면 아래에 질문을 입력한 뒤 현재 노트나 선택 영역에 대해 물어보세요.",
    inputPlaceholder: "추가 질문을 입력하세요. 예: 한국어로 요약하고 애매한 부분을 짚어줘.",
    askWithNote: "노트와 함께 질문",
    you: "사용자",
    assistant: "어시스턴트",
    copy: "복사",
    messageCopied: "메시지를 복사했습니다.",
    copyFailed: "복사 실패",
    modelSelected: (model) => `모델을 선택했습니다: ${model}`,
    working: "작업 중",
    waitingForModel: "모델 응답 대기 중",
    thinking: "생각 중",
    testConnectionMessage: "연결을 확인합니다.",
    checkingProvider: "제공자 확인 중",
    connectionOk: "연결되었습니다.",
    availableModels: "사용 가능 모델",
    connectionFailed: "연결 실패",
    errorPrefix: "오류",
    openMarkdownFirst: "먼저 작업 공간에서 Markdown 노트를 열어주세요.",
    couldNotReadNote: "현재 노트를 읽을 수 없습니다.",
    selectTextFirst: "선택 영역 명령을 쓰려면 먼저 텍스트를 선택하세요.",
    askCurrentNoteFallback: "현재 노트에 대해 질문합니다.",
    askSelectionFallback: "선택 영역에 대해 질문합니다.",
    changesReady: (count) => `검토할 변경 ${count}개`,
    createFolder: "폴더 생성",
    createNote: "노트 생성",
    appendNote: "노트에 추가",
    replaceNote: "노트 전체 교체",
    replacesFullNote: "노트 전체를 교체합니다",
    saveLocation: "저장 위치",
    vaultRoot: "최상위",
    currentFolder: "현재 폴더",
    reviewVaultActions: "Vault 작업 검토",
    reviewVaultActionsDescription: "모델이 Obsidian vault 변경안을 만들었습니다. 적용 전 요약을 확인하세요.",
    reviewClipboardDescription: "이 작업은 vault 안의 노트나 폴더를 만들거나 수정할 수 있습니다. 적용 전 요약을 확인하세요.",
    reviewAppendFallback: "현재 노트 추가 검토",
    reviewAppendFallbackDescription: "모델이 vault action JSON을 만들지 않았지만 노트 변경 요청으로 보입니다. 적용 전 추가 작업을 확인하세요.",
    applyActions: "적용",
    appendToNote: "노트에 추가",
    editJson: "JSON 편집",
    cancel: "취소",
    sendNow: "바로 보내기",
    insertIntoChatGPT: "ChatGPT에 넣기",
    couldNotUpdatePaths: "경로를 바꿀 수 없습니다",
    clipboardUnavailable: "이 환경에서는 클립보드를 사용할 수 없습니다.",
    invalidClipboardJson: "클립보드 내용은 올바른 vault action JSON이어야 합니다.",
    invalidModelActionJson: "모델이 제안한 vault action은 올바른 JSON이어야 합니다.",
    invalidFallbackActionJson: "대체 vault action은 올바른 JSON이어야 합니다.",
    appliedVaultActions: (count) => `Vault 작업 ${count}개를 적용했습니다.`,
    vaultActionFailed: "Vault 작업 실패",
    askingModel: "모델에 질문하는 중...",
    modelRequestFailed: "모델 요청 실패",
    settingsTitle: "Note Pilot 설정",
    settingsHelp: "ChatGPT 구독 계정은 openai-oauth 모드를 쓰고, 호스팅 API 또는 Ollama/local은 API 키 제공자 모드로 전환하세요.",
    providerModeName: "연동 방식",
    providerModeDesc: "구독 계정 연동과 API 키 연동은 필요한 설정이 다릅니다.",
    providerOAuth: "ChatGPT 구독 계정(openai-oauth)",
    providerApi: "API 키 제공자",
    testConnectionName: "연결 확인",
    testConnectionDesc: "현재 선택한 연동 방식으로 접속하고, 사용 가능한 모델 목록을 새로 가져옵니다.",
    uiLanguageName: "UI 언어",
    uiLanguageDesc: "검토 창, 작업 버튼, 알림, 설정 화면의 표시 언어를 정합니다.",
    autoLanguage: "자동",
    koreanLanguage: "한국어",
    englishLanguage: "영어",
    oauthSection: "ChatGPT 구독 계정 연동",
    detectedOsName: "\uac10\uc9c0\ub41c OS",
    detectedOsDesc: (platform) => `${platform}\uc5d0 \ub9de\ub294 \ud130\ubbf8\ub110 \uba85\ub839\uc73c\ub85c \uc124\uc815 \ubc84\ud2bc\uc774 \ub3d9\uc791\ud569\ub2c8\ub2e4.`,
    nodeInstallName: "1. Node.js 설치",
    nodeInstallDesc: "보이는 터미널을 열고 Windows에서 winget으로 Node.js LTS를 설치합니다. 설치 후 Obsidian을 다시 시작하세요.",
    nodeInstallButton: "Node.js 설치 터미널 열기",
    nodeInstallNotice: "Node.js 설치 터미널을 열었습니다. 설치가 끝나면 Obsidian을 다시 시작하세요.",
    nodeInstallFailed: "Node.js 설치 터미널을 열 수 없습니다",
    oauthInstallName: "2. openai-oauth 도구 설치/업데이트",
    oauthInstallDesc: "보이는 터미널을 열고 npm install -g @openai/codex openai-oauth를 실행합니다. Node.js/npm이 필요합니다.",
    oauthInstallButton: "도구 설치 터미널 열기",
    oauthInstallNotice: "도구 설치 터미널을 열었습니다. 완료 후 설정 터미널을 여세요.",
    oauthInstallFailed: "도구 설치 터미널을 열 수 없습니다",
    oauthSetupName: "3. 로그인 및 openai-oauth 실행",
    oauthSetupDesc: "보이는 터미널을 열고 npx @openai/codex login 실행 후 npx openai-oauth를 시작합니다. Node.js/npm은 미리 설치되어 있어야 합니다.",
    oauthSetupButton: "설정 터미널 열기",
    oauthSetupNotice: "설정 터미널을 열었습니다. 터미널에서 로그인을 완료한 뒤 openai-oauth를 실행 상태로 유지하세요.",
    oauthSetupFailed: "설정 터미널을 열 수 없습니다",
    oauthBaseUrlName: "openai-oauth 주소",
    oauthBaseUrlDesc: "EvanZhouDev/openai-oauth 기본 주소는 http://127.0.0.1:10531/v1 입니다.",
    modelName: "사용 모델",
    modelDesc: "연결 확인 후 모델 목록이 있으면 드롭다운으로 선택할 수 있습니다.",
    modelManualPlaceholder: "모델 직접 입력",
    apiSection: "API 키 연동",
    apiProviderName: "API 제공자",
    apiProviderDesc: "프리셋을 고르면 API 주소, 제공자 타입, 기본 모델이 자동으로 채워집니다. OpenAI 호환 서비스는 직접 입력을 선택하세요.",
    apiBaseUrlName: "API 주소",
    apiBaseUrlDesc: "제공자 API 엔드포인트를 입력합니다. 직접 입력은 OpenAI 호환 요청 형식을 사용합니다.",
    apiModelName: "API 모델",
    apiKeyName: "API 키",
    apiKeyDesc: "호스팅 API 제공자에는 필요합니다. Ollama / local은 비워두세요.",
    temperatureName: "Temperature",
    temperatureDesc: "낮을수록 답변이 안정적이고, 높을수록 다양하게 답합니다.",
    promptSection: "프롬프트와 동작",
    promptTemplateName: "프롬프트 템플릿",
    promptTemplateDesc: "{{filePath}}와 {{content}} 값을 사용할 수 있습니다.",
    autoSendName: "웹 입력 후 자동 전송",
    autoSendDesc: "끄면 ChatGPT 웹 입력창에 내용만 채우고 전송하지 않습니다.",
    betaWarningName: "베타 경고 표시",
    betaWarningDesc: "ChatGPT 웹 자동화가 깨질 수 있다는 안내를 표시합니다.",
    openStartupName: "시작 시 사이드바 열기",
    openStartupDesc: "플러그인이 로드될 때 Note Pilot 패널을 자동으로 엽니다.",
    testing: "확인 중...",
    connected: "연결되었습니다.",
    providerFailed: "연결 실패",
  },
};

function resolveUiLanguage(setting = "auto") {
  if (setting === "ko" || setting === "en") {
    return setting;
  }
  const locale = `${globalThis.moment?.locale?.() || globalThis.navigator?.language || ""}`.toLowerCase();
  return locale.startsWith("ko") ? "ko" : "en";
}

function getUiText(setting = "auto") {
  return UI_TEXT[resolveUiLanguage(setting)] || UI_TEXT.en;
}

async function executeVaultAction(vault, actionInput = {}) {
  if (!vault) {
    throw new Error("Vault is required.");
  }

  const action = requireString(actionInput.action, "action");
  const path = requireVaultRelativePath(actionInput.path);

  if (action === "create_note") {
    const content = `${actionInput.content || ""}`;
    await vault.create(path, content);
    return { ok: true, action, path };
  }

  if (action === "modify_note") {
    const file = getExistingFile(vault, path);
    const content = `${actionInput.content || ""}`;
    await vault.process(file, () => content);
    return { ok: true, action, path };
  }

  if (action === "append_note") {
    const file = getExistingFile(vault, path);
    const appendContent = `${actionInput.content || ""}`;
    await vault.process(file, (existingContent) => {
      const separator = existingContent ? "\n\n" : "";
      return `${existingContent || ""}${separator}${appendContent}`;
    });
    return { ok: true, action, path };
  }

  if (action === "create_folder") {
    await vault.createFolder(path);
    return { ok: true, action, path };
  }

  throw new Error(`Unsupported vault action: ${action}`);
}

async function executeVaultActions(vault, actions = []) {
  if (!Array.isArray(actions)) {
    throw new Error("actions must be an array.");
  }

  const results = [];
  for (const action of actions) {
    results.push(await executeVaultAction(vault, action));
  }
  return results;
}

function applyTemplate(template, values) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    if (values[key] == null) {
      return "";
    }
    return String(values[key]);
  });
}

function buildChatGptPrompt({
  filePath,
  content,
  selectedText,
  template = DEFAULT_SETTINGS.promptTemplate,
}) {
  const trimmedSelection = `${selectedText || ""}`.trim();
  return applyTemplate(template || DEFAULT_SETTINGS.promptTemplate, {
    filePath: filePath || "Untitled",
    content: trimmedSelection || `${content || ""}`.trim(),
    hasSelection: Boolean(trimmedSelection),
  });
}

function formatChatHistory(messages = [], limit = 6) {
  const recentMessages = messages
    .filter((message) => message && message.role && `${message.content || ""}`.trim())
    .slice(-limit);
  if (!recentMessages.length) {
    return "";
  }

  const lines = recentMessages.map((message) => {
    const role = message.role === "assistant" ? "Assistant" : "User";
    return `${role}: ${`${message.content}`.trim()}`;
  });

  return ["Previous conversation:", ...lines].join("\n");
}

function normalizeBaseUrl(url) {
  return `${url || ""}`.trim().replace(/\/+$/, "");
}

function createProviderConfig(settingsInput = {}) {
  const settings = {
    ...DEFAULT_SETTINGS,
    ...settingsInput,
    oauthBaseUrl: normalizeBaseUrl(settingsInput.oauthBaseUrl || DEFAULT_SETTINGS.oauthBaseUrl),
    apiProviderType: settingsInput.apiProviderPreset === "anthropic" ? "anthropic" : (settingsInput.apiProviderType || DEFAULT_SETTINGS.apiProviderType),
    apiBaseUrl: normalizeBaseUrl(settingsInput.apiBaseUrl || DEFAULT_SETTINGS.apiBaseUrl),
    apiKey: `${settingsInput.apiKey || ""}`.trim(),
  };
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
  const requiresApiKey = settings.apiProviderPreset !== "ollama";

  return {
    provider: settings.provider,
    providerType: settings.apiProviderType || "openai-compatible",
    baseUrl: settings.apiBaseUrl,
    model: settings.apiModel,
    apiKey: settings.apiKey,
    requiresApiKey,
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

  const headers = { "content-type": "application/json" };
  if (apiKey) {
    headers.authorization = `Bearer ${apiKey}`;
  }
  return {
    url: `${normalizeBaseUrl(baseUrl)}/chat/completions`,
    options: {
      method: "POST",
      headers,
      body: JSON.stringify({ model, messages, temperature }),
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

  const headers = { "content-type": "application/json" };
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
    return content.map((part) => (typeof part === "string" ? part : part?.text || "")).join("").trim();
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
    this.settings = { ...DEFAULT_SETTINGS, ...settings };
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

const COMPOSER_SELECTORS = [
  "textarea[data-id='composer-text-input']",
  "#prompt-textarea",
  "textarea[placeholder*='Message']",
  "textarea",
];

function escapeForTemplateLiteral(value) {
  return `${value}`.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
}

function buildInjectionScript(prompt) {
  const escapedPrompt = escapeForTemplateLiteral(prompt);
  const selectors = JSON.stringify(COMPOSER_SELECTORS);
  return `
    (() => {
      const composerSelectors = ${selectors};
      const text = \`${escapedPrompt}\`;
      const composer = composerSelectors
        .map((selector) => document.querySelector(selector))
        .find(Boolean);
      if (!composer) {
        throw new Error("ChatGPT composer not found");
      }
      composer.focus();
      composer.value = text;
      composer.dispatchEvent(new Event("input", { bubbles: true }));
      composer.dispatchEvent(new Event("change", { bubbles: true }));
      const sendButton = Array.from(document.querySelectorAll("button"))
        .find((button) => {
          const label = (button.getAttribute("aria-label") || button.textContent || "").toLowerCase();
          return label.includes("send") || label.includes("submit");
        });
      return { injected: true, canSend: Boolean(sendButton) };
    })();
  `;
}

function normalizeInjectionError(error) {
  const message = (error && error.message) || `${error || ""}`;
  if (/composer not found/i.test(message)) {
    return "Could not find the ChatGPT input box. ChatGPT may have changed its UI.";
  }
  return `Failed to send context to ChatGPT: ${message}`;
}

function isMarkdownView(view) {
  return Boolean(view && view.editor && view.file);
}

function selectMarkdownView({ activeView, markdownLeaves = [] } = {}) {
  if (isMarkdownView(activeView)) {
    return activeView;
  }
  const leaf = markdownLeaves.find((candidate) => isMarkdownView(candidate && candidate.view));
  return leaf ? leaf.view : null;
}

class PromptPreviewModal extends Modal {
  constructor(app, initialValue, options = {}) {
    super(app);
    this.initialValue = initialValue;
    this.options = options;
    this.result = null;
    this.summaryEl = null;
  }

  renderSummary(items) {
    if (!this.summaryEl) {
      return;
    }
    const text = getUiText(this.options.uiLanguage);
    this.summaryEl.empty();
    this.summaryEl.createEl("div", {
      cls: "note-pilot-action-summary-title",
      text: text.changesReady(items.length),
    });
    const labelMap = {
      "Create folder": text.createFolder,
      "Create note": text.createNote,
      "Append to note": text.appendNote,
      "Replace note": text.replaceNote,
    };
    for (const item of items) {
      const itemEl = this.summaryEl.createDiv({
        cls: `note-pilot-action-summary-item note-pilot-action-summary-item-${item.risk || "low"}`,
      });
      itemEl.createEl("strong", { text: labelMap[item.label] || item.label });
      itemEl.createEl("span", { text: item.path });
      if (item.risk === "high") {
        itemEl.createEl("em", { text: text.replacesFullNote });
      }
      if (item.detail) {
        itemEl.createEl("small", { text: item.detail });
      }
    }
  }

  updateActionJson(actions) {
    const nextJson = JSON.stringify({ actions }, null, 2);
    this.textarea.value = nextJson;
    this.renderSummary(summarizeVaultActions(actions));
  }

  onOpen() {
    const { contentEl } = this;
    if (this.options.preventBackgroundClose && this.bgEl) {
      this.bgEl.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
      }, true);
    }
    contentEl.empty();
    contentEl.createEl("h2", { text: this.options.title || "Review prompt before sending" });
    contentEl.createEl("p", {
      text: this.options.description || "This beta plugin sends note content into ChatGPT web. Review the prompt before continuing.",
    });

    if (this.options.summaryItems && this.options.summaryItems.length) {
      const text = getUiText(this.options.uiLanguage);
      this.summaryEl = contentEl.createDiv({ cls: "note-pilot-action-summary" });
      this.renderSummary(this.options.summaryItems);

      if (this.options.pathBases && this.options.pathBases.length) {
        const locationEl = contentEl.createDiv({ cls: "note-pilot-location-actions" });
        locationEl.createEl("span", { text: text.saveLocation });
        for (const base of this.options.pathBases) {
          const button = locationEl.createEl("button", { text: base.labelKey ? text[base.labelKey] : base.label });
          button.addEventListener("click", () => {
            try {
              const actions = parseVaultActionJson(this.textarea.value);
              this.updateActionJson(rewriteActionPathsForBase(actions, base.path));
            } catch (error) {
              new Notice(`${text.couldNotUpdatePaths}: ${error.message}`);
            }
          });
        }
      }

      const detailsEl = contentEl.createEl("details", {
        cls: "note-pilot-action-json-details",
      });
      detailsEl.createEl("summary", { text: text.editJson });
      this.textarea = detailsEl.createEl("textarea", {
        cls: "note-pilot-textarea note-pilot-action-json-textarea",
        text: this.initialValue,
      });
    } else {
    this.textarea = contentEl.createEl("textarea", {
      cls: "note-pilot-textarea",
      text: this.initialValue,
    });
    }

    const buttonRow = contentEl.createDiv({ cls: "note-pilot-modal-actions" });
    const text = getUiText(this.options.uiLanguage);
    const cancelButton = buttonRow.createEl("button", { text: text.cancel });
    cancelButton.addEventListener("click", () => {
      this.result = null;
      this.close();
    });

    const sendLabel = this.options.confirmLabel || (this.options.autoSend ? text.sendNow : text.insertIntoChatGPT);
    const confirmButton = buttonRow.createEl("button", {
      text: sendLabel,
      cls: "mod-cta",
    });
    confirmButton.addEventListener("click", () => {
      this.result = this.textarea.value;
      this.close();
    });
  }

  onClose() {
    this.contentEl.empty();
    if (this.options.onClose) {
      this.options.onClose(this.result);
    }
  }
}

function openPromptPreview(app, initialValue, options = {}) {
  return new Promise((resolve) => {
    const modal = new PromptPreviewModal(app, initialValue, {
      ...options,
      onClose: resolve,
    });
    modal.open();
  });
}

class ChatGptView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.messagesEl = null;
    this.inputEl = null;
    this.statusEl = null;
    this.modelSelectEl = null;
    this.progressEl = null;
    this.progressTimer = null;
    this.busyStartedAt = 0;
    this.isBusy = false;
    this.chatHistory = [];
  }

  getViewType() {
    return VIEW_TYPE_NOTE_PILOT;
  }

  getDisplayText() {
    return "Note Pilot";
  }

  getIcon() {
    return "messages-square";
  }

  getText() {
    return getUiText(this.plugin.settings.uiLanguage);
  }

  async onOpen() {
    const text = this.getText();
    this.containerEl.empty();
    this.containerEl.addClass("note-pilot-view");
    const shell = this.containerEl.createDiv({ cls: "note-pilot-shell" });
    const header = shell.createDiv({ cls: "note-pilot-header" });
    const titleWrap = header.createDiv();
    titleWrap.createEl("h2", { text: "Note Pilot" });
    titleWrap.createEl("p", {
      text: text.appSubtitle,
    });

    this.statusEl = header.createDiv({ cls: "note-pilot-status" });
    this.refreshStatus();

    const actions = shell.createDiv({ cls: "note-pilot-actions" });
    this.createActionButton(actions, text.askCurrentNote, () => this.askWithCurrentNote(false));
    this.createActionButton(actions, text.askSelection, () => this.askWithCurrentNote(true));
    this.createActionButton(actions, text.testConnection, () => this.testConnection());

    const webActions = shell.createDiv({ cls: "note-pilot-actions note-pilot-web-actions" });
    this.createActionButton(webActions, text.chatgptWeb, () => this.plugin.openWebApp("chatgpt"));
    this.createActionButton(webActions, text.claudeWeb, () => this.plugin.openWebApp("claude"));
    this.createActionButton(webActions, text.geminiWeb, () => this.plugin.openWebApp("gemini"));

    const modelRow = shell.createDiv({ cls: "note-pilot-model-row" });
    modelRow.createEl("label", { text: text.model });
    this.modelSelectEl = modelRow.createEl("select", {
      cls: "note-pilot-model-select",
    });
    this.modelSelectEl.addEventListener("change", () => void this.selectModel(this.modelSelectEl.value));
    this.refreshModelSelect();

    this.progressEl = shell.createDiv({ cls: "note-pilot-progress" });
    this.progressEl.setText(text.ready);

    this.messagesEl = shell.createDiv({ cls: "note-pilot-messages" });
    this.appendMessage("assistant", text.introMessage);

    const composer = shell.createDiv({ cls: "note-pilot-composer" });
    this.inputEl = composer.createEl("textarea", {
      cls: "note-pilot-chat-input",
      attr: {
        placeholder: text.inputPlaceholder,
      },
    });
    this.inputEl.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" || event.shiftKey || this.isBusy) {
        return;
      }
      event.preventDefault();
      void this.askWithCurrentNote(false);
    });
    const composerActions = composer.createDiv({ cls: "note-pilot-composer-actions" });
    this.createActionButton(composerActions, text.askWithNote, () => this.askWithCurrentNote(false), true);
  }

  refreshStatus() {
    if (!this.statusEl) {
      return;
    }
    const provider = createProviderConfig(this.plugin.settings);
    const text = this.getText();
    this.statusEl.empty();
    this.statusEl.createEl("span", { text: provider.provider === "openai-oauth" ? "openai-oauth" : text.providerApiKey });
    this.statusEl.createEl("small", { text: provider.baseUrl });
  }

  getModelState() {
    const provider = createProviderConfig(this.plugin.settings);
    if (provider.provider === "openai-oauth") {
      return {
        currentModel: this.plugin.settings.oauthModel,
        options: this.plugin.settings.oauthModelOptions || [],
      };
    }
    return {
      currentModel: this.plugin.settings.apiModel,
      options: this.plugin.settings.apiModelOptions || [],
    };
  }

  refreshModelSelect() {
    if (!this.modelSelectEl) {
      return;
    }
    const { currentModel, options } = this.getModelState();
    const modelOptions = Array.from(new Set([currentModel, ...options].filter(Boolean)));
    this.modelSelectEl.empty();
    for (const model of modelOptions) {
      const option = this.modelSelectEl.createEl("option", {
        text: model,
      });
      option.value = model;
      option.selected = model === currentModel;
    }
    this.modelSelectEl.disabled = modelOptions.length <= 1;
  }

  async selectModel(model) {
    const nextModel = `${model || ""}`.trim();
    if (!nextModel) {
      return;
    }
    await this.plugin.setCurrentModel(nextModel);
    this.refreshStatus();
    this.refreshModelSelect();
    new Notice(this.getText().modelSelected(nextModel));
  }

  createActionButton(parent, label, onClick, primary = false) {
    const button = parent.createEl("button", {
      text: label,
      cls: primary ? "mod-cta" : "",
    });
    button.addEventListener("click", () => void onClick());
    return button;
  }

  appendMessage(role, text, options = {}) {
    if (!this.messagesEl) {
      return null;
    }
    const message = this.messagesEl.createDiv({
      cls: `note-pilot-message note-pilot-message-${role}${options.pending ? " note-pilot-message-pending" : ""}`,
    });
    message.createEl("div", {
      cls: "note-pilot-message-role",
      text: role === "user" ? this.getText().you : this.getText().assistant,
    });
    const contentEl = message.createEl("div", {
      cls: "note-pilot-message-content",
      text,
    });
    const copyButton = message.createEl("button", {
      cls: "note-pilot-message-copy",
      text: this.getText().copy,
    });
    copyButton.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(contentEl.textContent || "");
        new Notice(this.getText().messageCopied);
      } catch (error) {
        new Notice(`${this.getText().copyFailed}: ${error.message}`);
      }
    });
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    return {
      messageEl: message,
      contentEl,
      update: (nextText) => {
        contentEl.setText(nextText);
        this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
      },
      finish: (nextText) => {
        message.removeClass("note-pilot-message-pending");
        contentEl.setText(nextText);
        this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
      },
    };
  }

  rememberChatMessage(role, content) {
    const trimmedContent = `${content || ""}`.trim();
    if (!trimmedContent) {
      return;
    }
    this.chatHistory.push({ role, content: trimmedContent });
    this.chatHistory = this.chatHistory.slice(-8);
  }

  buildQuestionWithHistory(question) {
    const history = formatChatHistory(this.chatHistory, 6);
    const trimmedQuestion = `${question || ""}`.trim();
    if (!history) {
      return trimmedQuestion;
    }
    return `${history}\n\nCurrent user question:\n${trimmedQuestion}`;
  }

  setProgress(text) {
    if (this.progressEl) {
      this.progressEl.setText(text);
    }
  }

  setBusy(isBusy, label = this.getText().working) {
    this.isBusy = isBusy;
    window.clearInterval(this.progressTimer);
    this.progressTimer = null;
    if (isBusy) {
      this.containerEl.addClass("note-pilot-busy");
      this.busyStartedAt = Date.now();
      const update = () => {
        const seconds = Math.max(0, Math.floor((Date.now() - this.busyStartedAt) / 1000));
        this.setProgress(`${label} · ${seconds}s`);
      };
      update();
      this.progressTimer = window.setInterval(update, 1000);
    } else {
      this.containerEl.removeClass("note-pilot-busy");
      this.setProgress(this.getText().ready);
    }
  }

  async askWithCurrentNote(selectionOnly) {
    if (this.isBusy) {
      return;
    }
    const question = this.inputEl ? this.inputEl.value.trim() : "";
    let pendingTimer = null;
    let pendingMessage = null;
    try {
      const prompt = await this.plugin.buildPromptFromActiveMarkdownView(selectionOnly, this.buildQuestionWithHistory(question));
      const text = this.getText();
      const fallbackQuestion = question || (selectionOnly ? text.askSelectionFallback : text.askCurrentNoteFallback);
      this.appendMessage("user", fallbackQuestion);
      this.rememberChatMessage("user", fallbackQuestion);
      if (this.inputEl) {
        this.inputEl.value = "";
      }
      this.setBusy(true, text.waitingForModel);
      pendingMessage = this.appendMessage("assistant", `${text.thinking}... 0s`, { pending: true });
      const pendingStartedAt = Date.now();
      pendingTimer = window.setInterval(() => {
        const seconds = Math.max(0, Math.floor((Date.now() - pendingStartedAt) / 1000));
        pendingMessage?.update(`${text.thinking}... ${seconds}s`);
      }, 1000);
      const answer = await this.plugin.askModelWithPrompt(prompt);
      window.clearInterval(pendingTimer);
      pendingTimer = null;
      const displayAnswer = stripVaultActionJsonFromModelAnswer(answer);
      pendingMessage?.finish(displayAnswer);
      this.rememberChatMessage("assistant", displayAnswer);
      try {
        const foundVaultActions = await this.plugin.reviewAndApplyVaultActionsFromAnswer(answer);
        if (!foundVaultActions) {
          await this.plugin.reviewAndApplyAppendFallbackFromAnswer(answer, question);
        }
      } catch (error) {
        new Notice(`${this.getText().vaultActionFailed}: ${error.message}`);
      }
    } catch (error) {
      if (pendingTimer) {
        window.clearInterval(pendingTimer);
      }
      new Notice(error.message);
      if (pendingMessage) {
        pendingMessage.finish(`${this.getText().errorPrefix}: ${error.message}`);
      } else {
        this.appendMessage("assistant", `${this.getText().errorPrefix}: ${error.message}`);
      }
    } finally {
      this.setBusy(false);
    }
  }

  async testConnection() {
    let pendingTimer = null;
    let pendingMessage = null;
    try {
      const text = this.getText();
      this.appendMessage("user", text.testConnectionMessage);
      this.setBusy(true, text.checkingProvider);
      pendingMessage = this.appendMessage("assistant", `${text.checkingProvider}... 0s`, { pending: true });
      const pendingStartedAt = Date.now();
      pendingTimer = window.setInterval(() => {
        const seconds = Math.max(0, Math.floor((Date.now() - pendingStartedAt) / 1000));
        pendingMessage?.update(`${text.checkingProvider}... ${seconds}s`);
      }, 1000);
      const result = await this.plugin.llmClient.testConnection();
      window.clearInterval(pendingTimer);
      pendingTimer = null;
      await this.plugin.rememberProviderModels(result.models);
      this.refreshModelSelect();
      const modelText = result.models.length ? ` ${text.availableModels}: ${result.models.slice(0, 6).join(", ")}` : "";
      pendingMessage?.finish(`${text.connectionOk}${modelText}`);
    } catch (error) {
      if (pendingTimer) {
        window.clearInterval(pendingTimer);
      }
      new Notice(error.message);
      if (pendingMessage) {
        pendingMessage.finish(`${this.getText().connectionFailed}: ${error.message}`);
      } else {
        this.appendMessage("assistant", `${this.getText().connectionFailed}: ${error.message}`);
      }
    } finally {
      this.setBusy(false);
    }
  }
}

class AiWebAppView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.providerId = "chatgpt";
    this.webviewEl = null;
  }

  getViewType() {
    return VIEW_TYPE_AI_WEBAPP;
  }

  getDisplayText() {
    return `${this.getWebApp().name} Web`;
  }

  getIcon() {
    return "bot";
  }

  getWebApp() {
    return AI_WEB_APPS[this.providerId] || AI_WEB_APPS.chatgpt;
  }

  async setState(state) {
    this.providerId = state?.providerId || this.providerId || "chatgpt";
    await this.render();
  }

  getState() {
    return {
      providerId: this.providerId,
    };
  }

  async onOpen() {
    await this.render();
  }

  async render() {
    if (!this.containerEl) {
      return;
    }
    const webApp = this.getWebApp();
    this.containerEl.empty();
    this.containerEl.addClass("note-pilot-view");
    const text = getUiText(this.plugin.settings.uiLanguage);

    const shell = this.containerEl.createDiv({ cls: "note-pilot-shell" });
    const header = shell.createDiv({ cls: "note-pilot-header" });
    const titleWrap = header.createDiv();
    titleWrap.createEl("h2", { text: `${webApp.name} Web` });
    titleWrap.createEl("p", { text: webApp.url });

    const actions = shell.createDiv({ cls: "note-pilot-actions" });
    this.createActionButton(actions, text.bridgeChat, () => this.plugin.switchWebAppToBridge());
    this.createActionButton(actions, "ChatGPT", () => this.plugin.openWebApp("chatgpt"));
    this.createActionButton(actions, "Claude", () => this.plugin.openWebApp("claude"));
    this.createActionButton(actions, "Gemini", () => this.plugin.openWebApp("gemini"));
    this.createActionButton(actions, text.reload, () => this.reload());

    const frameWrap = shell.createDiv({ cls: "note-pilot-webview-wrap" });
    const webview = document.createElement("webview");
    webview.classList.add("note-pilot-webview");
    webview.setAttribute("src", webApp.url);
    webview.setAttribute("allowpopups", "");
    webview.setAttribute("partition", `persist:note-pilot-${webApp.id}`);
    frameWrap.appendChild(webview);
    this.webviewEl = webview;
  }

  createActionButton(parent, label, onClick) {
    const button = parent.createEl("button", { text: label });
    button.addEventListener("click", () => void onClick());
    return button;
  }

  reload() {
    if (this.webviewEl && typeof this.webviewEl.reload === "function") {
      this.webviewEl.reload();
    }
  }
}

class NotePilotSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  getText() {
    return getUiText(this.plugin.settings.uiLanguage);
  }

  openNodeInstallTerminal() {
    const text = this.getText();
    try {
      openNodeJsInstallTerminal();
      new Notice(text.nodeInstallNotice);
    } catch (error) {
      new Notice(`${text.nodeInstallFailed}: ${error.message}`);
    }
  }

  openOauthInstallTerminal() {
    const text = this.getText();
    try {
      openOpenAiOauthInstallTerminal();
      new Notice(text.oauthInstallNotice);
    } catch (error) {
      new Notice(`${text.oauthInstallFailed}: ${error.message}`);
    }
  }

  openOauthSetupTerminal() {
    const text = this.getText();
    try {
      openOpenAiOauthSetupTerminal();
      new Notice(text.oauthSetupNotice);
    } catch (error) {
      new Notice(`${text.oauthSetupFailed}: ${error.message}`);
    }
  }

  async testSelectedProvider(button) {
    const text = this.getText();
    try {
      button.setDisabled(true);
      button.setButtonText(text.testing);
      const result = await this.plugin.llmClient.testConnection();
      await this.plugin.rememberProviderModels(result.models);
      const modelText = result.models.length ? " " + text.availableModels + ": " + result.models.slice(0, 6).join(", ") : "";
      new Notice(text.connected + modelText);
      this.display();
    } catch (error) {
      new Notice(text.providerFailed + ": " + error.message);
    } finally {
      button.setDisabled(false);
      button.setButtonText(this.getText().testConnection);
    }
  }

  createModelSetting(containerEl, { name, desc, modelKey, optionsKey }) {
    const text = this.getText();
    const currentModel = this.plugin.settings[modelKey] || "";
    const options = Array.from(new Set([currentModel, ...(this.plugin.settings[optionsKey] || [])].filter(Boolean)));
    const setting = new Setting(containerEl)
      .setName(name)
      .setDesc(desc);

    if (options.length > 1) {
      setting.addDropdown((dropdown) => {
        for (const model of options) {
          dropdown.addOption(model, model);
        }
        dropdown
          .setValue(currentModel)
          .onChange(async (value) => {
            this.plugin.settings[modelKey] = value;
            await this.plugin.saveSettings();
            this.plugin.refreshOpenViews();
          });
      });
    }

    setting.addText((input) =>
      input
        .setPlaceholder(text.modelManualPlaceholder)
        .setValue(currentModel)
        .onChange(async (value) => {
          this.plugin.settings[modelKey] = value.trim();
          await this.plugin.saveSettings();
          this.plugin.refreshOpenViews();
        }),
    );
  }

  createApiProviderPresetSetting(containerEl) {
    const text = this.getText();
    new Setting(containerEl)
      .setName(text.apiProviderName)
      .setDesc(text.apiProviderDesc)
      .addDropdown((dropdown) => {
        for (const preset of Object.values(API_PROVIDER_PRESETS)) {
          dropdown.addOption(preset.id, preset.name);
        }
        dropdown
          .setValue(this.plugin.settings.apiProviderPreset || "openai")
          .onChange(async (value) => {
            const preset = API_PROVIDER_PRESETS[value] || API_PROVIDER_PRESETS.custom;
            this.plugin.settings.apiProviderPreset = preset.id;
            this.plugin.settings.apiProviderType = preset.type || "openai-compatible";
            if (preset.baseUrl) {
              this.plugin.settings.apiBaseUrl = preset.baseUrl;
            }
            if (preset.model) {
              this.plugin.settings.apiModel = preset.model;
            }
            await this.plugin.saveSettings();
            this.display();
            this.plugin.refreshOpenViews();
          });
      });
  }

  display() {
    const { containerEl } = this;
    const text = this.getText();
    containerEl.empty();
    containerEl.createEl("h2", { text: text.settingsTitle });
    containerEl.createEl("p", {
      cls: "note-pilot-settings-help",
      text: text.settingsHelp,
    });

    new Setting(containerEl)
      .setName(text.providerModeName)
      .setDesc(text.providerModeDesc)
      .addDropdown((dropdown) =>
        dropdown
          .addOption("openai-oauth", text.providerOAuth)
          .addOption("openai-compatible", text.providerApi)
          .setValue(this.plugin.settings.provider)
          .onChange(async (value) => {
            this.plugin.settings.provider = value;
            await this.plugin.saveSettings();
            this.display();
            this.plugin.refreshOpenViews();
          }),
      );

    new Setting(containerEl)
      .setName(text.testConnectionName)
      .setDesc(text.testConnectionDesc)
      .addButton((button) =>
        button
          .setButtonText(text.testConnection)
          .onClick(() => void this.testSelectedProvider(button)),
      );

    new Setting(containerEl)
      .setName(text.uiLanguageName)
      .setDesc(text.uiLanguageDesc)
      .addDropdown((dropdown) =>
        dropdown
          .addOption("auto", text.autoLanguage)
          .addOption("ko", text.koreanLanguage)
          .addOption("en", text.englishLanguage)
          .setValue(this.plugin.settings.uiLanguage || "auto")
          .onChange(async (value) => {
            this.plugin.settings.uiLanguage = value;
            await this.plugin.saveSettings();
            this.display();
            this.plugin.refreshOpenViews();
          }),
      );

    if (this.plugin.settings.provider === "openai-oauth") {
      containerEl.createEl("h3", { text: text.oauthSection });

      const platformLabel = getPlatformLabel();
      const detectedOsName = text.detectedOsName || "Detected OS";
      const detectedOsDesc = typeof text.detectedOsDesc === "function"
        ? text.detectedOsDesc(platformLabel)
        : `Setup buttons will use ${platformLabel}-specific terminal commands.`;
      new Setting(containerEl)
        .setName(detectedOsName)
        .setDesc(detectedOsDesc);

      new Setting(containerEl)
        .setName(text.nodeInstallName)
        .setDesc(text.nodeInstallDesc)
        .addButton((button) =>
          button
            .setButtonText(text.nodeInstallButton)
            .onClick(() => this.openNodeInstallTerminal()),
        );

      new Setting(containerEl)
        .setName(text.oauthInstallName)
        .setDesc(text.oauthInstallDesc)
        .addButton((button) =>
          button
            .setButtonText(text.oauthInstallButton)
            .onClick(() => this.openOauthInstallTerminal()),
        );

      new Setting(containerEl)
        .setName(text.oauthSetupName)
        .setDesc(text.oauthSetupDesc)
        .addButton((button) =>
          button
            .setButtonText(text.oauthSetupButton)
            .onClick(() => this.openOauthSetupTerminal()),
        );

      new Setting(containerEl)
        .setName(text.oauthBaseUrlName)
        .setDesc(text.oauthBaseUrlDesc)
        .addText((input) =>
          input.setValue(this.plugin.settings.oauthBaseUrl).onChange(async (value) => {
            this.plugin.settings.oauthBaseUrl = value.trim();
            await this.plugin.saveSettings();
            this.plugin.refreshOpenViews();
          }),
        );

      this.createModelSetting(containerEl, {
        name: text.modelName,
        desc: text.modelDesc,
        modelKey: "oauthModel",
        optionsKey: "oauthModelOptions",
      });
    } else {
      containerEl.createEl("h3", { text: text.apiSection });

      this.createApiProviderPresetSetting(containerEl);

      new Setting(containerEl)
        .setName(text.apiBaseUrlName)
        .setDesc(text.apiBaseUrlDesc)
        .addText((input) =>
          input.setValue(this.plugin.settings.apiBaseUrl).onChange(async (value) => {
            this.plugin.settings.apiProviderPreset = "custom";
            this.plugin.settings.apiProviderType = "openai-compatible";
            this.plugin.settings.apiBaseUrl = value.trim();
            await this.plugin.saveSettings();
            this.plugin.refreshOpenViews();
          }),
        );

      this.createModelSetting(containerEl, {
        name: text.apiModelName,
        desc: text.modelDesc,
        modelKey: "apiModel",
        optionsKey: "apiModelOptions",
      });

      new Setting(containerEl)
        .setName(text.apiKeyName)
        .setDesc(text.apiKeyDesc)
        .addText((input) => {
          input.inputEl.type = "password";
          input
            .setPlaceholder("sk-...")
            .setValue(this.plugin.settings.apiKey)
            .onChange(async (value) => {
              this.plugin.settings.apiKey = value.trim();
              await this.plugin.saveSettings();
            });
        });
    }

    new Setting(containerEl)
      .setName(text.temperatureName)
      .setDesc(text.temperatureDesc)
      .addText((input) =>
        input.setPlaceholder("0.2").setValue(String(this.plugin.settings.temperature)).onChange(async (value) => {
          const nextValue = Number.parseFloat(value);
          this.plugin.settings.temperature = Number.isFinite(nextValue)
            ? Math.max(0, Math.min(2, nextValue))
            : DEFAULT_SETTINGS.temperature;
          await this.plugin.saveSettings();
        }),
      );

    containerEl.createEl("h3", { text: text.promptSection });

    new Setting(containerEl)
      .setName(text.promptTemplateName)
      .setDesc(text.promptTemplateDesc)
      .addTextArea((input) => {
        input
          .setValue(this.plugin.settings.promptTemplate)
          .onChange(async (value) => {
            this.plugin.settings.promptTemplate = value;
            await this.plugin.saveSettings();
          });
        input.inputEl.rows = 8;
        input.inputEl.addClass("note-pilot-settings-textarea");
      });

    new Setting(containerEl)
      .setName(text.autoSendName)
      .setDesc(text.autoSendDesc)
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.autoSend).onChange(async (value) => {
          this.plugin.settings.autoSend = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName(text.betaWarningName)
      .setDesc(text.betaWarningDesc)
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.showBetaWarning).onChange(async (value) => {
          this.plugin.settings.showBetaWarning = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName(text.openStartupName)
      .setDesc(text.openStartupDesc)
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.openViewOnStartup).onChange(async (value) => {
          this.plugin.settings.openViewOnStartup = value;
          await this.plugin.saveSettings();
        }),
      );
  }
}

class NotePilotPlugin extends Plugin {
  async onload() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.llmClient = new LlmClient(this.settings, createRequestUrlFetch(requestUrl));

    this.registerView(
      VIEW_TYPE_NOTE_PILOT,
      (leaf) => new ChatGptView(leaf, this),
    );
    this.registerView(
      VIEW_TYPE_AI_WEBAPP,
      (leaf) => new AiWebAppView(leaf, this),
    );

    this.addRibbonIcon("messages-square", "Toggle Note Pilot", () => {
      void this.toggleView();
    });

    this.addCommand({
      id: "open-note-pilot",
      name: "Open Note Pilot",
      callback: () => void this.activateView(),
    });

    this.addCommand({
      id: "toggle-note-pilot",
      name: "Toggle Note Pilot",
      callback: () => void this.toggleView(),
    });

    this.addCommand({
      id: "open-chatgpt-webview",
      name: "Open ChatGPT webview",
      callback: () => void this.openWebApp("chatgpt"),
    });

    this.addCommand({
      id: "open-claude-webview",
      name: "Open Claude webview",
      callback: () => void this.openWebApp("claude"),
    });

    this.addCommand({
      id: "open-gemini-webview",
      name: "Open Gemini webview",
      callback: () => void this.openWebApp("gemini"),
    });

    this.addCommand({
      id: "ask-current-note",
      name: "Ask model about current note",
      callback: () => void this.askModelAboutActiveNote(false),
    });

    this.addCommand({
      id: "ask-selected-text",
      name: "Ask model about selected text",
      editorCallback: (_editor, view) => void this.askModelAboutMarkdownView(view, true),
    });

    this.addCommand({
      id: "apply-vault-action-json-from-clipboard",
      name: "Apply vault action JSON from clipboard",
      callback: () => void this.applyVaultActionJsonFromClipboard(),
    });

    this.addSettingTab(new NotePilotSettingTab(this.app, this));

    if (this.settings.openViewOnStartup) {
      this.app.workspace.onLayoutReady(() => {
        void this.activateView();
      });
    }
  }

  async onunload() {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_NOTE_PILOT);
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_AI_WEBAPP);
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
    this.llmClient = new LlmClient(this.settings, createRequestUrlFetch(requestUrl));
  }

  refreshOpenViews() {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_NOTE_PILOT)) {
      if (leaf.view && typeof leaf.view.onOpen === "function") {
        void leaf.view.onOpen();
      }
    }
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_AI_WEBAPP)) {
      if (leaf.view && typeof leaf.view.onOpen === "function") {
        void leaf.view.onOpen();
      }
    }
  }

  async buildPathBaseOptions() {
    const options = [
      { label: "Vault root", labelKey: "vaultRoot", path: "" },
    ];
    const view = await this.getActiveMarkdownView();
    const currentFolder = getPathParent(view?.file?.path || "");
    if (currentFolder) {
      options.push({ label: "Current folder", labelKey: "currentFolder", path: currentFolder });
    }
    return options;
  }

  async applyVaultActionJsonFromClipboard() {
    try {
      if (!navigator.clipboard || !navigator.clipboard.readText) {
        new Notice(getUiText(this.settings.uiLanguage).clipboardUnavailable);
        return;
      }

      const clipboardText = await navigator.clipboard.readText();
      let summaryItems = [];
      try {
        summaryItems = summarizeVaultActions(parseVaultActionJson(clipboardText));
      } catch (_error) {
        summaryItems = [];
      }
      const uiText = getUiText(this.settings.uiLanguage);
      const reviewedJson = await openPromptPreview(this.app, clipboardText, {
        title: uiText.reviewVaultActions,
        description: uiText.reviewClipboardDescription,
        confirmLabel: uiText.applyActions,
        summaryItems,
        pathBases: await this.buildPathBaseOptions(),
        preventBackgroundClose: true,
        uiLanguage: this.settings.uiLanguage,
      });

      if (!reviewedJson) {
        return;
      }

      let reviewedActions;
      try {
        reviewedActions = parseVaultActionJson(reviewedJson);
      } catch (error) {
        throw new Error(getUiText(this.settings.uiLanguage).invalidClipboardJson);
      }
      const results = await executeVaultActions(this.app.vault, reviewedActions);
      new Notice(getUiText(this.settings.uiLanguage).appliedVaultActions(results.length));
    } catch (error) {
      new Notice(`${getUiText(this.settings.uiLanguage).vaultActionFailed}: ${error.message}`);
    }
  }

  async activateView() {
    let leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_NOTE_PILOT)[0];
    if (!leaf) {
      leaf = this.app.workspace.getRightLeaf(false);
      await leaf.setViewState({
        type: VIEW_TYPE_NOTE_PILOT,
        active: true,
      });
    }
    this.app.workspace.revealLeaf(leaf);
    return leaf.view;
  }

  async openWebApp(providerId = "chatgpt") {
    const webApp = AI_WEB_APPS[providerId] || AI_WEB_APPS.chatgpt;
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_NOTE_PILOT);
    let leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_AI_WEBAPP)[0];
    if (!leaf) {
      leaf = this.app.workspace.getRightLeaf(false);
    }
    await leaf.setViewState({
      type: VIEW_TYPE_AI_WEBAPP,
      active: true,
      state: {
        providerId: webApp.id,
      },
    });
    this.app.workspace.revealLeaf(leaf);
    return leaf.view;
  }

  async switchWebAppToBridge() {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_AI_WEBAPP);
    return this.activateView();
  }

  async toggleView() {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_NOTE_PILOT);
    if (leaves.length) {
      this.app.workspace.detachLeavesOfType(VIEW_TYPE_NOTE_PILOT);
      return null;
    }
    return this.activateView();
  }

  async rememberProviderModels(models) {
    const cleanModels = Array.from(new Set((models || []).map((model) => `${model || ""}`.trim()).filter(Boolean)));
    if (!cleanModels.length) {
      return;
    }
    const provider = createProviderConfig(this.settings);
    if (provider.provider === "openai-oauth") {
      this.settings.oauthModelOptions = cleanModels;
      if (!cleanModels.includes(this.settings.oauthModel)) {
        this.settings.oauthModel = cleanModels[0];
      }
    } else {
      this.settings.apiModelOptions = cleanModels;
      if (!cleanModels.includes(this.settings.apiModel)) {
        this.settings.apiModel = cleanModels[0];
      }
    }
    await this.saveSettings();
  }

  async setCurrentModel(model) {
    const provider = createProviderConfig(this.settings);
    if (provider.provider === "openai-oauth") {
      this.settings.oauthModel = model;
    } else {
      this.settings.apiModel = model;
    }
    await this.saveSettings();
  }

  async getActiveMarkdownView() {
    return selectMarkdownView({
      activeView: this.app.workspace.getActiveViewOfType(MarkdownView),
      markdownLeaves: this.app.workspace.getLeavesOfType("markdown"),
    });
  }

  async sendActiveNote(selectionOnly) {
    await this.askModelAboutActiveNote(selectionOnly);
  }

  async sendMarkdownView(view, selectionOnly) {
    await this.askModelAboutMarkdownView(view, selectionOnly);
  }

  async buildPromptFromActiveMarkdownView(selectionOnly, question = "") {
    const view = await this.getActiveMarkdownView();
    if (!view) {
      throw new Error(getUiText(this.settings.uiLanguage).openMarkdownFirst);
    }
    return this.buildPromptFromMarkdownView(view, selectionOnly, question);
  }

  buildPromptFromMarkdownView(view, selectionOnly, question = "") {
    const editor = view.editor;
    const file = view.file;
    if (!editor || !file) {
      throw new Error(getUiText(this.settings.uiLanguage).couldNotReadNote);
    }
    const selectedText = selectionOnly ? editor.getSelection() : "";
    if (selectionOnly && !selectedText.trim()) {
      throw new Error(getUiText(this.settings.uiLanguage).selectTextFirst);
    }
    const prompt = buildChatGptPrompt({
      filePath: file.path,
      content: editor.getValue(),
      selectedText,
      template: this.settings.promptTemplate,
    });
    const trimmedQuestion = `${question || ""}`.trim();
    if (!trimmedQuestion) {
      return prompt;
    }
    return `${prompt}\n\nUser question:\n${trimmedQuestion}`;
  }

  async askModelWithPrompt(prompt) {
    const provider = createProviderConfig(this.settings);
    if (provider.requiresApiKey && !provider.apiKey) {
      throw new Error("API key is required for the selected provider.");
    }
    return this.llmClient.complete([
      {
        role: "system",
        content: [
          "You are an assistant running inside Obsidian.",
          "Answer normally for reading, summarizing, explaining, brainstorming, and Q&A.",
          "When the user asks in any language to write, create, save, append, insert, update, edit, rewrite, replace, modify, or otherwise put content into the Obsidian vault, you MUST propose vault actions.",
          "This includes Korean requests like 작성해줘, 써줘, 만들어줘, 저장해줘, 추가해줘, 붙여줘, 이어서 써줘, 수정해줘, 바꿔줘, 고쳐줘, 업데이트해줘, 반영해줘, 현재 파일에 넣어줘.",
          "This also includes follow-ups like 1번/2번/3번으로 진행해줘, 그걸로 해줘, 위 내용 적용해줘 when prior conversation offered options or draft content.",
          "Never say that a file has already been changed, saved, created, or modified. The plugin will show a review dialog before applying actions.",
          "For vault actions, output exactly one short proposal sentence in the user's language, then one fenced JSON block labeled json, and no text after the JSON block.",
          "The proposal sentence must say the change is proposed, not completed. Good Korean: 검토 후 적용할 변경안을 만들었습니다. Good English: I prepared the vault change for review.",
          "Supported actions: create_folder, create_note, append_note, modify_note. Prefer append_note for add/write/current file requests. Use modify_note only when the user clearly asks to replace or rewrite the whole file.",
          "JSON schema: {\"actions\":[{\"action\":\"create_note | append_note | modify_note | create_folder\",\"path\":\"vault-relative/path.md\",\"content\":\"markdown content\"}]}",
          "Use vault-relative paths only. Never use absolute paths. If the user says current file, use the provided File path from the note context.",
          "For new standalone folders or notes, default to the vault root when the user does not name a parent folder. Do not nest new folders under the current file's folder unless the user says current folder, this project, inside this folder, 이 폴더 안에, 현재 폴더에, or this note's folder.",
          "If the user asks for the top-level/root folder, use a root-level path like Topic/index.md, not Current/Folder/Topic/index.md.",
          "If the user selects an option by number, resolve it from the prior conversation and write the selected option's content.",
          "If the target file or content is unclear, ask one short clarification question instead of producing JSON.",
        ].join(" "),
      },
      {
        role: "user",
        content: prompt,
      },
    ]);
  }

  async askModelAboutActiveNote(selectionOnly) {
    const view = await this.getActiveMarkdownView();
    if (!view) {
      new Notice(getUiText(this.settings.uiLanguage).openMarkdownFirst);
      return;
    }
    await this.askModelAboutMarkdownView(view, selectionOnly);
  }

  async askModelAboutMarkdownView(view, selectionOnly) {
    let prompt;
    try {
      prompt = this.buildPromptFromMarkdownView(view, selectionOnly);
    } catch (error) {
      new Notice(error.message);
      return;
    }

    const reviewedPrompt = await openPromptPreview(this.app, prompt, {
      autoSend: true,
      uiLanguage: this.settings.uiLanguage,
    });
    if (!reviewedPrompt) {
      return;
    }

    try {
      new Notice(getUiText(this.settings.uiLanguage).askingModel);
      const answer = await this.askModelWithPrompt(reviewedPrompt);
      await this.reviewAndApplyVaultActionsFromAnswer(answer);
      await this.showModelAnswer(stripVaultActionJsonFromModelAnswer(answer));
    } catch (error) {
      new Notice(`${getUiText(this.settings.uiLanguage).modelRequestFailed}: ${error.message}`);
    }
  }

  async reviewAndApplyVaultActionsFromAnswer(answer) {
    const actionJson = extractVaultActionJsonFromModelAnswer(answer);
    if (!actionJson) {
      return false;
    }
    const summaryItems = summarizeVaultActions(parseVaultActionJson(actionJson));
    const uiText = getUiText(this.settings.uiLanguage);

    const reviewedJson = await openPromptPreview(this.app, actionJson, {
      title: uiText.reviewVaultActions,
      description: uiText.reviewVaultActionsDescription,
      confirmLabel: uiText.applyActions,
      summaryItems,
      pathBases: await this.buildPathBaseOptions(),
      preventBackgroundClose: true,
      uiLanguage: this.settings.uiLanguage,
    });
    if (!reviewedJson) {
      return true;
    }

    let reviewedActions;
    try {
      reviewedActions = parseVaultActionJson(reviewedJson);
    } catch (_error) {
      throw new Error(uiText.invalidModelActionJson);
    }

    const results = await executeVaultActions(this.app.vault, reviewedActions);
    new Notice(uiText.appliedVaultActions(results.length));
    return true;
  }

  async reviewAndApplyAppendFallbackFromAnswer(answer, question) {
    if (!hasVaultWriteIntent(question)) {
      return false;
    }

    const displayAnswer = stripVaultActionJsonFromModelAnswer(answer);
    if (!displayAnswer) {
      return false;
    }

    const view = await this.getActiveMarkdownView();
    if (!view?.file?.path) {
      return false;
    }

    const fallbackJson = buildAppendCurrentNoteActionJson({
      path: view.file.path,
      content: displayAnswer,
    });
    const uiText = getUiText(this.settings.uiLanguage);

    const reviewedJson = await openPromptPreview(this.app, fallbackJson, {
      title: uiText.reviewAppendFallback,
      description: uiText.reviewAppendFallbackDescription,
      confirmLabel: uiText.appendToNote,
      summaryItems: summarizeVaultActions(parseVaultActionJson(fallbackJson)),
      pathBases: await this.buildPathBaseOptions(),
      preventBackgroundClose: true,
      uiLanguage: this.settings.uiLanguage,
    });
    if (!reviewedJson) {
      return true;
    }

    let reviewedActions;
    try {
      reviewedActions = parseVaultActionJson(reviewedJson);
    } catch (_error) {
      throw new Error(uiText.invalidFallbackActionJson);
    }

    const results = await executeVaultActions(this.app.vault, reviewedActions);
    new Notice(uiText.appliedVaultActions(results.length));
    return true;
  }

  async showModelAnswer(answer) {
    const leaf = this.app.workspace.getLeaf("split");
    const fileName = `Note Pilot Answer ${new Date().toISOString().replace(/[:.]/g, "-")}.md`;
    const file = await this.app.vault.create(fileName, answer);
    await leaf.openFile(file);
  }
}

module.exports = NotePilotPlugin;

