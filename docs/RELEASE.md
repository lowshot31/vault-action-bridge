🌐 **Language / 언어 / 言語**: **English** | [한국어](RELEASE.ko.md) | [日本語](RELEASE.ja.md)

# Release Guide

This guide explains how to prepare a GitHub release that Obsidian can install.

## Why Releases Matter

Obsidian installs community plugins from GitHub release assets. The release tag must match the `version` in `manifest.json`, and the release must contain the files Obsidian downloads into the user's vault.

Required release assets:

```text
main.js
manifest.json
styles.css
```

## Pre-release Checklist

1. Confirm the plugin still loads locally in Obsidian.
2. Run the full verification command:

```bash
npm run verify
```

This runs the Node.js test suite and `scripts/release-check.js`.

3. Confirm `manifest.json`, `package.json`, and `versions.json` agree.
4. Read `README.md` and `SECURITY.md` after any provider, network, or file-writing change.
5. Confirm no API keys, vault data, `work/`, or generated local stores are committed.
6. If architecture or contribution steps changed, update `docs/ARCHITECTURE.md` and `CONTRIBUTING.md`.

## Version Files

`manifest.json` is the source of truth for the plugin version that Obsidian sees.

```json
{
  "version": "0.1.0",
  "minAppVersion": "1.5.0"
}
```

`package.json` should use the same version so local tooling and GitHub readers see the same release number.

`versions.json` maps plugin versions to minimum Obsidian versions. You only need to update it when the minimum supported Obsidian version changes.

`scripts/release-check.js` verifies this consistency automatically.

## Creating The Release

1. Commit all release-ready changes.
2. Create a GitHub release tag that exactly matches `manifest.json` version.
   - If `manifest.json` says `0.1.0`, the tag should be `0.1.0`.
3. Upload these assets:

```text
main.js
manifest.json
styles.css
```

4. In the release notes, mention:
   - user-facing changes,
   - provider/API changes,
   - privacy or network behavior changes,
   - migration notes.

## Community Plugin Submission Notes

Before submitting to the Obsidian community directory:

- The repository root must contain `README.md`, `LICENSE`, and `manifest.json`.
- The plugin ID must be unique and must not contain `obsidian`.
- The GitHub release tag must match `manifest.json` version.
- The release assets must include `main.js`, `manifest.json`, and optionally `styles.css`.
- Security disclosures should be clear about network use, note-content transfer, tool installation, and telemetry.

## Current Project-Specific Checks

These are important for Note Pilot:

- Provider presets include both OpenAI-compatible providers and Anthropic's direct API shape.
- `openai-oauth` setup commands run only in a visible terminal after a button click.
- Vault actions require review before applying.
- Tests cover request builders, response parsing, provider settings, documentation checks, and vault actions.
