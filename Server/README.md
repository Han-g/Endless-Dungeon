# Endless Dungeon 서버

Colyseus 0.17 / TypeScript 서버입니다. MongoDB 계정 저장, HTTP 인증 API, 인증된 로비와 대기방을 제공합니다. Unity의 기존 인증 DTO와 방 메시지 이름을 유지합니다.

## 실행 준비

Node.js 22 이상과 실행 중인 MongoDB가 필요합니다. 검증 환경은 Node.js 24.19.0, MongoDB 7.0.24입니다. 테스트용 MongoDB는 자동 실행하지만 일반 서버에는 실제 사용할 MongoDB 주소를 지정해야 합니다.

```powershell
Set-Location 'D:\Study\Endless Dungeon\Server'
npm.cmd ci
Copy-Item .env.example .env.local
```

이미 `.env.local`이 있으면 복사하지 말고 필요한 값만 수정하세요. 파일은 Git에서 제외됩니다.

```dotenv
MONGODB_URI=mongodb://127.0.0.1:27017
MONGODB_DB=endless_dungeon
PORT=2567
NODE_ENV=development
```

셸/배포 환경의 변수가 `.env.local`보다 우선합니다. MongoDB 연결과 고유 인덱스 생성에 성공해야 접속을 받습니다.

```powershell
npm.cmd start
```

기본 HTTP 주소는 `http://localhost:2567`, WebSocket 주소는 `ws://localhost:2567`입니다. Unity의 인증 API 기준 주소와 Colyseus 주소를 같은 서버에 맞추세요.

npm 12에서 기존 Colyseus의 Git 의존성 때문에 `EALLOWGIT`가 발생하면 설치 명령에만 `npm.cmd ci --allow-git=all`을 사용하세요. 전역 npm 설정은 변경하지 않습니다.

## 개발 계정 생성과 API

회원가입 후 Unity 로그인 화면에서 로그인합니다. 예제 비밀번호는 개발용입니다.

```powershell
$signup = @{
    loginId = 'player01'
    password = 'LocalTest!123'
    displayName = 'Player01'
} | ConvertTo-Json
Invoke-RestMethod -Uri 'http://localhost:2567/api/auth/register' -Method Post -ContentType 'application/json' -Body $signup
```

| API | 요청 | 성공 응답 |
| --- | --- | --- |
| `POST /api/auth/register` | `loginId`, `password`, `displayName` | 201, `{ user }` |
| `POST /api/auth/login` | `loginId`, `password` | 200, `{ accessToken, expiresAt, user }` |
| `GET /api/auth/me` | Bearer 토큰 | 200, `{ user }` |
| `POST /api/auth/logout` | Bearer 토큰 | 204, 본문 없음 |
| `GET /health` | 없음 | 초기화 완료 시 200, `{ ok: true }` |

`user`는 `{ accountId, displayName, selectedCharacterId }`, `expiresAt`은 Unix 초입니다. 오류는 `{ error, message }` 형식입니다. `/health`는 초기화 상태를 표시하며 요청마다 DB를 ping하지는 않습니다.

아이디는 공백 제거·소문자 변환 후 영문 소문자/숫자/밑줄 3~32자입니다. 비밀번호는 공백을 보존하며 8~128자, UTF-8 256바이트 이하입니다. 닉네임은 1~20자이며 제어 문자와 `<`, `>`를 거절합니다.

## 인증 및 대기방 정책

