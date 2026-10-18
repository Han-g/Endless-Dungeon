# Endless Dungeon — 게임 시스템 기초 기획안

| 속성 | 값 |
|---|---|
| 문서 유형 | Concept / Game Design |
| 카테고리 | Product, Game System |
| 상태 | Draft |
| 기준일 | 2026-09-15 |
| 태그 | `Unity` `NestJS` `Colyseus` `MongoDB` `Co-op` `Roguelite` |
| 적용 범위 | 신규 목표 설계 |
| 제외 범위 | 현재 코드와 씬의 구현 상태, 상세 클래스 구현, 최종 밸런스 |

> 이 문서는 현재 구현에 맞추는 문서가 아니다. 앞으로 구축할 게임의 기본 흐름, 서버 권한, 시간 기반 페이즈, 몬스터 특징, 처치 기반 특성 성장을 정의하는 상위 기획 문서다.

---

## 0. 노션 페이지 구성 권장안

이 파일을 노션의 `Endless Dungeon 기획` 상위 페이지로 가져온 뒤 다음 구조로 분리한다.

```text
Endless Dungeon 기획
├─ 01. 게임 개요와 핵심 루프
├─ 02. 서버·클라이언트 역할
├─ 03. 게임 진행과 상태 전환
├─ 04. 시간 기반 페이즈·스폰
├─ 05. 몬스터 시스템
├─ 06. 처치 기반 성장·특성
├─ 07. 캐릭터·스탯 계산
├─ 08. 데이터 정의
├─ 09. 밸런스 기준
├─ 10. 구현 로드맵
└─ 11. 결정 로그
```

노션 데이터베이스는 다음 네 개부터 시작한다.

| 데이터베이스 | 용도 | 대표 관계 |
|---|---|---|
| Monster Catalog | 적 수치와 행동 유형 | Spawn Phase, Trait 테스트 |
| Spawn Phase | 시간대별 등장 규칙 | Monster Catalog |
| Trait Catalog | 성장 선택지와 스탯 효과 | Character Catalog |
| Character Catalog | 캐릭터 기본 스탯과 무기 | Trait Catalog, Projectile Catalog |

---

# 1. 게임 개요와 핵심 루프

## 1.1 게임 목표

최대 4명의 플레이어가 협동하여 지속적으로 등장하는 적을 처치하고, 처치 성과로 특성을 획득하며 가능한 오래 생존한다.

게임의 두 성장 축은 분리한다.

| 성장 축 | 기준 | 게임에 주는 효과 |
|---|---|---|
| 위협 성장 | 경과 시간 | 더 강한 적, 새로운 공격 유형, 높은 생성량 |
| 플레이어 성장 | 적 처치 성과 | 특성 선택, 스탯 상승, 공격 방식 확장 |

## 1.2 핵심 플레이 루프

```text
적 생성
→ 적의 추적·공격
→ 플레이어의 이동·공격
→ 적 처치
→ 팀 처치 진행도 증가
→ 성장 조건 달성
→ 특성 선택
→ 플레이어 강화
→ 다음 페이즈의 강한 적 등장
```

## 1.3 전체 서비스 흐름

```text
로그인
→ 로비
→ 방 생성 또는 참가
→ 캐릭터 선택
→ Ready
→ Countdown
→ Playing
→ 모든 플레이어 사망 또는 종료 조건 달성
→ 결과 저장
→ 결과 화면
→ 재시작 또는 로비 복귀
```

## 1.4 핵심 설계 원칙

- 시간은 플레이어가 멈춰 있어도 계속 위협을 증가시킨다.
- 적 처치는 플레이어에게 다음 위협을 견딜 성장 기회를 준다.
- 수치 차이는 데이터로, 행동 차이는 몬스터 행동 클래스로 표현한다.
- 클라이언트는 입력과 화면 표현을 담당하고 게임 판정은 서버가 확정한다.
- MongoDB에는 영구 정보와 경기 결과만 저장하고 매 Tick 상태는 저장하지 않는다.
- 초기 수치는 확정값이 아니라 플레이 테스트를 위한 가설이다.

