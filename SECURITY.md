🌐 **Language / 언어 / 言語**: **English** | [한국어](ko/SECURITY.ko.md) | [日本語](ja/SECURITY.ja.md)

# Security Policy

Vault Pilot is an Obsidian desktop plugin that can read selected note content, call configured model providers, and apply reviewed changes to files in the user's vault.

## Supported Versions

Only the latest published GitHub release is supported for security fixes.

## Reporting A Vulnerability

Please report security issues through GitHub issues if the issue does not expose private data. If the issue contains sensitive details, contact the maintainer privately before posting public reproduction steps.

When reporting, include:

- plugin version,
- Obsidian version,
- operating system,
- provider mode used (`openai-oauth`, API key provider, or webview only),
- steps to reproduce,
- expected behavior,
- actual behavior,
- whether vault files or credentials may have been exposed.

## Security Model

The plugin keeps AI writes behind an explicit review step:

1. A model can propose vault action JSON.
2. The plugin validates the requested action and vault-relative path.
3. The user reviews the action summary and JSON.
4. The plugin applies changes only after confirmation.

Absolute paths and `..` path traversal are rejected.

## Network Use

Network behavior depends on user settings:

- Current-note and selected-text questions are sent to the configured provider.
- `openai-oauth` mode sends requests to the configured local proxy URL, usually `http://127.0.0.1:10531/v1`.
- API-key provider mode sends requests to the selected provider endpoint.

## Credential Handling

API keys and plugin settings are stored in Obsidian plugin data using Obsidian's `loadData()` and `saveData()` APIs. Do not use this plugin with notes or credentials that your selected provider is not allowed to receive.

## Tool Installation

The plugin includes setup buttons for Node.js, Codex, and `openai-oauth`. These buttons run commands in a visible terminal after the user presses them. The plugin should not silently install programs or authenticate in the background.

## Telemetry

Vault Pilot does not include client-side telemetry or analytics.
