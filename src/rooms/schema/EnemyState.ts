import { Schema, type } from "@colyseus/schema";

export class EnemyState extends Schema {
    @type("uint8") typeId: number = 1;

    @type("float32") x: number = 0;
    @type("float32") y: number = 0;

    @type("float32") velocityX: number = 0;
    @type("float32") velocityY: number = 0;

    @type("int32") hp: number = 1;
    @type("int32") maxHp: number = 1;

    @type("boolean") alive: boolean = true;
    @type("boolean") slowed: boolean = false;
    @type("boolean") marked: boolean = false;
}