---

# 2. 서버·클라이언트 역할

## 2.1 구성요소

| 구성요소 | 책임 | 담당하지 않는 것 |
|---|---|---|
| Unity | 입력, 카메라, 애니메이션, VFX, UI, 상태 표현 | 피해·사망·스폰·보상 확정 |
| NestJS | 계정, 인증, 프로필, 로비, 방 입장 승인, 결과·보상 저장 | 매 Tick 이동과 전투 판정 |
| Colyseus | Room, 게임 상태, 이동, 적, 투사체, 전투, 성장, 동기화 | 계정 비밀번호와 영구 재화 직접 변경 |
| MongoDB | 계정, 캐릭터 보유, 전적, 보상, 경기 결과 | 실시간 좌표·투사체·AI 경로 저장 |

> NestJS는 .NET이 아니라 Node.js/TypeScript 서버 프레임워크다. .NET을 사용할 경우 별도로 ASP.NET Core를 선택해야 한다.

## 2.2 게임 중 서버 권한

Colyseus가 다음 값을 최종 결정한다.

- 현재 게임 페이즈와 경과 시간
- 적 종류, 수, 생성 위치
- 플레이어와 몬스터 위치
- 투사체 생성과 충돌
- 피해, HP, 사망, 처치
- 팀 처치 진행도
- 특성 후보와 선택 결과
- 최종 전투 스탯
- 경기 종료 사유와 결과 원본

Unity가 서버로 보내는 값은 다음과 같은 의도뿐이다.

- 이동 방향
- 조준 방향
- 특성 선택 번호
- Ready 또는 방 진행 요청

## 2.3 결과 저장 흐름

```text
Colyseus가 경기 결과 확정
→ NestJS 내부 결과 API 호출
→ NestJS가 결과 검증
→ MongoDB transaction 또는 원자 연산으로 결과·보상 저장
→ Unity는 저장된 결과를 조회해 표시
```

---

# 3. 게임 진행과 상태 전환

## 3.1 Room 상태

| 상태 | 설명 | 허용되는 주요 요청 |
|---|---|---|
| Waiting | 플레이어 입장 대기 | 입장, 퇴장, 방장 시작 요청 |
| CharacterSelect | 캐릭터 선택 | 캐릭터 선택, Ready |
| Countdown | 게임 시작 준비 | Ready 취소 정책에 따른 복귀 |
| Playing | 실시간 경기 | 이동, 조준, 특성 선택 |
| Finished | 결과 확정 | 결과 조회, 퇴장 |

## 3.2 Playing 내부 흐름

한 번의 서버 Tick은 다음 순서를 기준으로 한다.

1. 플레이어 입력 수집·검증
2. 플레이어 이동
3. 경과 시간과 페이즈 갱신
4. 적 생성 요청 처리
5. 몬스터 목표 선택·이동
6. 몬스터 공격 처리
7. 플레이어 투사체 처리
8. 충돌·피해 계산
9. 사망·처치 이벤트 처리
10. 성장 조건 확인
11. 특성 선택 결과 적용
12. 경기 종료 조건 확인
13. 동기화 상태 갱신

---

# 4. 시간 기반 페이즈·스폰

## 4.1 페이즈의 책임

페이즈는 다음 항목을 결정한다.

- 새로 등장할 수 있는 적 종류
- 적 종류별 등장 가중치
- 초당 Spawn Budget
- 동시에 존재할 수 있는 적 수
- 엘리트 등장 확률
- 보스 등장 조건
- 공통 체력·공격력·속도 배율

페이즈는 플레이어 처치 수가 아니라 경과 시간으로 변경한다. 그래야 성장 속도가 빠른 팀도 계속 압박받고, 플레이어가 공격하지 않고 도망만 다녀도 게임이 정체되지 않는다.

## 4.2 초기 페이즈 가설