- 계정과 salt가 있는 비동기 scrypt 비밀번호 해시는 MongoDB에 저장합니다.
- 세션 수명은 2시간입니다. 토큰 원문 대신 SHA-256 키를 서버 메모리에 보관합니다.
- 새 로그인은 이전 토큰과 연결된 소켓을 폐기합니다. 로그아웃과 만료도 연결을 종료합니다.
- 계정당 게임방 하나만 점유할 수 있습니다. 로비와 게임방 동시 사용은 허용합니다.
- 최대 4명이며 1인 플레이도 가능합니다. 캐릭터 번호는 1~4입니다.
- 방장만 시작할 수 있으며 전원이 Ready여야 합니다. 캐릭터 변경은 Ready를 해제합니다.
- 시작하면 입장을 잠그고 `waiting → loading → playing`으로 진행합니다. 전원의 `game/loaded`를 기다립니다.
- 30초 안에 로딩을 완료하지 못한 참가자를 내보내고, 남은 전원이 로딩을 마쳤으면 시작합니다.
- 방장 퇴장 시 남아 있는 첫 참가자에게 권한을 넘깁니다.
- 최근 128개 명령 결과를 연결별로 기억합니다. 같은 요청 재전송에는 같은 결과를 반환하며, 같은 ID를 다른 명령에 쓰면 `REQUEST_ID_REUSED`입니다.
- 이동·공격은 인증된 참가자의 `playing` 단계에서만 처리합니다.

| 메시지 | 본문 |
| --- | --- |
| `room/ready` | `{ requestId, ready, characterId }` |
| `room/character` | `{ requestId, characterId }` |
| `room/start` | `{ requestId }` |
| `game/loaded` | `{ requestId }` |

`requestId`는 하이픈 없는 소문자 16진수 UUID 32자입니다. Unity의 기존 `Guid.NewGuid().ToString("N")`과 일치합니다. 응답은 `room/result`의 `{ requestId, ok, error }`입니다. 소켓 종료 코드는 잘못된 명령 형식 4400, 인증 폐기 4401, 로딩 시간 초과 4408입니다.

## 검증과 부하 테스트

```powershell
npm.cmd run typecheck
npm.cmd run test:unit
npm.cmd test
npm.cmd run build
```

전체 테스트는 규칙 테스트 4개와 HTTP·실제 MongoDB·실제 WebSocket 통합 테스트 15개입니다. 테스트 전용 DB/포트를 생성하고 정리하며 기존 계정 DB는 사용하지 않습니다. 첫 실행은 MongoDB 7.0.24를 `.cache/mongodb`에 다운로드합니다. Windows 다운로드는 약 600MB이며 이후 캐시를 재사용합니다. 네트워크 다운로드 및 로컬 프로세스/소켓 사용 권한이 필요합니다.

Node.js에서 CommonJS/ESM 중복 로딩으로 인증 싱글턴이 분리되지 않도록 테스트는 `--import tsx --no-experimental-require-module`로 실행합니다.

부하 테스트에는 같은 비밀번호로 미리 가입한 서로 다른 개발 계정이 필요합니다.

```powershell
$env:LOADTEST_LOGIN_IDS = 'bot01,bot02'
$env:LOADTEST_PASSWORD = 'LocalBot!123'
npm.cmd run loadtest
```

봇마다 1인 방을 생성하고 Ready·시작·로딩 완료 후 초당 20회 이동 입력을 보냅니다. 기본 2개 클라이언트이며 `--roomId`는 지원하지 않습니다. 로그인 요청 제한이 그대로 적용됩니다. 스크립트는 타입 검사를 통과했으며 실제 부하 측정은 수행하지 않았습니다.

## 배포와 현재 범위

```powershell
npm.cmd run build
$env:NODE_ENV = 'production'
npm.cmd run start:production
```

PM2 설정은 production 환경의 단일 프로세스입니다. production에서는 monitor와 playground를 등록하지 않습니다. 외부 서비스는 HTTPS/WSS를 구성하세요. 프록시 배포 시에는 신뢰할 프록시와 IP 제한 정책을 맞춰야 합니다. 현재는 직접 연결 IP 기준 인증 API 전체 120회/분, 회원가입 5회/분, 로그인 10회/분입니다.

세션·게임방 점유·요청 제한은 프로세스 메모리에 있습니다. 서버 재시작 후 계정은 유지되지만 재로그인이 필요합니다. 여러 서버 프로세스를 사용하려면 공유 저장소로 이전해야 합니다. 방 안에서 선택한 캐릭터를 계정 기본 캐릭터로 저장하는 API와 게임 성장/진행도 저장은 다음 범위입니다.

변경 내역과 수정 전 보존 기록은 `docs/AUTH_WAITING_ROOM_IMPLEMENTATION.md`에 정리했습니다.

## License

MIT
