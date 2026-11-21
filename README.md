# Endless Dungeon WSL Server

서버 개발·실행 기준 경로는 `/home/ark98/projects/endless-dungeon-server`입니다.
Unity 클라이언트는 Windows 프로젝트에서 개발합니다. Windows의 서버 사본을 이 폴더에 통째로 덮어쓰지 마세요.

## 실행

Node.js 22 이상, 연결 가능한 MongoDB, Redis가 필요합니다. 기존 `.env.development` 설정은 통합 과정에서 변경하지 않았습니다.

```bash
cd /home/ark98/projects/endless-dungeon-server
npm ci
npm start
```

처음 설치하는 환경에서만 `.env.example`을 `.env.development`로 복사하고 실제 값을 입력합니다.
이미 있는 환경 파일은 덮어쓰지 않습니다. 환경 파일과 로컬 백업은 Git에서 제외됩니다.

| 변수 | 의미 |
| --- | --- |
| PORT | 게임 서버 포트. 기본 2567 |
| MONGODB_URI | MongoDB 연결 문자열 |
| MONGODB_DATABASE | 기존 계정 DB 이름. 기본 endless_dungeon |
| REDIS_URL | Redis 연결 문자열 |
| AUTH_KEY_PREFIX | Redis 인증 키 구분. 기본 ed:development:auth |
| AUTH_SESSION_TTL_SECONDS | 세션 수명. 기본 1800초, 60~86400 범위 |

환경은 기존 `@colyseus/tools` 로딩 흐름을 사용합니다. MongoDB 연결·기존 고유 인덱스·Redis 명령 및 구독 연결을 준비한 뒤 서버를 엽니다.
개발 환경의 기본 주소는 HTTP `http://localhost:2567`, WebSocket `ws://localhost:2567`입니다.

## 인증 API

| API | 요청 | 성공 |
| --- | --- | --- |
| POST /api/auth/register | loginId, password, displayName | 201, { user } |
| POST /api/auth/login | loginId, password | 200, { accessToken, expiresAt, user } |
| GET /api/auth/me | Authorization: Bearer 토큰 | 200, { user } |
| POST /api/auth/logout | Authorization: Bearer 토큰 | 204 |
| GET /health | 없음 | 준비 상태 200/503, { ok } |

`user`는 `accountId, displayName, selectedCharacterId`를 포함하며 `expiresAt`은 Unix 초입니다.
오류 형식은 `{ error, message }`이며 요청 제한은 429 및 Retry-After로 응답합니다.
health는 초기화 상태와 Redis 명령 연결 상태를 표시하며 매 요청마다 MongoDB를 ping하는 심층 점검은 아닙니다.

- 기존 계정의 `accountId, status, passwordHash` 구조와 `scrypt:v1:32768:8:3:...` 해시를 유지합니다.
- 아이디는 기존 규칙대로 공백 제거·소문자 변환 후 영문 소문자/숫자/밑줄/점/하이픈 3~32자입니다.
- 비밀번호는 공백을 보존하며 기존 8~128자 규칙을 유지합니다.
- 새 회원가입의 표시 이름은 1~24자이며 제어 문자와 꺾쇠를 허용하지 않습니다.
- 기존 계정 생성 도구도 유지합니다: `npm run account:create`.
- 로그인 제한은 IP당 20회/분 및 아이디당 5회/분, 회원가입은 IP당 5회/분입니다.
- 비밀번호 해시 연산은 동시에 최대 2개만 처리합니다.
- 계정의 status가 active가 아니면 로그인·인증 조회를 거절합니다. 인증 조회에서 확인된 비활성 계정의 세션은 폐기합니다.

## 세션과 대기방

Redis에 토큰 원문 대신 SHA-256 키를 저장합니다. 계정별 최신 세션 인덱스를 Lua로 원자적으로 갱신하여 새 로그인 시 이전 세션을 폐기합니다.
이전 토큰으로 뒤늦게 로그아웃해도 새 로그인 세션을 지우지 않습니다.

**이번 통합 전 발급한 세션은 새 정책에서 재로그인이 필요합니다.** 계정과 비밀번호는 유지합니다.
통합 후에는 Redis 데이터와 TTL이 유지되는 동안 인증 런타임 재시작 뒤에도 토큰이 유지됩니다. 게임방 복구·자동 재접속은 별도 기능입니다.

로그아웃·재로그인은 로컬 연결 감시와 Redis Pub/Sub으로 소켓을 종료합니다.
구독 메시지를 놓치거나 Redis TTL로 세션이 사라지는 경우를 위해 1초 주기로 유효성을 재검사합니다.
검사 결과가 오래되거나 Redis 연결이 끊기면 기존 연결도 종료합니다. 이동 입력마다 DB에 조회하지는 않습니다.

게임방은 단일 프로세스 기준입니다. 계정당 게임방 하나만 점유하며 로비와 게임방 동시 접속은 허용합니다.
최대 4명, 캐릭터 1~4, 1인 시작도 지원합니다.

