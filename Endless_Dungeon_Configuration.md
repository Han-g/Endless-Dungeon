# Endless Dungeon 프로젝트 설정 및 구현 현황

> 마지막 점검일: 2026-08-21  
> 점검 대상: `D:\Study\Endless Dungeon`  
> 이 문서는 현재 디스크에 저장된 Unity 씬, 프리팹, ScriptableObject, C# 스크립트를 기준으로 작성했다.

## 1. 문서 목적

이 문서는 다음 항목의 설정 위치와 런타임 사용 흐름을 한곳에서 확인하기 위한 문서다.

- 플레이어 구성과 캐릭터별 스탯
- 투사체 종류와 공격 계산
- 적 데이터, 이동, 스폰 페이즈
- 메인 메뉴와 게임 종료 UI
- 생존 시간, 킬 집계, 레벨 진행
- 현재 구현됐지만 연결되지 않은 기능

현재 프로젝트는 대체로 다음 방식으로 구성되어 있다.

```text
ScriptableObject 에셋
    캐릭터/투사체/적/레벨 수치 저장
            ↓
씬과 프리팹의 MonoBehaviour
    데이터를 읽어 이동/공격/스폰/UI 실행
```

## 2. 전체 구현 상태

| 기능 | 상태 | 비고 |
|---|---|---|
| 플레이어 이동 | 구현됨 | WASD, Rigidbody2D 사용 |
| 플레이어 애니메이션 | 구현됨 | 이동 8방향, Idle 4방향 |
| 마우스 방향 자동 공격 | 구현됨 | 클릭 없이 계속 발사 |
| 플레이어 HP/사망 | 구현됨 | 피격 쿨다운 0.5초 |
| 투사체 피격/월드 충돌 | 구현됨 | 공용 투사체 프리팹 사용 |
| 적 Flow Field 이동 | 구현됨 | BFS 기반 4방향 필드 |
| 적 Separation/Formation | 구현됨 | Spatial Hash 사용 |
| 적 접촉 피해 | 구현됨 | ColliderDistance2D 직접 검사 |
| 시간 기반 스폰 페이즈 | 구조 구현됨 | 현재는 1페이즈만 설정됨 |
| 메인 메뉴 패널 전환 | 구현됨 | Title → Login → Lobby → Room → Character |
| 캐릭터 선택 UI | 구현됨 | 선택 ID 저장 및 게임 씬 로드 |
| 선택 캐릭터 게임 적용 | 미연결 | Gameplay는 현재 Archer로 고정 |
| 킬 기반 레벨 데이터 | 작성됨 | 실제 레벨업 호출은 미연결 |
| 게임 종료 UI | 구현됨 | 사망 시 시간/킬 표시 |
| 10분 승리 조건 | 미구현 | 현재 사망만 종료 조건 |
| 인게임 HUD | 미구현 | HP/시간/킬/레벨 표시 없음 |
| 로그인/방/Ready | UI 모형 | 실제 상태 및 서버 통신 없음 |
| 멀티플레이 서버 연동 | 미구현 | 추후 C# 서버 연결 대상 |

---

## 3. 플레이어 설정

### 3.1 사용 오브젝트

프리팹:

```text
Assets/GameScript/Character/Player.prefab
```

구조:

```text
Player
├─ Rigidbody2D
├─ CapsuleCollider2D
├─ PlayerInput
├─ PlayerHP
├─ PlayerStats
├─ CharacterMove
├─ PlayerMotor
├─ PlayerAttack
├─ Visual
│  ├─ SpriteRenderer
│  ├─ Animator
│  └─ PlayerAnimationController
└─ AttackOrigin
```

### 3.2 사용 스크립트

| 스크립트 | 사용 방법 |
|---|---|
| `CharacterMove.cs` | Input System의 `OnMove()` 값을 `MoveDirection`으로 저장 |
| `PlayerMotor.cs` | `MoveDirection × PlayerStats.MoveSpeed`를 Rigidbody2D 속도로 적용 |
| `PlayerAnimationController.cs` | Rigidbody2D 속도를 읽어 이동/Idle 방향 결정 |
| `PlayerStats.cs` | 캐릭터, 투사체, 레벨 데이터를 조합해 최종 수치 계산 |
| `PlayerHP.cs` | 피해, 회복, 사망 및 이벤트 처리 |
| `PlayerAttack.cs` | 마우스 방향 계산, 공격 주기마다 투사체 자동 생성 |

