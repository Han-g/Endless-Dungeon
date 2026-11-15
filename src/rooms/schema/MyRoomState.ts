import {
    Schema,
    MapSchema,
    type
} from "@colyseus/schema";

import { GameState } from "./GameState.js";
import { PlayerState } from "./PlayerState.js";
import { EnemyState } from "./EnemyState.js";
import { ProjectileState } from "./ProjectileState.js";

export class MyRoomState extends Schema {
    @type("string")
    mapId: string = "dungeon_01";

    @type("string")
    hostSessionId: string = "";

    @type("uint8")
    maxPlayers: number = 4;

    @type(GameState)
    game: GameState = new GameState();

    @type({ map: PlayerState })
    players: MapSchema<PlayerState> =
        new MapSchema<PlayerState>();

    @type({ map: EnemyState })
    enemies: MapSchema<EnemyState> =
        new MapSchema<EnemyState>();

    @type({ map: ProjectileState })
    projectiles: MapSchema<ProjectileState> =
        new MapSchema<ProjectileState>();
}