- 방장만 시작할 수 있고 전원이 Ready여야 합니다.
- 캐릭터를 변경하면 Ready를 해제합니다.
- 시작 시 신규 참가를 막고 `waiting → loading → playing`으로 전환합니다.
- 전원의 game/loaded를 기다리며 30초 후 미완료자를 내보냅니다.
- 방장 퇴장 시 남은 첫 참가자에게 권한을 넘깁니다.
- 최근 128개 명령 결과를 연결별로 캐시합니다. 동일 ID/동일 명령은 같은 결과를 반환합니다.
- 동일 ID를 다른 명령에 쓰면 REQUEST_ID_REUSED, 잘못된 명령 형식은 소켓 종료 4400입니다.
- 인증 폐기는 4401, 로딩 시간 초과는 4408입니다.
- 이동·공격은 인증이 유효한 playing 참가자만 처리합니다.
- 로비 metadata는 setMetadata로 순서대로 게시합니다.
- my_room 우회 진입은 등록에서 제거했습니다.

명령은 room/ready, room/character, room/start, game/loaded를 사용하며 requestId는 소문자 16진수 32자입니다.
응답은 room/result의 `{ requestId, ok, error }`입니다. 인증 DTO는 유지하며 캐릭터 능력치용 Schema를 확장했습니다.

## 캐릭터 기본 능력치

기준표는 `src/game/CharacterCatalog.ts` 한 곳에서 관리합니다.
방 입장·캐릭터 변경·준비 완료 시 기본 체력과 이동속도를 플레이어에 적용하고,
서버 이동은 `PlayerState.moveSpeed`, 투사체는 기준표의 공격 설정을 사용합니다.
초당 공격 횟수와 1회 적중 피해량은 배율이 아닌 실제 기본값입니다.

| ID | 캐릭터 | 최대 체력 | 이동속도 | 적중 피해량 | 초당 공격 | 투사체 속도 | 사거리 | 기본 최대 적중 수 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 전사 | 150 | 3.5 | 15 | 0.7 | 12 | 8 | 2 |
| 2 | 궁수 | 100 | 5 | 10 | 1 | 14 | 10 | 1 |
| 3 | 도적 | 120 | 6 | 12 | 0.8 | 13 | 7 | 2 |
| 4 | 마법사 | 100 | 3.6 | 20 | 0.5 | 10 | 9 | 3 |

`MyRoomState.characterCatalog`는 캐릭터 ID 문자열을 키로 기본 능력치를 전달합니다.
Unity 선택 화면은 이 목록을, 대기방 참가자 표시는 실제 `PlayerState.maxHp/moveSpeed`를 읽습니다.
기준표가 아직 도착하지 않았으면 선택 확정을 비활성화합니다.
Unity의 캐릭터 ScriptableObject는 ID·이름·무기 리소스만 보유합니다.

## 테스트

```bash
cd /home/ark98/projects/endless-dungeon-server
npm run typecheck
npm run test:unit
npm test
npm run build
```

대기방·능력치·성장 단위 테스트와 HTTP·MongoDB·Redis·WebSocket 통합 테스트를 실행합니다.
테스트에는 `redis-server` 실행 파일이 필요합니다. 현재 WSL의 기존 서비스와 다른 임시 포트로 별도 프로세스를 띄웁니다.
MongoDB 7.0.24 실행 파일은 처음에 `.cache/mongodb`로 다운로드하며 이후 재사용합니다.

테스트는 별도 MongoDB와 Redis 프로세스, 임의 DB 이름 및 키 접두사를 사용합니다.
개발 환경 파일이 로드되더라도 테스트 시작 전에 저장소 설정을 임시 환경으로 교체합니다.
현재 사용하는 계정 DB, 6379의 Redis 서비스, 2567의 게임 서버를 테스트로 초기화하거나 종료하지 않습니다.

기존 계정 형식의 고정 해시 fixture, 중복 가입/로그인, 로그아웃 연결 종료, Pub/Sub 전파,
알림 없는 TTL 만료, Redis 장애, 계정 비활성화, production 시작과 개발 도구 비노출을 검증합니다.

부하 테스트는 미리 만든 서로 다른 개발 계정을 사용합니다.
`LOADTEST_LOGIN_IDS`에 쉼표로 구분한 아이디를, `LOADTEST_PASSWORD`에 해당 계정들의 비밀번호를 설정하고 `npm run loadtest`를 실행합니다.
기본 2개 봇이 각자 1인 방을 만들고 게임 시작 후 초당 20회 이동을 전송합니다. 로그인 제한은 그대로 적용됩니다.
장시간 부하 측정은 이번 통합에서 수행하지 않았습니다.

## 배포·운영 범위

```bash
cd /home/ark98/projects/endless-dungeon-server
npm run build
NODE_ENV=production npm run start:production
```

production의 실제 연결 정보는 환경 변수 또는 Git에서 제외된 `.env.production`에 준비합니다.
PM2 설정은 단일 fork 프로세스이며 production에서는 monitor와 playground를 등록하지 않습니다.
외부 접속 환경은 HTTPS/WSS 및 신뢰할 프록시/IP 제한 설정이 필요합니다.

세션이 Redis에 있어도 게임방 점유와 게임 상태는 프로세스 메모리입니다.
다중 게임 서버 운영에는 공유 점유 및 Colyseus의 분산 구성과 복구 정책이 추가로 필요합니다.
캐릭터 선택·성장 기록의 계정 저장과 인벤토리 저장은 다음 구현 범위입니다.

구현 및 복구 기록은 `docs/WSL_AUTH_WAITING_ROOM_INTEGRATION.md`에 있습니다.
