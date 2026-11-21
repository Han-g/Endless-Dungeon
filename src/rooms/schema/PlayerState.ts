import { Schema, type } from "@colyseus/schema";
import { getCharacterDefinition } from "../../game/CharacterCatalog.js";

import { nextLevelExperience } from "../../game/CharacterGrowth.js";

const DEFAULT_CHARACTER = getCharacterDefinition(1);

export class PlayerState extends Schema {
    @type("string") name: string = "";

    @type("uint8") characterId: number = 1;

    @type("uint8") level: number = 1;

    @type("uint32") killCount: number = 0;

    @type("float32") x: number = 0;
    @type("float32") y: number = 0;

    @type("float32") velocityX: number = 0;
    @type("float32") velocityY: number = 0;

    @type("int32") hp: number = DEFAULT_CHARACTER.maxHp;
    @type("int32") maxHp: number = DEFAULT_CHARACTER.maxHp;

    @type("boolean") alive: boolean = true;

    // 클라이언트 예측을 나중에 추가할 때 사용
    @type("uint32") lastProcessedInput: number = 0;

    @type("boolean") isReady: boolean = false;

    @type("float32") moveSpeed: number = DEFAULT_CHARACTER.moveSpeed;

    @type("uint32") experience: number = 0;
    @type("uint32") nextLevelExperience: number = nextLevelExperience(1);
    @type("int32") damage: number = DEFAULT_CHARACTER.weapon.damage;
    @type("float32") attacksPerSecond: number = DEFAULT_CHARACTER.weapon.attacksPerSecond;
    @type("float32") projectileSpeed: number = DEFAULT_CHARACTER.weapon.speed;
    @type("float32") projectileRange: number = DEFAULT_CHARACTER.weapon.range;
}