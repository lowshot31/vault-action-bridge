const DEFAULT_PROMPT_TEMPLATE = [
  "You are helping me with notes from Obsidian.",
  "File: {{filePath}}",
  "",
  "Content:",
  "{{content}}",
].join("\n");

function normalizeSourceContent({ content = "", selectedText = "" }) {
  const trimmedSelection = `${selectedText}`.trim();
  if (trimmedSelection) {
    return trimmedSelection;
  }
  return `${content}`.trim();
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
  template = DEFAULT_PROMPT_TEMPLATE,
}) {
  const normalizedContent = normalizeSourceContent({ content, selectedText });
  return applyTemplate(template || DEFAULT_PROMPT_TEMPLATE, {
    filePath: filePath || "Untitled",
    content: normalizedContent,
    hasSelection: Boolean(selectedText && `${selectedText}`.trim()),
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

module.exports = {
  DEFAULT_PROMPT_TEMPLATE,
  applyTemplate,
  buildChatGptPrompt,
  formatChatHistory,
  normalizeSourceContent,
};