| 페이즈 | 시간 | 신규 등장 유형 | 목표 경험 |
|---|---:|---|---|
| 1 | 0~2분 | 추적형 | 조작과 공격 방식 학습 |
| 2 | 2~5분 | 고속형 | 목표 우선순위 학습 |
| 3 | 5~8분 | 원거리형, 돌진형 | 위치 선정과 회피 요구 |
| 4 | 8~12분 | 방어형, 엘리트 | 화력과 생존력 점검 |
| 5 | 12분 이후 | 전체 유형, 보스 | 빌드 완성도 시험과 무한 성장 |

## 4.3 Spawn Budget

단순 마릿수 대신 비용을 소비하여 적을 생성한다.

```text
availableBudget += budgetPerSecond × deltaTime

적 생성 조건:
availableBudget >= monster.spawnCost
AND aliveEnemies < phase.maxAlive
AND 유효한 생성 위치가 존재함
```

| 유형 | 초기 Spawn Cost |
|---|---:|
| 추적형 | 1 |
| 고속형 | 2 |
| 원거리형 | 3 |
| 돌진형 | 4 |
| 방어형 | 5 |
| 엘리트 | 기본 비용 × 2 |
| 보스 | 20 이상 |

## 4.4 스폰 위치 규칙

- 플레이어 집단을 둘러싼 최소·최대 반경 사이에서 후보를 만든다.
- 벽, 물, Map Object 등 Blocked 영역은 제외한다.
- 화면 바로 안쪽보다 카메라 외부 또는 예고 가능한 영역을 우선한다.
- 모든 후보가 막혀 있으면 탐색 반경을 단계적으로 늘린다.
- 같은 위치에 다수의 적이 생성되지 않도록 최소 간격을 검사한다.
- 생성 위치를 찾지 못하면 강제 생성하지 않고 다음 Spawn Tick으로 넘긴다.

## 4.5 SpawnPhaseDefinition

| 필드 | 의미 | 예시 |
|---|---|---|
| `phaseId` | 고유 ID | `phase_03` |
| `startTimeSeconds` | 시작 시간 | `300` |
| `budgetPerSecond` | 초당 생성 비용 | `4.0` |
| `maxAlive` | 동시 생존 제한 | `80` |
| `enemyWeights` | 적 ID와 가중치 | `slime:40, bat:25` |
| `eliteChance` | 엘리트 확률 | `0.05` |
| `healthMultiplier` | 공통 HP 배율 | `1.4` |
| `damageMultiplier` | 공통 피해 배율 | `1.2` |
| `speedMultiplier` | 공통 속도 배율 | `1.05` |
| `bossRuleId` | 보스 규칙 | `boss_01` |

---

# 5. 몬스터 시스템

## 5.1 구조 원칙

클래스 이름은 `Moster`가 아니라 `Monster`를 사용한다.

```text
MonsterBase
├─ ChaserMonster
├─ FastMonster
├─ RangedMonster
├─ ChargerMonster
├─ TankMonster
└─ BossMonster
```

- HP가 다른 슬라임 두 종류처럼 수치만 다른 경우에는 클래스를 추가하지 않는다.
- 이동·공격 상태 머신이 다른 경우에만 하위 클래스를 추가한다.
- 엘리트는 별도의 깊은 상속보다 기본 몬스터에 Modifier를 조합한다.
- 상속 깊이는 `MonsterBase → 구체 행동 클래스` 한 단계로 유지한다.

## 5.2 MonsterBase 책임

### 공통 상태

```text
entityId, monsterId, position, velocity
currentHp, maxHp, moveSpeed
attackDamage, attackRange, attackCooldown
collisionRadius, targetPlayerId
lifeState, actionState, nextAttackTick
```

### 공통 기능

```text
Initialize
Update
SelectTarget
Move
TryAttack
TakeDamage
ApplyKnockback
Die
Despawn
```

### 하위 클래스가 담당할 기능

- 목표와의 거리별 행동 결정
- 공격 준비, 실행, 회복 순서
- 특수 이동 방식
- 전용 투사체 또는 범위 공격 생성 요청
- 공격 예고 상태 생성

## 5.3 몬스터 상태 머신

일반 몬스터의 기본 상태는 다음과 같다.

```text
Spawning
→ Active
   ├─ Moving
   ├─ Telegraph
   ├─ Attacking
   └─ Recovery
→ Dead
→ Despawned
```

