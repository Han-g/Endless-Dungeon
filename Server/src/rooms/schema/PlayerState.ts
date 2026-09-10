import { Schema, type } from "@colyseus/schema";

export class PlayerState extends Schema {
    @type("string") name: string = "";

    @type("uint8") characterId: number = 1;

    @type("uint8") level: number = 1;

    @type("uint32") killCount: number = 0;

    @type("float32") x: number = 0;
    @type("float32") y: number = 0;

    @type("float32") velocityX: number = 0;
    @type("float32") velocityY: number = 0;

    @type("int32") hp: number = 100;
    @type("int32") maxHp: number = 100;

    @type("boolean") alive: boolean = true;

    // 클라이언트 예측을 나중에 추가할 때 사용
    @type("uint32") lastProcessedInput: number = 0;
}