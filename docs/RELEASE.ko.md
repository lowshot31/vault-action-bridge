🌐 **Language / 언어 / 言語**: [English](RELEASE.md) | **한국어** | [日本語](RELEASE.ja.md)

# 릴리스 가이드

이 가이드는 Obsidian이 설치할 수 있는 GitHub 릴리스를 준비하는 방법을 설명합니다.

## 릴리스가 중요한 이유

Obsidian은 GitHub 릴리스 자산에서 커뮤니티 플러그인을 설치합니다. 릴리스 태그는 `manifest.json`의 `version`과 일치해야 하며, 릴리스에는 Obsidian이 사용자의 볼트에 다운로드하는 파일이 포함되어야 합니다.

필수 릴리스 자산:

```text
main.js
manifest.json
styles.css
```

## 릴리스 전 체크리스트

1. 플러그인이 로컬 Obsidian에서 여전히 로드되는지 확인합니다.
2. 전체 검증 명령을 실행합니다:

```bash
npm run verify
```

Node.js 테스트 스위트와 `scripts/release-check.js`를 실행합니다.

3. `manifest.json`, `package.json`, `versions.json`이 일치하는지 확인합니다.
4. 프로바이더, 네트워크 또는 파일 쓰기 변경 후 `README.md`와 `SECURITY.md`를 읽습니다.
5. API 키, 볼트 데이터, `work/` 또는 생성된 로컬 저장소가 커밋되지 않았는지 확인합니다.
6. 아키텍처 또는 기여 절차가 변경된 경우 `docs/ARCHITECTURE.md`와 `CONTRIBUTING.md`를 업데이트합니다.

## 버전 파일

`manifest.json`은 Obsidian이 보는 플러그인 버전의 원본입니다.

```json
{
  "version": "0.1.0",
  "minAppVersion": "1.5.0"
}
```

`package.json`은 로컬 도구와 GitHub 사용자가 동일한 릴리스 번호를 볼 수 있도록 동일한 버전을 사용해야 합니다.

`versions.json`은 플러그인 버전을 최소 Obsidian 버전에 매핑합니다. 지원하는 최소 Obsidian 버전이 변경될 때만 업데이트하면 됩니다.

`scripts/release-check.js`가 이 일관성을 자동으로 검증합니다.

## 릴리스 생성

1. 릴리스 준비된 모든 변경 사항을 커밋합니다.
2. `manifest.json` 버전과 정확히 일치하는 GitHub 릴리스 태그를 생성합니다.
   - `manifest.json`이 `0.1.0`이면 태그도 `0.1.0`이어야 합니다.
3. 다음 자산을 업로드합니다:

```text
main.js
manifest.json
styles.css
```

4. 릴리스 노트에 다음을 언급합니다:
   - 사용자 대면 변경 사항
   - 프로바이더/API 변경 사항
   - 프라이버시 또는 네트워크 동작 변경 사항
   - 마이그레이션 참고 사항

## 커뮤니티 플러그인 제출 참고 사항

Obsidian 커뮤니티 디렉터리에 제출하기 전:

- 리포지토리 루트에 `README.md`, `LICENSE`, `manifest.json`이 있어야 합니다.
- 플러그인 ID는 고유해야 하며 `obsidian`을 포함해서는 안 됩니다.
- GitHub 릴리스 태그는 `manifest.json` 버전과 일치해야 합니다.
- 릴리스 자산에 `main.js`, `manifest.json`, 선택적으로 `styles.css`가 포함되어야 합니다.
- 보안 공개는 네트워크 사용, 노트 내용 전송, 도구 설치, 텔레메트리에 대해 명확해야 합니다.

## 현재 프로젝트 고유 검사

Note Pilot에 중요한 사항:

- 프로바이더 프리셋에 OpenAI 호환 프로바이더와 Anthropic의 직접 API 형식이 모두 포함되어 있습니다.
- `openai-oauth` 설정 명령은 버튼 클릭 후 표시되는 터미널에서만 실행됩니다.
- 볼트 액션은 적용 전 검토가 필요합니다.
- 테스트는 요청 빌더, 응답 파싱, 프로바이더 설정, 문서 검사, 볼트 액션을 다룹니다.