상태별 애니메이션은 Unity가 표현하지만 상태 전환 시점은 Colyseus가 확정한다.

## 5.4 초기 몬스터 역할

| 유형 | 행동 특징 | 강점 | 약점 |
|---|---|---|---|
| Chaser | 가장 가까운 플레이어를 직접 추적 | 단순한 압박과 다수 운용 | 단독 위협이 낮음 |
| Fast | 빠르게 접근하고 체력이 낮음 | 후방과 빈틈 공격 | 광역 공격에 약함 |
| Ranged | 거리를 유지하며 투사체 발사 | 안전지대 제한 | 근접 대응이 약함 |
| Charger | 예고 후 방향을 고정하고 돌진 | 높은 순간 피해 | 공격 후 빈틈이 큼 |
| Tank | 느리지만 높은 HP와 넉백 저항 | 진로 방해와 전선 유지 | 이동 속도가 낮음 |
| Boss | 여러 패턴과 페이즈 보유 | 경기 목표 제공 | 명확한 예고와 공략법 필요 |

## 5.5 엘리트 Modifier 예시

| Modifier | 효과 | 표현 요구 |
|---|---|---|
| Giant | 크기·HP·충돌 반경 증가 | 크기와 외곽선 변경 |
| Swift | 이동·공격 속도 증가 | 색상 또는 잔상 |
| Armored | 피해 감소 또는 보호막 | 방어 이펙트 |
| Explosive | 사망 시 범위 공격 | 사망 전후 경고 |
| Splitter | 사망 시 작은 적 생성 | 분열 애니메이션 |
| Vampiric | 공격 성공 시 HP 회복 | 흡수 이펙트 |

## 5.6 MonsterDefinition

| 필드 | 의미 |
|---|---|
| `monsterId` | 몬스터 고유 ID |
| `displayName` | 표시 이름 |
| `behaviorType` | 사용할 행동 클래스 또는 전략 ID |
| `maxHp` | 기본 최대 HP |
| `moveSpeed` | 기본 이동 속도 |
| `attackDamage` | 기본 피해량 |
| `attackRange` | 공격 가능 거리 |
| `attacksPerSecond` | 초당 공격 횟수 |
| `collisionRadius` | 서버 충돌 반경 |
| `knockbackResistance` | 넉백 저항 |
| `spawnCost` | 생성 비용 |
| `killValue` | 처치 진행도 기여량 |
| `projectileTypeId` | 원거리 공격 투사체 ID |
| `visualTypeId` | Unity 프리팹·애니메이션 ID |
| `modifierPoolId` | 엘리트 Modifier 후보군 |

## 5.7 초기 몬스터 수치 가설

| ID | 역할 | HP | 속도 | 피해 | 비용 |
|---|---|---:|---:|---:|---:|
| `slime_basic` | Chaser | 30 | 2.0 | 5 | 1 |
| `bat_fast` | Fast | 15 | 4.0 | 4 | 2 |
| `archer_enemy` | Ranged | 25 | 1.8 | 7 | 3 |
| `charger_enemy` | Charger | 50 | 2.2 | 12 | 4 |
| `golem_tank` | Tank | 120 | 1.0 | 15 | 5 |

---

# 6. 처치 기반 성장·특성

## 6.1 성장 기준

협동 플레이에서 마지막 타격만 인정하면 팀원이 경쟁하게 된다. 기본안은 `팀 처치 진행도`를 사용한다.

- 적이 죽으면 `killValue`만큼 팀 진행도가 증가한다.
- 임계값에 도달하면 각 생존 플레이어가 자신의 특성 후보를 받는다.
- 후보와 선택 결과는 플레이어별로 다를 수 있다.
- 개인 킬 수는 결과 통계와 특정 특성 조건에만 사용한다.

## 6.2 초기 성장 임계값 가설

| 성장 단계 | 팀 누적 처치 진행도 |
|---|---:|
| 1 | 10 |
| 2 | 25 |
| 3 | 45 |
| 4 | 70 |
| 5 | 100 |
| 이후 | 이전 요구량 + 40 |

