const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function fileExists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

const manifest = readJson("manifest.json");
const packageJson = readJson("package.json");
const versions = readJson("versions.json");

assert(manifest.id === "vault-pilot", "manifest.json id must be vault-pilot.");
assert(manifest.name === "Vault Pilot", "manifest.json name must be Vault Pilot.");
assert(!manifest.id.includes("obsidian"), "Plugin id must not contain 'obsidian'.");
assert(/^\d+\.\d+\.\d+$/.test(manifest.version), "manifest.json version must use x.y.z semver.");
assert(packageJson.version === manifest.version, "package.json version must match manifest.json version.");
assert(versions[manifest.version] === manifest.minAppVersion, "versions.json must map the manifest version to minAppVersion.");

for (const requiredFile of [
  "README.md",
  "CONTRIBUTING.md",
  "LICENSE",
  "SECURITY.md",
  "main.js",
  "manifest.json",
  "styles.css",
  ".github/ISSUE_TEMPLATE/bug_report.md",
  ".github/ISSUE_TEMPLATE/feature_request.md",
  ".github/PULL_REQUEST_TEMPLATE.md",
  ".github/workflows/test.yml",
  "docs/ARCHITECTURE.md",
  "docs/RELEASE.md",
]) {
  assert(fileExists(requiredFile), `${requiredFile} is required before release.`);
}

const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
assert(readme.includes("Privacy And Security Disclosures"), "README must include privacy and security disclosures.");
assert(readme.includes("Anthropic Messages API"), "README must document Anthropic's direct API shape.");
assert(readme.includes("docs/ARCHITECTURE.md"), "README must link to the architecture guide.");
assert(readme.includes("CONTRIBUTING.md"), "README must link to the contributing guide.");
assert(readme.includes("SECURITY.md"), "README must link to the security policy.");

for (const publicFile of [
  "README.md",
  "SECURITY.md",
  "CONTRIBUTING.md",
  "docs/ARCHITECTURE.md",
  "docs/RELEASE.md",
  "package.json",
  "main.js",
]) {
  const content = fs.readFileSync(path.join(root, publicFile), "utf8");
  const excludedInitialReleaseTerms = [
    "self-" + "host sync",
    "self-" + "hosted sync",
    "M" + "CP server",
    "sync-vault-to-self-" + "host-server",
    "Sync" + "Client",
    "Vault" + "Indexer",
    "server" + "Url",
    "server" + "Token",
  ];
  const excludedPattern = new RegExp(excludedInitialReleaseTerms.join("|"), "i");
  assert(!excludedPattern.test(content), `${publicFile} includes experimental local sync wording that is not part of the initial release.`);
}

console.log(`Release check passed for ${manifest.id} ${manifest.version}.`);
