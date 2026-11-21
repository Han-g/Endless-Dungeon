import { MyRoomState } from "../rooms/schema/MyRoomState.js";

import { EnemySystem } from "./EnemySystem.js";

import { ProjectileSystem } from "./ProjectileSystem.js";

import { rewardMonsterKill } from "../game/CharacterGrowth.js";

const MAX_DELTA_SECONDS = 0.1;
const PLAYER_HURT_INVULNERABILITY_SECONDS = 0.75;

export class CombatSystem {
    /*
     * 플레이어별 전역 접촉 피해 쿨다운입니다.
     *
     * 적별로 쿨다운을 만들면 적 10마리가 겹쳤을 때
     * 한 틱에 피해가 10번 적용될 수 있습니다.
     */
    private readonly nextPlayerDamageTimes =
        new Map<string, number>();
    private readonly nextEnemyContactTimes =
        new Map<string, Map<string, number>>();

    public constructor(
        private readonly state: MyRoomState,

        private readonly enemySystem: EnemySystem,

        private readonly projectileSystem: ProjectileSystem
    ) {
    }

    public update(
        deltaTimeMilliseconds: number
    ): void {
        const deltaSeconds =
            Math.min(
                Math.max(
                    deltaTimeMilliseconds /
                    1000,

                    0
                ),
                MAX_DELTA_SECONDS
            );

        if (deltaSeconds <= 0) {
            return;
        }

        this.resolveProjectileHits();

        this.resolveEnemyContactDamage();

        /*
         * 마지막 이동 구간의 충돌을 검사한 뒤
         * 사거리 만료 투사체를 제거합니다.
         */
        this.projectileSystem
            .removeExpiredProjectiles();
    }

    private resolveProjectileHits(): void {
        const killedEnemies = new Map<string, string>();

        /*
         * 반복 중 투사체가 삭제될 수 있으므로
         * 현재 항목을 배열로 복사합니다.
         */
        const projectiles =
            Array.from(
                this.state.projectiles.entries()
            );

        for (
            let projectileIndex = 0;
            projectileIndex <
            projectiles.length;
            projectileIndex++
        ) {
            const [
                projectileId,
                projectile
            ] = projectiles[projectileIndex];

            const runtime =
                this.projectileSystem
                    .getRuntimeProjectile(
                        projectileId);

            if (runtime === undefined) {
                continue;
            }

            for (
                const [enemyId, enemy]
                of this.state.enemies.entries()
            ) {
                if (
                    !enemy.alive ||
                    killedEnemies.has(enemyId)
                ) {
                    continue;
                }

                const enemyConfig =
                    this.enemySystem.getConfig(
                        enemy.typeId);

                if (enemyConfig === undefined) {
                    continue;
                }

                if (
                    !this.projectileSystem.canHitEnemy(
                        projectileId,
                        enemyId)
                ) {
                    continue;
                }

                const collisionRadius =
                    runtime.hitRadius +
                    enemyConfig.bodyRadius;

                if (!this.segmentIntersectsCircle(
                    runtime.previousX,
                    runtime.previousY,
                    projectile.x,
                    projectile.y,
                    enemy.x,
                    enemy.y,
                    collisionRadius
                )) {
                    continue;
                }

                enemy.hp =
                    Math.max(
                        0,
                        enemy.hp -
                        runtime.damage
                    );

                // this.projectileSystem
                //     .removeProjectile(
                //         projectileId);

                if (enemy.hp <= 0) {
                    enemy.hp = 0;
                    enemy.alive = false;

                    enemy.velocityX = 0;
                    enemy.velocityY = 0;

                    killedEnemies.set(
                        enemyId,
                        projectile.ownerSessionId
                    );
                }

                this.enemySystem.applyKnockback(
                    enemyId,
                    projectile.directionX,
                    projectile.directionY
                );

                const hitLimitReached =
                    this.projectileSystem.recordEnemyHit(
                        projectileId,
                        enemyId);

                if (hitLimitReached) {
                    this.projectileSystem.removeProjectile(
                        projectileId);

                    break;
                }
            }
        }

        for (const [enemyId, ownerSessionId]
            of killedEnemies) {
            this.state.enemies.delete(enemyId);
            this.nextEnemyContactTimes.delete(enemyId);
            this.state.game.killCount += 1;

            const owner =
                this.state.players.get(
                    ownerSessionId);

            if (owner !== undefined) {
                rewardMonsterKill(owner);
            }
        }
    }