대체 공식:

```text
requiredKillScore(level) = round(baseKills × level^1.35)
```

어떤 방식을 사용할지는 플레이 테스트 뒤 결정한다.

## 6.3 특성 선택 흐름

```text
처치 임계값 도달
→ 서버가 플레이어별 후보 3개 생성
→ TraitSelectionState 동기화
→ Unity가 선택 UI 표시
→ 플레이어가 traitId 전송
→ 서버가 후보·중첩·선행 조건 검증
→ 특성 적용과 최종 스탯 재계산
→ 결과 동기화
```

초기 선택 제한 시간은 8초로 가정한다. 제한 시간이 끝나면 서버가 정해진 규칙에 따라 자동 선택한다.

## 6.4 특성 분류

### 공격

- 피해량 증가
- 공격 속도 증가
- 투사체 속도 증가
- 투사체 크기 증가
- 사거리 증가
- 관통 횟수 증가
- 투사체 개수 증가
- 치명타 확률 증가

### 생존

- 최대 HP 증가
- 즉시 또는 지속 HP 회복
- 피해 감소
- 피격 무적 시간 증가
- 넉백 저항 증가
- 이동 속도 증가

### 특수

- 처치 시 HP 회복
- 추가 투사체 발사
- 투사체 튕김
- 적 사망 시 폭발
- 일정 시간마다 보호막
- 보스 추가 피해

## 6.5 TraitDefinition

| 필드 | 의미 |
|---|---|
| `traitId` | 고유 ID |
| `displayName` | 표시 이름 |
| `description` | UI 설명 |
| `category` | Attack, Survival, Special |
| `rarity` | 등장 희귀도 |
| `weight` | 후보 등장 가중치 |
| `maxStack` | 최대 중첩 수 |
| `requiredCharacterIds` | 사용 가능한 캐릭터 |
| `requiredTraitIds` | 선행 특성 |
| `excludedTraitIds` | 동시 보유 불가 특성 |
| `statModifiers` | 적용할 스탯 변경 목록 |
| `specialEffectId` | 특수 효과 처리 ID |

## 6.6 초기 특성 가설

| ID | 효과 | 최대 중첩 |
|---|---|---:|
| `damage_up` | 피해량 +15% | 5 |
| `attack_speed_up` | 초당 공격 횟수 +0.15 | 5 |
| `range_up` | 사거리 +20% | 3 |
| `pierce_up` | 관통 가능 적 +1 | 3 |
| `max_hp_up` | 최대 HP +20 | 5 |
| `kill_heal` | 적 처치 시 HP 2 회복 | 3 |

---

# 7. 캐릭터·스탯 계산

## 7.1 캐릭터 차별화

캐릭터는 다음 세 요소로 구분한다.

1. 기본 스탯
2. 기본 투사체 또는 공격 방식
3. 전용 특성 후보군

캐릭터 외형이나 프리팹이 서버 판정 수치를 결정해서는 안 된다. 서버의 `CharacterDefinition`을 원본으로 사용하고 Unity는 시각 데이터만 연결한다.

## 7.2 기본 스탯

```text
maxHp
moveSpeed
baseDamage
attacksPerSecond
projectileSpeed
range
projectileScale
pierceCount
knockbackPower
damageReduction
```

## 7.3 계산 순서

```text
finalStat = clamp(
    (baseStat + totalFlatBonus) × (1 + totalPercentBonus),
    minimum,
    maximum
)
```

공격 속도는 합산형을 기본으로 한다.

```text
finalAttacksPerSecond = clamp(
    baseAttacksPerSecond + totalAttackSpeedBonus,
    0.1,
    10.0
)

attackIntervalSeconds = 1 / finalAttacksPerSecond
```

## 7.4 안전 범위 가설

| 스탯 | 최소 | 최대 |
|---|---:|---:|
| 초당 공격 횟수 | 0.1 | 10 |
| 이동 속도 | 0.5 | 15 |
| 관통 횟수 | 1 | 10 |
| 피해 감소 | 0% | 80% |
| 치명타 확률 | 0% | 100% |