### 3.3 물리 설정

```text
Player Layer: 8

Rigidbody2D
  Body Type: Dynamic
  Mass: 1
  Gravity Scale: 0
  Interpolate: Interpolate
  Collision Detection: Continuous
  Freeze Rotation Z: On

CapsuleCollider2D
  Offset: (0, 0.38)
  Size: (0.55, 0.75)
  Is Trigger: Off

PlayerHP
  Damage Cooldown: 0.5초
```

### 3.4 입력 설정

입력 에셋:

```text
Assets/GameScript/Character/CharacterMovement.inputactions
```

```text
Action Map: Game

Move
  Type: Value / Vector2
  Binding: W, A, S, D

Aim
  Type: Pass Through / Vector2
  Binding: Pointer Position
```

별도의 Attack 액션은 사용하지 않는다. `PlayerAttack.Update()`가 공격 주기에 맞춰 자동 발사한다.

### 3.5 애니메이션/렌더링

```text
Visual SpriteRenderer
  Sorting Layer: Actors
  Order in Layer: 10
  Sprite Sort Point: Pivot

PlayerAnimationController
  Moving Threshold: 0.05
  이동: 8방향
  Idle: 4방향
  대각선 정지: 시계 방향 기준 직선 방향 선택
```

---

## 4. 캐릭터별 설정

설정 에셋:

```text
Assets/GameScript/Data/CharacterDatas/
├─ Warrior.asset
├─ Archer.asset
├─ Rogue.asset
└─ Mage.asset
```

데이터 클래스:

```text
Assets/GameScript/Data/CharacterDatas/_CharacterDefinition.cs
```

### 4.1 현재 저장값

| 캐릭터 | ID | HP | 이동 속도 | 피해 배율 | 기본 초당 공격 | 투사체 속도 배율 | 사거리 배율 | 시작 투사체 |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| Warrior | 1 | 150 | 3.5 | 1.5 | 0.7 | 1.0 | 1.0 | Sword |
| Archer | 2 | 100 | 5.0 | 1.0 | 1.0 | 1.0 | 1.0 | Arrow |
| Rogue | 3 | 120 | 6.0 | 0.8 | 1.5 | 1.0 | 1.0 | Dagger |
| Mage | 4 | 100 | 3.6 | 2.0 | 0.5 | 0.8 | 1.0 | Magic |

`attackSpeedBonus`라는 필드 이름과 달리 현재 구현에서는 캐릭터의 기본 초당 공격 횟수로 사용된다.

### 4.2 최종 스탯 공식

```text
최대 HP
= 캐릭터 기본 HP + 레벨 HP 고정 보너스

이동 속도
= 캐릭터 기본 이동 속도 × 레벨 이동 배율

피해량
= 투사체 기본 피해
 × 캐릭터 피해 배율
 × 레벨 피해 배율

초당 공격 횟수
= 캐릭터 Attack Speed Bonus
 + 레벨 Attack Speed Bonus

투사체 속도
= 투사체 Move Speed
 × 캐릭터 투사체 속도 배율
 × 레벨 투사체 속도 배율

사거리 설정값
= 투사체 Range
 × 캐릭터 사거리 배율
 × 레벨 사거리 배율
```

레벨 1의 현재 기본 피해:

| 캐릭터 | 계산 | 결과 |
|---|---|---:|
| Warrior | `10 × 1.5` | 15 |
| Archer | `10 × 1.0` | 10 |
| Rogue | `10 × 0.8` | 8 |
| Mage | `10 × 2.0` | 20 |

### 4.3 현재 캐릭터 선택 연결 문제

```text
메뉴 CharacterSelectController
→ ClientSession.SelectedCharacterId 저장
→ GamePlayScene 로드
→ PlayerStats는 ClientSession을 읽지 않음
→ GamePlayScene에 직접 설정된 Starting Character 사용
```

현재 `GamePlayScene`의 Player에는 `Archer.asset`이 Starting Character로 오버라이드되어 있다. 따라서 메뉴에서 다른 캐릭터를 선택해도 실제 Gameplay는 Archer 스탯과 Arrow로 시작한다.

또한 `CharacterDefinition`에는 캐릭터 스프라이트와 Animator Controller 필드가 없다. 캐릭터 선택을 스탯에 연결하더라도 외형은 현재 Player 프리팹의 Visual을 그대로 사용한다.

