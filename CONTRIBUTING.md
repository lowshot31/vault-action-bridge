# Contributing

Thanks for helping improve Vault Action Bridge.

This project is intentionally small: plain JavaScript, CommonJS modules, no runtime dependencies, and Node.js built-in tests. That makes the release artifact easy to inspect and keeps the plugin easier to review for Obsidian users.

## Development Setup

Install Node.js, then run:

```bash
npm test
```

Before opening a pull request or publishing a release, run:

```bash
npm run verify
```

`npm run verify` runs the test suite and the release metadata check.

## Project Structure

```text
main.js                 Obsidian plugin entry point and bundled runtime code
styles.css              Plugin styles
manifest.json           Obsidian plugin metadata
versions.json           Obsidian min-version mapping
lib/                    Testable modules shared with main.js
tests/                  Node.js test suite
docs/RELEASE.md         Release checklist and Obsidian submission notes
SECURITY.md             Security model and reporting guidance
scripts/release-check.js Release consistency checker
```

## How To Change Features Safely

### Provider or model changes

Update both the constants and request builder tests.

Important files:

- `lib/constants.js`
- `lib/llm-client.js`
- `main.js`
- `tests/llm-client.test.js`
- `tests/settings.test.js`

Why: OpenAI-compatible providers and Anthropic use different request and response shapes. Tests should prove the plugin sends the correct endpoint, headers, and body for each provider type.

### Vault action changes

Update the parser, summary, execution code, and tests.

Important files:

- `lib/vault-actions.js`
- `main.js`
- `tests/vault-actions.test.js`

Why: Vault actions can change user files. Every new action needs validation, a clear review summary, and tests for safe path handling.

### Privacy or network changes

Update user-facing documentation and release checks.

Important files:

- `README.md`
- `SECURITY.md`
- `docs/RELEASE.md`
- `scripts/release-check.js`
- `tests/settings.test.js`

Why: Obsidian community plugins must clearly disclose network use, credential handling, telemetry, and file access behavior.

## Testing Expectations

Tests use Node.js's built-in runner:

```bash
node --test tests/*.test.js
```

Add or update tests when changing:

- provider presets,
- model request or response parsing,
- vault action parsing or execution,
- privacy disclosures,
- release metadata.

The tests do not launch Obsidian. They isolate the parts that can be tested without the app: request builders, parsers, action execution, settings defaults, and documentation checks.

## Pull Request Checklist

- [ ] Tests pass.
- [ ] `npm run verify` passes.
- [ ] README and SECURITY.md are updated for any network, credential, telemetry, or file-writing change.
- [ ] No API keys, vault data, generated local stores, or logs are committed.
- [ ] Release files are still present: `main.js`, `manifest.json`, `styles.css`.

## Style

- Prefer small, explicit functions over broad abstractions.
- Keep user-facing safety behavior easy to inspect.
- Use Obsidian APIs for vault changes.
- Avoid adding dependencies unless they remove meaningful risk or complexity.
