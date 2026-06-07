const COMPOSER_SELECTORS = [
  "textarea[data-id='composer-text-input']",
  "#prompt-textarea",
  "textarea[placeholder*='Message']",
  "textarea",
];

function escapeForTemplateLiteral(value) {
  return `${value}`
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\$\{/g, "\\${");
}

function buildInjectionScript(prompt) {
  const escapedPrompt = escapeForTemplateLiteral(prompt);
  const selectors = JSON.stringify(COMPOSER_SELECTORS);

  return `
    (() => {
      const composerSelectors = ${selectors}; // composer selectors
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

      return {
        injected: true,
        canSend: Boolean(sendButton),
      };
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

module.exports = {
  buildInjectionScript,
  COMPOSER_SELECTORS,
  escapeForTemplateLiteral,
  normalizeInjectionError,
};
