import { Schema, type } from "@colyseus/schema";

export class GameState extends Schema {
    @type("string") phase: string = "waiting";
    @type("float32") elapsedSeconds: number = 0;
    @type("uint32") killCount: number = 0;
    @type("int32") seed: number = 0;
}