---

## 5. 투사체 설정

### 5.1 공용 프리팹

```text
Assets/GameAssets/Projectile/Prefab/PlayerProjectile.prefab
```

```text
PlayerProjectile
├─ SpriteRenderer
├─ Rigidbody2D
├─ CircleCollider2D
└─ PlayerProjectile.cs
```

프리팹 설정:

```text
Layer: PlayerProjectile (11)
Transform Scale: (1, 1, 1)

SpriteRenderer
  Sorting Layer: Default
  Order in Layer: 20

Rigidbody2D
  Body Type: Dynamic
  Gravity Scale: 0
  Collision Detection: Continuous
  Freeze Rotation Z: On

CircleCollider2D
  Is Trigger: On
  Radius: 0.5

PlayerProjectile
  World Collision Mask: WorldCollision
```

### 5.2 투사체 데이터

```text
Assets/GameScript/Data/Projectiles/
├─ SwordProjectile.asset
├─ ArrowProjectile.asset
├─ DaggerProjectile.asset
└─ MagicProjectile.asset
```

데이터 클래스:

```text
Assets/GameScript/Data/Projectiles/ProjectileDefinition.cs
```

### 5.3 현재 저장값

| 투사체 | ID | 기본 피해 | 설정 APS | 속도 | Range | 생성 거리 | Scale | 회전 보정 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Sword | 1 | 10 | 0.5 | 12 | 8 | 0.7 | 기본 1 | -90 |
| Arrow | 2 | 10 | 6 | 12 | 8 | 0.7 | 0.5 | -45 |
| Dagger | 3 | 10 | 6 | 12 | 8 | 0.7 | 0.8 | -90 |
| Magic | 4 | 10 | 6 | 12 | 8 | 0.7 | 기본 1 | 0 |

현재 디스크의 Arrow Scale은 `0.5`다. Inspector에서 `0.2`로 바꾼 값이 저장되지 않았거나 Play Mode 중 변경되었을 수 있다.

### 5.4 런타임 사용 흐름

```text
PlayerAttack
→ PlayerStats에서 현재 ProjectileDefinition 확인
→ 마우스 월드 방향 계산
→ AttackOrigin + SpawnDistance 위치 계산
→ 공용 PlayerProjectile 프리팹 생성
→ Projectile Sprite 적용
→ Projectile Scale 적용
→ Rotation Offset 적용
→ Rigidbody2D 속도 적용
→ EnemyHP 피격 또는 WorldCollision 충돌 시 제거
```

### 5.5 현재 사용되지 않는 설정

`ProjectileDefinition.AttacksPerSecond`는 최종 공격 속도 계산에 사용되지 않는다.

실제 공격 속도는 다음 값만 사용한다.

```text
Character.AttackSpeedBonus + Level.AttackSpeedBonus
```

따라서 Sword의 APS `0.5`, Arrow/Dagger/Magic의 APS `6`은 현재 런타임 결과에 영향을 주지 않는다.

### 5.6 Range의 현재 의미

현재 `PlayerProjectile.Initialize()`는 다음 방식으로 제거 시간을 예약한다.

```csharp
Destroy(gameObject, lifetime);
```

`ProjectileRange`가 `lifetime` 인자로 전달되므로 Range는 실제 이동 거리가 아니라 생존 시간(초)으로 사용되고 있다.

```text
Move Speed 12 × Range 8초
= 약 96유닛 이동
```

실제 거리 사거리를 원한다면 생성 위치와 현재 위치의 거리를 비교해 제거하는 구조로 변경해야 한다.

---

## 6. 적 설정

### 6.1 씬 오브젝트

```text
GamePlayScene
├─ EnemySpawner
│  ├─ FlowField2D
│  ├─ EnemySimulation
│  └─ EnemySpawner
└─ Enemies
   └─ 런타임 EnemyBase(Clone) 생성
```

### 6.2 공용 적 프리팹

```text
Assets/GameScript/Enemy/Prefab/EnemyBase.prefab
```

```text
EnemyBase
├─ Rigidbody2D
├─ CircleCollider2D
├─ EnemyAgent
├─ EnemyHP
└─ Visual
   └─ SpriteRenderer
```

현재 설정:

