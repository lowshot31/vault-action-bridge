🌐 **Language / 언어 / 言語**: [English](../CONTRIBUTING.md) | [한국어](../ko/CONTRIBUTING.ko.md) | **日本語**

# コントリビューションガイド

Vault Pilotの改善にご協力いただきありがとうございます。

このプロジェクトは意図的に小さく保たれています：純粋なJavaScript、CommonJSモジュール、ランタイム依存関係なし、Node.js内蔵テスト。これにより、リリースアーティファクトの検査が容易になり、Obsidianユーザーがプラグインをより簡単にレビューできます。

## 開発環境セットアップ

Node.jsをインストールしてから実行します：

```bash
npm test
```

プルリクエストを作成するかリリースを公開する前に実行します：

```bash
npm run verify
```

`npm run verify`はテストスイートとリリースメタデータチェックを実行します。

## プロジェクト構造

```text
main.js                 Obsidianプラグインエントリポイントおよびバンドルランタイムコード
styles.css              プラグインスタイル
manifest.json           Obsidianプラグインメタデータ
versions.json           Obsidian最小バージョンマッピング
lib/                    main.jsと共有するテスト可能なモジュール
tests/                  Node.jsテストスイート
docs/RELEASE.md         リリースチェックリストおよびObsidian提出メモ
SECURITY.md             セキュリティモデルおよび報告ガイダンス
scripts/release-check.js リリース整合性チェッカー
```

## 機能を安全に変更する方法

### プロバイダーまたはモデルの変更

定数とリクエストビルダーテストの両方を更新します。

関連ファイル：

- `lib/constants.js`
- `lib/llm-client.js`
- `main.js`
- `tests/llm-client.test.js`
- `tests/settings.test.js`

理由：OpenAI互換プロバイダーとAnthropicは異なるリクエストおよびレスポンス形式を使用します。テストは、プラグインが各プロバイダータイプに対して正しいエンドポイント、ヘッダー、ボディを送信することを証明する必要があります。

### Vaultアクションの変更

パーサー、要約、実行コード、およびテストを更新します。

関連ファイル：

- `lib/vault-actions.js`
- `main.js`
- `tests/vault-actions.test.js`

理由：Vaultアクションはユーザーファイルを変更できます。すべての新しいアクションには検証、明確なレビュー要約、安全なパス処理のテストが必要です。

### プライバシーまたはネットワークの変更

ユーザー向けドキュメントとリリースチェックを更新します。

関連ファイル：

- `README.md`
- `SECURITY.md`
- `docs/RELEASE.md`
- `scripts/release-check.js`
- `tests/settings.test.js`

理由：Obsidianコミュニティプラグインは、ネットワーク使用、認証情報の処理、テレメトリ、ファイルアクセス動作を明確に開示する必要があります。

## テスト期待事項

テストはNode.js内蔵ランナーを使用します：

```bash
node --test tests/*.test.js
```

以下を変更する際にテストを追加または更新します：

- プロバイダープリセット
- モデルリクエストまたはレスポンスのパース
- Vaultアクションのパースまたは実行
- プライバシー開示
- リリースメタデータ

テストはObsidianを起動しません。アプリなしでテストできる部分を分離します：リクエストビルダー、パーサー、アクション実行、設定デフォルト、ドキュメントチェック。

## プルリクエストチェックリスト

- [ ] テスト合格
- [ ] `npm run verify`合格
- [ ] ネットワーク、認証情報、テレメトリ、またはファイル書き込みの変更についてREADMEおよびSECURITY.mdを更新
- [ ] APIキー、Vaultデータ、生成されたローカルストア、またはログがコミットされていないことを確認
- [ ] リリースファイルがまだ存在：`main.js`、`manifest.json`、`styles.css`

## スタイル

- 広い抽象化よりも小さく明示的な関数を優先します。
- ユーザー向けの安全動作を検査しやすく保ちます。
- Vault変更にはObsidian APIを使用します。
- 意味のあるリスクや複雑さを除去しない限り、依存関係の追加を避けます。
