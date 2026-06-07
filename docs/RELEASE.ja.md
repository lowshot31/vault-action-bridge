🌐 **Language / 언어 / 言語**: [English](RELEASE.md) | [한국어](RELEASE.ko.md) | **日本語**

# リリースガイド

このガイドはObsidianがインストールできるGitHubリリースの準備方法を説明します。

## リリースが重要な理由

ObsidianはGitHubリリースアセットからコミュニティプラグインをインストールします。リリースタグは`manifest.json`の`version`と一致する必要があり、リリースにはObsidianがユーザーのVaultにダウンロードするファイルが含まれている必要があります。

必須リリースアセット：

```text
main.js
manifest.json
styles.css
```

## リリース前チェックリスト

1. プラグインがローカルのObsidianでまだロードされることを確認します。
2. 完全な検証コマンドを実行します：

```bash
npm run verify
```

Node.jsテストスイートと`scripts/release-check.js`を実行します。

3. `manifest.json`、`package.json`、`versions.json`が一致していることを確認します。
4. プロバイダー、ネットワーク、またはファイル書き込みの変更後に`README.md`と`SECURITY.md`を読みます。
5. APIキー、Vaultデータ、`work/`、または生成されたローカルストアがコミットされていないことを確認します。
6. アーキテクチャまたはコントリビューション手順が変更された場合、`docs/ARCHITECTURE.md`と`CONTRIBUTING.md`を更新します。

## バージョンファイル

`manifest.json`はObsidianが見るプラグインバージョンの情報源です。

```json
{
  "version": "0.1.0",
  "minAppVersion": "1.5.0"
}
```

`package.json`はローカルツールとGitHubユーザーが同じリリース番号を見られるように同じバージョンを使用すべきです。

`versions.json`はプラグインバージョンを最小Obsidianバージョンにマッピングします。サポートする最小Obsidianバージョンが変更された場合のみ更新が必要です。

`scripts/release-check.js`がこの整合性を自動的に検証します。

## リリースの作成

1. リリース準備が完了したすべての変更をコミットします。
2. `manifest.json`バージョンと正確に一致するGitHubリリースタグを作成します。
   - `manifest.json`が`0.1.0`の場合、タグも`0.1.0`にする必要があります。
3. 以下のアセットをアップロードします：

```text
main.js
manifest.json
styles.css
```

4. リリースノートに以下を記載します：
   - ユーザー向けの変更
   - プロバイダー/APIの変更
   - プライバシーまたはネットワーク動作の変更
   - 移行に関するメモ

## コミュニティプラグイン提出メモ

Obsidianコミュニティディレクトリに提出する前に：

- リポジトリルートに`README.md`、`LICENSE`、`manifest.json`が存在する必要があります。
- プラグインIDは一意でなければならず、`obsidian`を含んではいけません。
- GitHubリリースタグは`manifest.json`バージョンと一致する必要があります。
- リリースアセットに`main.js`、`manifest.json`、オプションで`styles.css`が含まれている必要があります。
- セキュリティ開示はネットワーク使用、ノートコンテンツの転送、ツールインストール、テレメトリについて明確である必要があります。

## 現在のプロジェクト固有チェック

Note Pilotにとって重要な事項：

- プロバイダープリセットにOpenAI互換プロバイダーとAnthropicの直接API形式の両方が含まれています。
- `openai-oauth`セットアップコマンドはボタンクリック後に表示されるターミナルでのみ実行されます。
- Vaultアクションは適用前にレビューが必要です。
- テストはリクエストビルダー、レスポンスパース、プロバイダー設定、ドキュメントチェック、Vaultアクションをカバーしています。