```text
Layer: Enemy (9)
Root Scale: 1
Visual Scale: 1

Rigidbody2D
  Body Type: Dynamic
  Gravity Scale: 0
  Interpolate: Interpolate
  Collision Detection: Discrete
  Freeze Rotation Z: On

CircleCollider2D
  Radius: 0.3
  Is Trigger: Off

EnemyAgent
  Axis Switch After: 1.5초
  Forced Axis Duration: 0.75초
  Axis Dominance: 3
  Axis Probe Distance: 0.6

Visual SpriteRenderer
  Sorting Layer: Actors
  Order in Layer: 5
```

과거에 지정했던 몬스터 5배 크기는 현재 프리팹에 저장되어 있지 않다.

### 6.3 적 종류 데이터

현재 데이터:

```text
Assets/GameScript/Enemy/EnemiesData/Slime.asset
```

| 설정 | 값 |
|---|---:|
| Type ID | 1 |
| 이동 애니메이션 프레임 | 6 |
| Move Animation FPS | 6 |
| 이동 속도 | 2 |
| Separation Radius | 0.8 |
| Attack Radius | 1.2 |
| 최대 HP | 10 |
| 접촉 피해 | 코드 기본값 10 |

`contactDamage`는 `EnemyDefinition.cs`에 기본값 10으로 선언되어 있지만 현재 Slime 에셋 YAML에는 해당 필드가 저장되어 있지 않다. Inspector에서 값을 확인하고 저장해 명시적으로 고정하는 것이 안전하다.

### 6.4 적 초기화 흐름

```text
EnemySpawner가 EnemyBase 생성
→ EnemyAgent.Initialize(stableId, definition, simulation)
→ EnemyHP.Initialize(definition.MaxHealth)
→ SpriteRenderer에 definition.Sprite 적용
→ EnemySimulation에 Register
```

적이 이동 중이면 `MoveFrames` 배열과 `MoveAnimationFps`를 사용해 스프라이트를 교체한다. 좌우 이동 방향에 따라 `SpriteRenderer.flipX`도 설정한다.

---

## 7. 적 이동 및 Flow Field

### 7.1 EnemySimulation 설정

설정 위치:

```text
GamePlayScene → EnemySpawner → EnemySimulation
```

현재 값:

| 설정 | 값 |
|---|---:|
| Spatial Cell Size | 1.5 |
| Flow Weight | 1.0 |
| Separation Weight | 0.7 |
| Formation Weight | 0.25 |
| Variation Weight | 0.1 |
| Formation Range | 4 |
| Variation Speed | 0.8 |

최종 이동 방향:

```text
finalDirection =
    flowDirection     × 1.0
  + separation        × 0.7
  + formationOffset   × 0.25
  + movementVariation × 0.1
```

역할:

- Flow Direction: 장애물을 돌아 플레이어에게 접근
- Separation: 적끼리 완전히 겹치지 않게 밀어냄
- Formation: 플레이어 주변 황금각 슬롯으로 분산
- Variation: 적마다 약간 다른 움직임 추가
- Spatial Hash: 주변 적 검색 비용 감소

### 7.2 축 교대 이동

`EnemyAgent`는 이동 방향 중 한 축이 지나치게 우세한 상태가 `1.5초` 이상 유지되면 반대 축 이동을 `0.75초` 동안 시도한다.

```text
수평 이동 지속 → 수직 방향 이동 시도
수직 이동 지속 → 수평 방향 이동 시도
대체 방향에 벽이 있음 → 기존 Flow Field 방향 유지
```

### 7.3 FlowField2D 설정

설정 위치:

```text
GamePlayScene → EnemySpawner → FlowField2D
```

현재 값:

```text
Ground Tilemap: BG
Target: Player
World Collision Mask: WorldCollision
Refresh Interval: 0.15초
Collision Probe Size: (0.8, 0.8)
```

처리 방식:

1. 시작 시 Ground Tilemap의 이동 가능 셀 생성
2. WorldCollision과 겹치는 셀은 이동 불가 처리
3. 플레이어 셀에서 역방향 BFS 실행
4. 각 셀에 비용이 낮은 인접 셀 방향 저장
5. 플레이어가 다른 셀로 이동했을 때만 갱신
6. 갱신 주기를 0.15초로 제한

### 7.4 접촉 피해

Player와 Enemy의 물리 충돌 반응은 비활성화되어 있으며 `EnemySimulation`이 접촉 피해를 직접 계산한다.

