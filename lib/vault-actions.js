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

module.exports = {
  buildAppendCurrentNoteActionJson,
  executeVaultAction,
  executeVaultActions,
  extractVaultActionJsonFromModelAnswer,
  hasVaultWriteIntent,
  isVaultActionPayload,
  parseVaultActionJson,
  stripVaultActionJsonFromModelAnswer,
  summarizeVaultActions,
};
