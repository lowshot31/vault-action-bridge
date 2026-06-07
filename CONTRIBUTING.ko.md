🌐 **Language / 언어 / 言語**: [English](CONTRIBUTING.md) | **한국어** | [日本語](CONTRIBUTING.ja.md)

# 기여 가이드

Vault Action Bridge 개선에 도움을 주셔서 감사합니다.

이 프로젝트는 의도적으로 작게 유지됩니다: 순수 JavaScript, CommonJS 모듈, 런타임 의존성 없음, Node.js 내장 테스트. 이를 통해 릴리스 아티팩트를 쉽게 검사할 수 있고, Obsidian 사용자가 플러그인을 더 쉽게 검토할 수 있습니다.

## 개발 환경 설정

Node.js를 설치한 후 실행합니다:

```bash
npm test
```

풀 리퀘스트를 열거나 릴리스를 배포하기 전에 실행합니다:

```bash
npm run verify
```

`npm run verify`는 테스트 스위트와 릴리스 메타데이터 검사를 실행합니다.

## 프로젝트 구조

```text
main.js                 Obsidian 플러그인 진입점 및 번들 런타임 코드
styles.css              플러그인 스타일
manifest.json           Obsidian 플러그인 메타데이터
versions.json           Obsidian 최소 버전 매핑
lib/                    main.js와 공유하는 테스트 가능한 모듈
tests/                  Node.js 테스트 스위트
docs/RELEASE.md         릴리스 체크리스트 및 Obsidian 제출 참고사항
SECURITY.md             보안 모델 및 보고 가이드
scripts/release-check.js 릴리스 일관성 검사기
```

## 기능을 안전하게 변경하는 방법

### 프로바이더 또는 모델 변경

상수와 요청 빌더 테스트를 모두 업데이트합니다.

관련 파일:

- `lib/constants.js`
- `lib/llm-client.js`
- `main.js`
- `tests/llm-client.test.js`
- `tests/settings.test.js`

이유: OpenAI 호환 프로바이더와 Anthropic은 서로 다른 요청 및 응답 형식을 사용합니다. 테스트는 플러그인이 각 프로바이더 유형에 대해 올바른 엔드포인트, 헤더, 본문을 전송하는지 증명해야 합니다.

### 볼트 액션 변경

파서, 요약, 실행 코드 및 테스트를 업데이트합니다.

관련 파일:

- `lib/vault-actions.js`
- `main.js`
- `tests/vault-actions.test.js`

이유: 볼트 액션은 사용자 파일을 변경할 수 있습니다. 모든 새로운 액션에는 검증, 명확한 검토 요약, 안전한 경로 처리 테스트가 필요합니다.

### 프라이버시 또는 네트워크 변경

사용자 대면 문서와 릴리스 검사를 업데이트합니다.

관련 파일:

- `README.md`
- `SECURITY.md`
- `docs/RELEASE.md`
- `scripts/release-check.js`
- `tests/settings.test.js`

이유: Obsidian 커뮤니티 플러그인은 네트워크 사용, 자격 증명 처리, 텔레메트리, 파일 접근 동작을 명확히 공개해야 합니다.

## 테스트 기대사항

테스트는 Node.js 내장 러너를 사용합니다:

```bash
node --test tests/*.test.js
```

다음을 변경할 때 테스트를 추가하거나 업데이트합니다:

- 프로바이더 프리셋
- 모델 요청 또는 응답 파싱
- 볼트 액션 파싱 또는 실행
- 프라이버시 공개
- 릴리스 메타데이터

테스트는 Obsidian을 실행하지 않습니다. 앱 없이 테스트할 수 있는 부분을 분리합니다: 요청 빌더, 파서, 액션 실행, 설정 기본값, 문서 검사.

## 풀 리퀘스트 체크리스트

- [ ] 테스트 통과
- [ ] `npm run verify` 통과
- [ ] 네트워크, 자격 증명, 텔레메트리 또는 파일 쓰기 변경에 대해 README 및 SECURITY.md 업데이트
- [ ] API 키, 볼트 데이터, 생성된 로컬 저장소 또는 로그가 커밋되지 않았는지 확인
- [ ] 릴리스 파일이 여전히 존재: `main.js`, `manifest.json`, `styles.css`

## 스타일

- 넓은 추상화보다 작고 명시적인 함수를 선호합니다.
- 사용자 대면 안전 동작을 검사하기 쉽게 유지합니다.
- 볼트 변경에는 Obsidian API를 사용합니다.
- 의미 있는 위험이나 복잡성을 제거하지 않는 한 의존성 추가를 피합니다.