```text
EnemySimulation.FixedUpdate
→ Enemy Collider와 Player Collider 거리 검사
→ 겹친 경우 EnemyDefinition.ContactDamage 조회
→ PlayerHP.TakeDamage()
→ PlayerHP Damage Cooldown 적용
```

---

## 8. 적 스폰 페이즈

설정 위치:

```text
GamePlayScene → EnemySpawner → EnemySpawner → Phases
```

### 8.1 공통 설정

| 설정 | 값 | 역할 |
|---|---:|---|
| Camera Margin | 1.5 | 카메라 외곽에서 추가로 띄우는 거리 |
| Ring Thickness | 3 | 원형 스폰 영역 두께 |
| Placement Attempts | 16 | 유효 위치 탐색 최대 횟수 |
| Collision Probe Radius | 0.3 | 벽 겹침 검사 반경 |
| Random Seed | 12345 | 재현 가능한 랜덤 순서 |

스폰 후보 위치 조건:

```text
Flow Field 이동 가능 위치
플레이어에게 도달 가능한 위치
WorldCollision과 겹치지 않는 위치
```

### 8.2 현재 페이즈

| 시작 시간 | 생성 간격 | Batch Size | Max Alive | 적 종류 | 가중치 |
|---:|---:|---:|---:|---|---:|
| 0초 | 1초 | 1 | 20 | Slime | 1 |

다중 페이즈 배열과 적 종류별 가중치 선택은 구현되어 있지만 현재 씬에는 1페이즈와 Slime 1종만 설정되어 있다.

---

## 9. 물리 레이어

등록된 레이어:

```text
8  Player
9  Enemy
10 WorldCollision
11 PlayerProjectile
12 EnemyProjectile
13 Pickup
```

현재 주요 관계:

| 관계 | 상태 | 처리 방식 |
|---|---|---|
| Player ↔ WorldCollision | On | 물리 충돌 |
| Enemy ↔ WorldCollision | On | 물리 충돌 |
| PlayerProjectile ↔ Enemy | On | Trigger 피격 |
| PlayerProjectile ↔ WorldCollision | On | Trigger 후 제거 |
| Enemy ↔ Enemy | Off | Separation으로 간격 표현 |
| Player ↔ Enemy | Off | EnemySimulation의 거리 검사로 접촉 피해 |
| Player ↔ PlayerProjectile | Off | 자신의 투사체와 충돌 방지 |
| PlayerProjectile ↔ PlayerProjectile | Off | 투사체끼리 충돌 방지 |

---

## 10. 메인 메뉴 UI

씬:

```text
Assets/Scenes/MainMenuScene.unity
```

구조:

```text
MainMenuFlow
ClientSession
MenuCanvas
├─ TitlePanel
├─ LoginPanel
├─ LobbyPanel
├─ RoomPanel
└─ CharacterPanel
```

### 10.1 MainMenuFlow

스크립트:

```text
Assets/GameScript/GamePlay/GameSecneController.cs
```

상태:

```text
Title
Login
Lobby
Room
CharacterSelect
```

버튼 흐름:

```text
Title 시작 버튼
→ OpenLogin()

Login 버튼
→ OnLoginSucceeded()
→ ID/PW 검증 없이 Lobby로 이동

방 참가 버튼
→ OnRoomJoined()

방 나가기 버튼
→ OnRoomLeft()

게임 시작 버튼
→ OnCharacterSelectStarted()
```

`GameSecneController`는 현재 파일명과 클래스명에 `Secne` 오타가 있지만 동일한 이름으로 참조되고 있어 컴파일 자체에는 문제가 없다.

### 10.2 ClientSession

스크립트:

```text
Assets/GameScript/GamePlay/ClientSession.cs
```

```text
Singleton
DontDestroyOnLoad 사용
SelectedCharacterId 기본값: 1
```

현재 사용 중:

- `SetSelectedCharacter()`
- `SelectedCharacterId`

선언만 있고 설정되지 않는 값:

- `UserId`
- `RoomId`
- `IsHost`

### 10.3 캐릭터 선택

오브젝트:

```text
CharacterPanel
└─ CharacterSelectController
```

현재 연결:

```text
Characters: Warrior, Archer, Rogue, Mage
Selected Character Text: 연결됨
Confirm Button: 연결됨
Game Scene Name: GamePlayScene
```

캐릭터 버튼 ID:

