# Endless Dungeon

Unity 클라이언트와 Colyseus 서버가 역할을 나누는 최대 4인 협동 생존 게임.

| 항목 | 내용 |
|---|---|
| 클라이언트 | Unity, C# |
| 서버 | TypeScript, Colyseus |
| 저장된 Unity 버전 | 6000.5.1f1 |
| 서버 환경 선언 | Node.js >= 20.9.0, Colyseus 0.17 계열 |

> 문서 기준: 2026-11-01. 구현 상태는 소스 검토 기준이며, 이 문서 갱신 과정에서 빌드·플레이·성능 실험을 새로 실행하지 않았습니다.

## 1. 프로젝트 소개

플레이어가 방에 모여 캐릭터를 선택하고, 적과 투사체가 있는 맵에서 함께 생존하는 게임입니다. 클라이언트는 입력과 화면 표현을 담당하고, 서버 시뮬레이션은 이동·적·투사체·전투 상태를 갱신합니다.

현재 소스와 장기 기획을 구분합니다. 기획 문서에 있는 NestJS·MongoDB·성장 시스템 전체를 구현 완료로 소개하지 않습니다.

## 2. 실행·시연 방법

현재 Server/src/auth/runtime 및 contracts 모듈이 저장소에서 확인되지 않습니다. 인증 모듈을 포함하거나 의존 경로를 수정해야 아래 서버 빌드 절차를 완수할 수 있습니다.

서버 폴더에서 실행할 명령:

```powershell
cd Server
npm ci
npm run build
npm start
```

위 명령은 package.json에 맞춘 절차이며, 이 문서 작성 시 실행하지 않았습니다. 현재 테스트 파일도 실제 방 상태에 맞춰 정비해야 합니다.

클라이언트 실행:

1. Unity Hub에서 저장소 루트를 열고 ProjectVersion.txt에 기록된 에디터 버전을 사용합니다.
2. 패키지 복원을 완료합니다. Colyseus Unity SDK는 manifest.json의 Git UPM 의존성으로 들어 있습니다.
3. 인증 서비스와 게임 서버 접속 설정을 실행 환경에 맞춥니다. 인증 모듈 복구 후 설정 위치와 포트를 실행 안내에 추가할 예정입니다.
4. [MainMenuScene](https://github.com/Han-g/Endless-Dungeon/blob/main/Assets/Scenes/MainMenuScene.unity)에서 시작합니다. Gameplay 씬 단독 실행을 정상적인 방 입장 흐름으로 간주하지 않습니다.
5. 두 클라이언트가 같은 방에 입장해 준비·로딩·경기를 진행합니다.

## 3. 현재 구현된 기능

| 영역 | 소스에서 확인한 구현 |
|---|---|
| 방 | 대기방, 참가자, 방장, 캐릭터 선택과 Ready 처리 |
| 로딩 | 참가자 로딩 완료 보고와 상태 전환 |
| 게임 진행 | 서버 시뮬레이션, 전원 사망 후 finished 상태 |
| 플레이어 | 이동·조준 입력, 서버 상태의 클라이언트 반영 |
| 적 | 생성·이동·경로 탐색 코드 |
| 투사체·전투 | 투사체 상태, 충돌·피해 관련 시스템 |
| 표현 | 플레이어·적·투사체용 네트워크 View / Registry |

인증을 참조하는 방 코드는 있지만 필요한 모듈이 누락되어 있으므로, 로그인부터 전체 기능이 재현된 상태라고 주장하지 않습니다.

## 4. 담당 범위와 사용 자료

외부 구성요소는 Unity, Colyseus, SuperTiled2Unity 및 저장소에 포함된 에셋입니다.

개인 담당 범위와 제작 과정은 별도로 정리할 예정입니다. 에셋별 License 파일을 유지하며, 직접 제작한 자료와 외부 자료의 출처를 구분해 기록합니다.

## 5. 핵심 구조와 설계

```text
Unity 입력 / UI
  → 방·게임 메시지
  → WaitingRoom / ReadyRules
  → GameSimulation
       ├─ PlayerSystem
       ├─ EnemySystem / EnemyNavigation
       ├─ ProjectileSystem
       ├─ CombatSystem
       └─ MapCollision
  → 동기화 Schema
  → Unity Registry / View / 애니메이션
```

대기방 경로는 playing 상태일 때 서버 시뮬레이션을 50ms 간격으로 호출하도록 구성되어 있습니다. 이것은 목표 호출 간격이며 실제 처리 지연 측정값은 아닙니다.

| 파일 | 역할 |
|---|---|
| [WaitingRoom.ts](https://github.com/Han-g/Endless-Dungeon/blob/main/Server/src/rooms/WaitingRoom.ts) | 방 참가, 명령, 시뮬레이션 연결 |
| [ReadyRules.ts](https://github.com/Han-g/Endless-Dungeon/blob/main/Server/src/rooms/ReadyRules.ts) | Ready·시작 권한·로딩 완료 규칙 |
| [GameSimulation.ts](https://github.com/Han-g/Endless-Dungeon/blob/main/Server/src/simulation/GameSimulation.ts) | 시스템 실행 순서와 경기 종료 검사 |
| [EnemyNavigation.ts](https://github.com/Han-g/Endless-Dungeon/blob/main/Server/src/simulation/EnemyNavigation.ts) | 격자와 최소 힙 기반 경로 탐색 |
| [NetworkManager.cs](https://github.com/Han-g/Endless-Dungeon/blob/main/Assets/ServerManager/NetworkManager.cs) | Unity의 방 연결과 상태 적용 연결 |

## 6. 문제 해결과 검증 기록

| 항목 | 현재 확인 내용 | 다음에 남길 근거 |
|---|---|---|
| 실행 재현성 | 인증 모듈 누락 | 새 환경의 설치·빌드·접속 기록 |
| 방 상태 전환 | ReadyRules와 시뮬레이션 양쪽에 상태 관련 코드 존재 | 방장 이탈·중복 시작·로딩 지연 시나리오 |
| 테스트 | MyRoom.test.ts에 템플릿 상태 기대값 잔존 | 실제 Schema와 방 규칙에 맞춘 테스트 결과 |
| 네트워크 표현 | 상태를 화면에 반영하는 View / Registry | 2~4인 플레이와 지연 조건별 영상 |
| 서버 부하 | 측정 자료 미첨부 | 적·투사체 수와 틱 시간·전송량 기록 |

과거 설정 문서의 싱글 플레이 구조와 현재 서버 코드가 다른 부분은 현재 소스를 기준으로 설명합니다.

## 7. 현재 제한과 다음 작업

- [ ] 누락된 인증 모듈과 설정 경로를 복구해 실행 절차 완성
- [ ] 방 상태 전환의 최종 책임을 한곳에 두고 테스트용 my_room과 실제 흐름 구분
- [ ] 한 맵에서 대기방 → 경기 → 종료 → 로비 복귀 흐름 완성·검증
- [ ] 방장 이탈·중복 요청·로딩 시간 초과 처리 검증
- [ ] 2~4인 플레이에서 이동·피해·종료 상태 일치 확인
- [ ] 실제 문제를 측정한 뒤 보간·경로 갱신·전송량 개선
- [ ] 장기 기획 기능과 현재 기능 목록을 지속적으로 분리

---

저장소: [Endless-Dungeon](https://github.com/Han-g/Endless-Dungeon)