---

# 8. 데이터 정의

## 8.1 정적 정의 데이터

```text
CharacterDefinition
MonsterDefinition
ProjectileDefinition
SpawnPhaseDefinition
TraitDefinition
MatchRulesDefinition
EliteModifierDefinition
```

정적 데이터는 경기 시작 시 버전을 고정한다. 경기 도중 운영 데이터가 변경되어도 진행 중인 Room의 수치는 바뀌지 않는다.

## 8.2 실시간 경기 상태

```text
RoomState
MatchProgressState
PlayerState
PlayerProgressState
MonsterState
ProjectileState
TraitSelectionState
MatchSummaryState
```

### MatchProgressState

| 필드 | 의미 |
|---|---|
| `elapsedTicks` | 서버 기준 경과 Tick |
| `currentPhaseId` | 현재 페이즈 |
| `teamKillScore` | 팀 처치 진행도 |
| `nextTraitThreshold` | 다음 성장 임계값 |
| `aliveEnemyCount` | 생존 적 수 |
| `bossState` | 보스 진행 상태 |

### PlayerProgressState

| 필드 | 의미 |
|---|---|
| `playerId` | 경기 내 플레이어 ID |
| `growthLevel` | 현재 성장 단계 |
| `personalKillCount` | 개인 처치 통계 |
| `selectedTraitIds` | 선택한 특성 목록 |
| `pendingTraitOptions` | 현재 선택 후보 |
| `traitSelectionDeadlineTick` | 선택 제한 시간 |
| `derivedStats` | 서버가 계산한 최종 스탯 |

## 8.3 MongoDB 영구 데이터

초기 컬렉션:

```text
users
profiles
userCharacters
matchResults
playerMatchResults
```

`playerMatchResults`에는 다음 결과를 저장한다.

- 사용자와 캐릭터 ID
- 생존 시간
- 개인 처치 수
- 팀 처치 진행도
- 최종 성장 단계
- 선택한 특성 목록
- 가한 피해와 받은 피해
- 생존 여부
- 확정 보상

다음 데이터는 MongoDB에 매 Tick 저장하지 않는다.

- 현재 좌표와 속도
- 실시간 HP
- 적과 투사체 위치
- AI 경로
- 공격 쿨다운

---

# 9. 서버 이벤트 흐름

## 9.1 적 처치

```text
CombatSystem
→ MonsterKilledEvent 생성
→ MonsterState를 Dead로 변경
→ ProgressionSystem이 killValue 반영
→ SpawnSystem이 aliveEnemyCount 반영
→ 결과 통계 갱신
→ 임계값을 넘으면 TraitSelection 생성
```

## 9.2 특성 선택

```text
TraitSelectionSystem이 후보 생성
→ Unity가 후보 표시
→ Player가 traitId 요청
→ 후보 포함 여부 검사
→ maxStack·선행·제외 조건 검사
→ PlayerProgressState 갱신
→ StatCalculationSystem 재계산
```

## 9.3 페이즈 변경

```text
elapsedTicks 갱신
→ PhaseDirector가 현재 페이즈 확인
→ 새 페이즈 진입
→ Spawn Budget·적 가중치 변경
→ 필요하면 보스 또는 이벤트 예약
→ phaseChanged 알림
```

---

# 10. Unity 표현 요구사항

Unity는 서버 상태를 다음과 같이 표현한다.

| 서버 상태 | Unity 표현 |
|---|---|
| Monster Spawning | 생성 애니메이션 또는 바닥 예고 |
| Monster Telegraph | 공격 범위·방향 표시 |
| Monster Attacking | 공격 애니메이션과 사운드 |
| Monster Dead | 사망 애니메이션 후 제거 |
| TraitSelection pending | 후보 3개 UI와 제한 시간 |
| Phase changed | 페이즈 알림과 경고 효과 |
| Elite modifier | 색, 외곽선, 크기, 아이콘 |

Unity가 애니메이션이 끝났다는 이유로 서버의 `Dead`, `Attack`, `Despawn` 상태를 변경해서는 안 된다.

---