| 버튼 | 전달 ID |
|---|---:|
| Warrior | 1 |
| Archer | 2 |
| Rogue | 3 |
| Mage | 4 |

Confirm은 선택 ID를 `ClientSession`에 저장하고 `GamePlayScene`을 로드한다.

### 10.4 방 멤버 슬롯

```text
MemberSlot_01
MemberSlot_02
MemberSlot_03
MemberSlot_04
```

각 슬롯에는 `MemberSlotUI`가 있지만 다음 참조가 전부 비어 있다.

```text
Nickname Text: None
Ready State Text: None
Host Badge Text: None
```

Ready 상태를 변경하거나 슬롯을 갱신하는 방 컨트롤러도 없다. 현재 Room UI는 외형과 패널 전환만 구현된 상태다.

---

## 11. 게임 종료 UI

씬 오브젝트:

```text
GameFinishUI
└─ GameOverPanel
   ├─ SurvivalTimeText
   ├─ EnemyKillText
   ├─ RetryButton
   └─ QuitButton
```

스크립트:

```text
Assets/GameScript/GamePlay/UI/GameFinishUI.cs
```

동작:

```text
Awake
→ GameOverPanel 비활성화

Show(survivalTime, enemyKillCount)
→ TIME : MM:SS 표시
→ KILL : N 표시
→ GameOverPanel 활성화

RetryGame
→ Time.timeScale = 1
→ 현재 씬 다시 로드

QuitGame
→ 에디터에서는 Play Mode 종료
→ 빌드에서는 Application.Quit()
```

Retry와 Quit 버튼의 OnClick 연결은 현재 씬에 저장되어 있다.

---

## 12. 게임 진행 관리

오브젝트:

```text
GamePlayScene → GameSession
```

스크립트:

```text
Assets/GameScript/GamePlay/GameSession.cs
```

연결 참조:

```text
Player HP: Player의 PlayerHP
Game Over UI: GameFinishUI
```

현재 처리:

```text
Awake
→ Time.timeScale = 1

Update
→ 게임 오버 전까지 survivalTime 증가

EnemyHP.AnyEnemyDied
→ enemyKillCount 증가

PlayerHP.Died
→ GameFinishUI.Show()
→ Time.timeScale = 0
```

현재 종료 조건은 플레이어 사망뿐이다. 10분 생존 성공, 보스 클리어, 승리 화면은 없다.

---

## 13. 킬 기반 레벨 시스템

데이터:

```text
Assets/GameScript/Data/DefaultLevelProgression.asset
```

코드:

```text
Assets/GameScript/Data/LevelProgressionDefinition.cs
Assets/GameScript/Character/PlayerStats.cs
```

### 13.1 현재 레벨 표

| 레벨 | 누적 킬 | HP 추가 | 이동 배율 | 피해 배율 | 공속 추가 | 투사체 속도 배율 | 사거리 배율 |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 0 | 0 | 1.0 | 1.0 | 0 | 1 | 1 |
| 2 | 10 | 20 | 1.1 | 1.2 | 0.3 | 1 | 1 |
| 3 | 50 | 50 | 1.2 | 1.5 | 0.5 | 1 | 1 |
| 4 | 200 | 100 | 1.3 | 1.8 | 0.8 | 1 | 1 |
| 5 | 500 | 120 | 1.4 | 2.0 | 1.0 | 1 | 1 |
| 6 | 1,000 | 150 | 1.5 | 2.5 | 1.2 | 1 | 1 |
| 7 | 3,000 | 180 | 1.6 | 2.8 | 1.5 | 1 | 1 |
| 8 | 5,000 | 200 | 1.7 | 3.0 | 1.8 | 1 | 1 |
| 9 | 8,000 | 300 | 1.8 | 3.5 | 2.0 | 1 | 1 |
| 10 | 12,000 | 500 | 2.0 | 5.0 | 2.5 | 1 | 1 |

### 13.2 현재 미연결 상태

다음 부품은 각각 존재한다.

```text
GameSession
→ 적 사망 이벤트를 받아 킬 수 계산

LevelProgressionDefinition
→ 킬 수에 맞는 PlayerLevelEntry 검색 가능

PlayerStats.ApplyLevel()
→ PlayerLevelEntry를 최종 스탯에 적용 가능
```

