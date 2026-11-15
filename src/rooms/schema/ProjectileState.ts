import {
    Schema,
    type
} from "@colyseus/schema";

export class ProjectileState extends Schema {
    @type("string")
    ownerSessionId: string = "";

    @type("uint8")
    projectileTypeId: number = 1;

    @type("float32")
    x: number = 0;

    @type("float32")
    y: number = 0;

    @type("float32")
    directionX: number = 1;

    @type("float32")
    directionY: number = 0;
}