# 11. 초기 MVP 범위

## 11.1 포함

- [ ] 시간 기반 페이즈 5개
- [ ] Spawn Budget 방식
- [ ] Chaser, Fast, Ranged, Charger, Tank 몬스터
- [ ] MonsterBase 공통 생명주기
- [ ] 몬스터 행동별 한 단계 상속 구조
- [ ] 팀 처치 진행도
- [ ] 특성 후보 3개 중 1개 선택
- [ ] 공격 특성 5개
- [ ] 생존 특성 5개
- [ ] 서버 최종 스탯 계산
- [ ] 모든 플레이어 사망 시 결과 확정
- [ ] MongoDB 경기 결과 저장

## 11.2 후속 확장

- [ ] 엘리트 Modifier
- [ ] 보스 패턴과 보스 페이즈
- [ ] 캐릭터 전용 특성
- [ ] 특성 조합과 진화
- [ ] 상태 이상
- [ ] 아이템 드롭
- [ ] 맵 이벤트
- [ ] 난이도 선택
- [ ] 일일·주간 도전 규칙

---

# 12. 구현 로드맵

## 단계 1 — 데이터 원본

- [ ] `MonsterDefinition` 필드 확정
- [ ] `SpawnPhaseDefinition` 필드 확정
- [ ] `TraitDefinition` 필드 확정
- [ ] `CharacterDefinition`과 스탯 범위 확정
- [ ] ID 명명 규칙 확정

완료 조건: 코드에 개별 몬스터·특성 수치를 직접 넣지 않고 데이터로 표현할 수 있다.

## 단계 2 — MonsterBase와 기본 적

- [ ] 공통 생명주기 정의
- [ ] Chaser 구현
- [ ] Fast 구현
- [ ] Ranged 구현
- [ ] Charger 구현
- [ ] Tank 구현

완료 조건: 동일한 피해·사망·넉백 경계를 사용하면서 행동만 다르게 실행된다.

## 단계 3 — PhaseDirector와 SpawnSystem

- [ ] 경과 시간 기반 페이즈 변경
- [ ] Spawn Budget 누적
- [ ] 가중치 기반 몬스터 선택
- [ ] Blocked 영역을 제외한 생성 위치 탐색
- [ ] `maxAlive`와 실패 시 다음 Tick 연기

완료 조건: 데이터만 바꿔 시간대별 몬스터 조합과 양을 변경할 수 있다.

## 단계 4 — 처치와 특성 성장

- [ ] `MonsterKilledEvent` 정의
- [ ] 팀 처치 진행도 누적
- [ ] 후보 3개 생성
- [ ] 선택 검증과 시간 초과 처리
- [ ] 특성 중첩·선행·제외 조건
- [ ] 최종 스탯 재계산

완료 조건: 같은 입력과 Seed에서 후보와 결과가 서버 기준으로 재현된다.

## 단계 5 — Unity 표현

- [ ] 몬스터 종류별 프리팹 연결
- [ ] 행동 상태별 애니메이션
- [ ] 공격 예고
- [ ] 엘리트 시각 구분
- [ ] 특성 선택 UI
- [ ] 페이즈 변경 UI

완료 조건: Unity는 서버 상태를 표현하지만 판정 값을 수정하지 않는다.

## 단계 6 — 결과 저장·밸런스

- [ ] 경기 결과 생성
- [ ] NestJS 결과 API
- [ ] MongoDB 중복 저장 방지
- [ ] 선택 특성과 최종 스탯 기록
- [ ] 페이즈별 생존·처치 지표 수집

완료 조건: 동일 경기가 재전송되어도 보상과 결과가 중복 저장되지 않는다.

---

# 13. 노션 데이터베이스 템플릿

## 13.1 Monster Catalog