    private resolveEnemyContactDamage(): void {
        const now = this.state.game.elapsedSeconds;

        for (const [sessionId, player]
            of this.state.players.entries()) {

            if (!player.alive) {
                continue;
            }

            const nextDamageAt =
                this.nextPlayerDamageTimes.get(sessionId) ?? 0;

            // 플레이어의 공통 피격 무적 시간
            if (now < nextDamageAt) {
                continue;
            }

            for (const [enemyId, enemy]
                of this.state.enemies.entries()) {

                if (!enemy.alive) {
                    continue;
                }

                const contact =
                    this.enemySystem.getConfig(enemy.typeId)
                        ?.contact;

                if (
                    contact == null ||
                    !Number.isFinite(contact.damage) ||
                    !Number.isFinite(contact.range) ||
                    !Number.isFinite(contact.intervalSeconds) ||
                    contact.damage <= 0 ||
                    contact.range <= 0 ||
                    contact.intervalSeconds <= 0
                ) {
                    continue;
                }

                const dx = player.x - enemy.x;
                const dy = player.y - enemy.y;

                if (
                    dx * dx + dy * dy >
                    contact.range * contact.range
                ) {
                    continue;
                }

                let targetTimes =
                    this.nextEnemyContactTimes.get(enemyId);

                const nextContactAt =
                    targetTimes?.get(sessionId) ?? 0;

                // 이 적이 이 플레이어에게 주는 접촉 피해 간격
                if (now < nextContactAt) {
                    continue;
                }

                player.hp =
                    Math.max(0, player.hp - contact.damage);

                this.nextPlayerDamageTimes.set(
                    sessionId,
                    now + PLAYER_HURT_INVULNERABILITY_SECONDS
                );

                if (targetTimes === undefined) {
                    targetTimes = new Map<string, number>();

                    this.nextEnemyContactTimes.set(
                        enemyId,
                        targetTimes
                    );
                }

                targetTimes.set(
                    sessionId,
                    now + contact.intervalSeconds
                );

                if (player.hp <= 0) {
                    player.hp = 0;
                    player.alive = false;
                    player.velocityX = 0;
                    player.velocityY = 0;
                }

                // 한 번 피해를 받았으므로 이번 플레이어 검사는 종료
                break;
            }
        }
    }

    private segmentIntersectsCircle(
        startX: number,
        startY: number,

        endX: number,
        endY: number,

        circleX: number,
        circleY: number,

        radius: number
    ): boolean {
        const segmentX =
            endX - startX;

        const segmentY =
            endY - startY;

        const segmentLengthSquared =
            segmentX * segmentX +
            segmentY * segmentY;

        let interpolation = 0;

        if (
            segmentLengthSquared >
            0.000001
        ) {
            const toCircleX =
                circleX - startX;

            const toCircleY =
                circleY - startY;

            interpolation =
                (
                    toCircleX *
                    segmentX +
                    toCircleY *
                    segmentY
                ) /
                segmentLengthSquared;

            interpolation =
                Math.max(
                    0,
                    Math.min(
                        1,
                        interpolation
                    )
                );
        }

        const closestX =
            startX +
            segmentX *
            interpolation;

        const closestY =
            startY +
            segmentY *
            interpolation;

        const differenceX =
            circleX - closestX;

        const differenceY =
            circleY - closestY;

        const distanceSquared =
            differenceX * differenceX +
            differenceY * differenceY;

        return (
            distanceSquared <=
            radius * radius
        );
    }

    public removePlayer(sessionId: string): void {
        this.nextPlayerDamageTimes.delete(sessionId);

        for (const [enemyId, targetTimes]
            of this.nextEnemyContactTimes) {

            targetTimes.delete(sessionId);

            if (targetTimes.size === 0) {
                this.nextEnemyContactTimes.delete(enemyId);
            }
        }
    }
}