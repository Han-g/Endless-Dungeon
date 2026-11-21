import { Schema, type } from "@colyseus/schema";

// 캐릭터 선택 미리보기용 기본 능력치입니다.
export class CharacterStatsState extends Schema {
    @type("int32") maxHp: number = 0;
    @type("float32") moveSpeed: number = 0;
    @type("int32") damage: number = 0;
    @type("float32") attacksPerSecond: number = 0;
    @type("float32") projectileSpeed: number = 0;
    @type("float32") range: number = 0;
    @type("uint8") maxHitCount: number = 0;
    @type("uint8") projectileTypeId: number = 0;
}