| 속성 | 노션 유형 | 설명 |
|---|---|---|
| Name | Title | 몬스터 이름 |
| Monster ID | Text | 코드와 데이터의 안정 ID |
| Role | Select | Chaser, Fast, Ranged, Charger, Tank, Boss |
| Status | Select | Draft, Test, Active, Deprecated |
| HP | Number | 기본 HP |
| Move Speed | Number | 기본 이동 속도 |
| Damage | Number | 기본 피해 |
| Spawn Cost | Number | 생성 비용 |
| Kill Value | Number | 처치 진행도 기여 |
| Available Phases | Relation | Spawn Phase 연결 |
| Visual Asset | URL 또는 Files | 프리팹·스프라이트 위치 |
| Notes | Text | 행동 설명과 테스트 기록 |

## 13.2 Spawn Phase

| 속성 | 노션 유형 | 설명 |
|---|---|---|
| Name | Title | 페이즈 이름 |
| Phase ID | Text | 안정 ID |
| Start Time | Number | 시작 초 |
| Budget / Sec | Number | 초당 비용 |
| Max Alive | Number | 최대 적 수 |
| Elite Chance | Number | 0~1 |
| Monsters | Relation | Monster Catalog 연결 |
| Goal | Text | 해당 페이즈가 만드는 경험 |
| Status | Select | Draft, Test, Active |

## 13.3 Trait Catalog

| 속성 | 노션 유형 | 설명 |
|---|---|---|
| Name | Title | 특성 이름 |
| Trait ID | Text | 안정 ID |
| Category | Select | Attack, Survival, Special |
| Rarity | Select | Common, Rare, Epic |
| Max Stack | Number | 최대 중첩 |
| Weight | Number | 후보 가중치 |
| Effect | Text | 계산식과 효과 |
| Characters | Relation | 적용 캐릭터 |
| Prerequisites | Relation | 선행 특성 |
| Exclusions | Relation | 배타 특성 |
| Status | Select | Draft, Test, Active |

## 13.4 Character Catalog

| 속성 | 노션 유형 | 설명 |
|---|---|---|
| Name | Title | 캐릭터 이름 |
| Character ID | Text | 안정 ID |
| Base HP | Number | 기본 HP |
| Move Speed | Number | 기본 속도 |
| Base Damage | Number | 기본 피해 |
| Attacks / Sec | Number | 기본 공속 |
| Projectile | Relation | 투사체 정의 연결 |
| Available Traits | Relation | 특성 후보군 |
| Status | Select | Draft, Test, Active |

---

# 14. 결정이 필요한 항목

아래 항목은 구현 전에 결정 로그로 분리한다.

- [ ] 성장 기준을 팀 처치 진행도로 확정할지
- [ ] 죽은 플레이어도 이후 팀 성장 특성을 받을지
- [ ] 특성 선택 중 게임을 계속 진행할지
- [ ] 선택 시간 초과 시 자동 선택 규칙
- [ ] 중복 특성의 최대 중첩 방식
- [ ] 엘리트를 별도 클래스가 아닌 Modifier로 확정할지
- [ ] 보스 등장 기준을 시간으로만 할지
- [ ] 무한 페이즈의 HP·피해 증가 공식을 어떻게 할지
- [ ] 최소·최대 스폰 반경
- [ ] 한 경기의 목표 플레이 시간

---

# 15. 밸런스 측정 항목

플레이 테스트마다 다음 값을 기록한다.

| 지표 | 확인 목적 |
|---|---|
| 페이즈별 평균 생존 시간 | 난이도 급증 구간 확인 |
| 분당 생성 비용 | 실제 적 압박량 확인 |
| 분당 처치 진행도 | 성장 속도 확인 |
| 특성별 선택률 | 선호도와 함정 선택지 확인 |
| 특성별 승률·생존 시간 | 과도한 성능 확인 |
| 몬스터별 가한 피해 | 위협도 확인 |
| 몬스터별 생존 시간 | HP·속도 적정성 확인 |
| 플레이어별 피해 기여 | 캐릭터 격차 확인 |
| 서버 Tick 처리 시간 | 적 수와 시스템 부하 확인 |

---

# 16. 변경 이력

| 날짜 | 버전 | 변경 내용 |
|---|---|---|
| 2026-09-15 | 0.1 | 기본 게임 흐름, 시간 기반 페이즈, MonsterBase, 처치 기반 특성 성장, 노션 DB 구조 작성 |