하지만 이 세 요소를 연결하는 LevelController가 없다. 따라서 실제 게임에서는 킬 수가 증가해도 플레이어는 계속 레벨 1이다.

---

## 14. 카메라 설정

설정 위치:

```text
GamePlayScene → Main Camera → CameraFollow
```

현재 값:

| 설정 | 값 |
|---|---:|
| Target | Player |
| Offset | (0, 0) |
| Smooth Time | 0.12 |
| Max Speed | 20 |
| Pixels Per Unit | 16 |
| Snap On Start | On |

카메라는 `SmoothDamp`로 플레이어를 따라간 뒤 최종 위치를 16 PPU 픽셀 격자에 맞춘다.

---

## 15. 씬과 빌드 순서

Build Settings:

| Build Index | 씬 | 활성화 |
|---:|---|---|
| 0 | `Assets/Scenes/MainMenuScene.unity` | Yes |
| 1 | `Assets/Scenes/GamePlayScene.unity` | Yes |

캐릭터 선택의 `gameSceneName`은 현재 `GamePlayScene`으로 올바르게 연결되어 있다.

---

## 16. 설정 위치 빠른 참조

| 바꾸려는 항목 | 설정 위치 |
|---|---|
| 캐릭터 HP/이동/공속/피해 배율 | `Assets/GameScript/Data/CharacterDatas/각 캐릭터.asset` |
| 캐릭터 시작 무기 | 캐릭터 에셋의 `Starting Projectile` |
| 투사체 이미지/크기/피해/속도/회전 | `Assets/GameScript/Data/Projectiles/각 투사체.asset` |
| 플레이어 피격 쿨다운 | `Player.prefab → PlayerHP` |
| 플레이어 Collider | `Player.prefab → CapsuleCollider2D` |
| 적 HP/속도/접촉 피해/애니메이션 | `Enemy/EnemiesData/Slime.asset` |
| 적 크기/Collider | `EnemyBase.prefab` |
| 적 축 교대 움직임 | `EnemyBase.prefab → EnemyAgent` |
| 적 이동 혼합 비율 | `GamePlayScene → EnemySpawner → EnemySimulation` |
| Flow Field 갱신/충돌 크기 | `GamePlayScene → EnemySpawner → FlowField2D` |
| 스폰 시간/수/최대 생존/종류 | `GamePlayScene → EnemySpawner → EnemySpawner → Phases` |
| 레벨업 요구 킬/증가량 | `DefaultLevelProgression.asset` |
| 카메라 딜레이 | `GamePlayScene → Main Camera → CameraFollow` |
| 게임 종료 결과/버튼 | `GamePlayScene → GameFinishUI` |
| 메뉴 패널 흐름 | `MainMenuScene → MainMenuFlow` |
| 캐릭터 선택 목록/게임 씬 | `MainMenuScene → CharacterPanel → CharacterSelectController` |

---

## 17. 우선 수정 권장 순서

1. `ClientSession.SelectedCharacterId`를 Gameplay의 `PlayerStats.Initialize()`에 연결
2. 캐릭터별 스프라이트 또는 Animator Controller 데이터 추가
3. `GameSession`의 킬 수와 `DefaultLevelProgression`을 연결하는 LevelController 구현
4. 투사체 Range를 생존 시간이 아닌 실제 이동 거리로 변경
5. `ProjectileDefinition.AttacksPerSecond`를 사용할지 제거할지 결정
6. Slime의 Contact Damage를 에셋에 명시적으로 저장
7. 추가 EnemyDefinition과 2차 이후 스폰 페이즈 생성
8. 인게임 HP/시간/킬/레벨 HUD 구현
9. 10분 생존 성공 또는 보스 클리어 조건 구현
10. Room 멤버 슬롯 참조 연결 및 Ready/Host 상태 구현
11. 로그인/로비/방 UI를 서버 메시지와 연결

## 18. 문서 갱신 규칙

설정을 변경할 때 다음 항목도 함께 갱신한다.

- ScriptableObject 수치를 바꾸면 해당 표 수정
- 씬 Inspector의 페이즈/AI 값을 바꾸면 Enemy/Spawn 표 수정
- 새 스크립트가 연결되면 구현 상태를 `미연결`에서 `구현됨`으로 변경
- 새 적/캐릭터/투사체를 추가하면 데이터 표에 행 추가
- 실제 서버가 연결되면 UI 모형과 서버 연동 상태를 분리해 기록

