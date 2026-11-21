import {
    applyCharacterBaseStats, isCharacterId, type CharacterBaseStatsTarget
} from "../game/CharacterCatalog.js";

export interface ReadyPlayer extends CharacterBaseStatsTarget {
    isReady: boolean;
}

export interface ReadyPlayers {
    readonly size: number;

    get(id: string): ReadyPlayer | undefined;

    keys(): IterableIterator<string>;

    values(): IterableIterator<ReadyPlayer>;
}

export interface ReadyState {
    game: {
        phase: string;
    };

    hostSessionId: string;

    players: ReadyPlayers;
}

export type RoomFailure =
    | "NOT_WAITING"
    | "NOT_MEMBER"
    | "INVALID_READY"
    | "INVALID_CHARACTER"
    | "NOT_HOST"
    | "NOT_ALL_READY"
    | "NOT_LOADING";

export class ReadyRules {
    private readonly loaded = new Set<string>();

    public constructor(
        private readonly state: ReadyState
    ) { }

    public setReady(
        id: string,
        ready: unknown,
        characterId: unknown
    ): RoomFailure | null {
        if (this.state.game.phase !== "waiting") {
            return "NOT_WAITING";
        }

        const player = this.state.players.get(id);

        if (!player) {
            return "NOT_MEMBER";
        }

        if (typeof ready !== "boolean") {
            return "INVALID_READY";
        }

        if (ready && !this.validCharacter(characterId)) {
            return "INVALID_CHARACTER";
        }

        // 준비 완료일 때 캐릭터와 준비 상태를 함께 적용한다.
        if (ready) {
            applyCharacterBaseStats(player, characterId as number);
        }

        player.isReady = ready;

        return null;
    }

    public selectCharacter(
        id: string,
        characterId: unknown
    ): RoomFailure | null {
        if (this.state.game.phase !== "waiting") {
            return "NOT_WAITING";
        }

        const player = this.state.players.get(id);

        if (!player) {
            return "NOT_MEMBER";
        }

        if (!this.validCharacter(characterId)) {
            return "INVALID_CHARACTER";
        }

        applyCharacterBaseStats(player, characterId);

        // 캐릭터를 변경했다면 다시 준비해야 한다.
        player.isReady = false;

        return null;
    }

    public requestStart(id: string): RoomFailure | null {
        if (this.state.game.phase !== "waiting") {
            return "NOT_WAITING";
        }

        if (!this.state.players.get(id)) {
            return "NOT_MEMBER";
        }

        if (id !== this.state.hostSessionId) {
            return "NOT_HOST";
        }

        if (!this.allReady()) {
            return "NOT_ALL_READY";
        }

        // 검사와 상태 변경 사이에 await를 두지 않는다.
        // 같은 시작 요청이 중복으로 처리되는 것을 막는다.
        this.loaded.clear();

        this.state.game.phase = "loading";

        return null;
    }

    public reportLoaded(id: string): RoomFailure | null {
        if (!this.state.players.get(id)) {
            return "NOT_MEMBER";
        }

        // 이미 보고한 참가자의 중복 요청은 허용한다.
        if (
            this.state.game.phase === "playing" &&
            this.loaded.has(id)
        ) {
            return null;
        }

        if (this.state.game.phase !== "loading") {
            return "NOT_LOADING";
        }

        this.loaded.add(id);

        this.finishLoadingIfPossible();

        return null;
    }

    public memberLeft(id: string): void {
        this.loaded.delete(id);

        this.finishLoadingIfPossible();
    }

    public unloadedMembers(): string[] {
        return Array.from(this.state.players.keys())
            .filter(id => !this.loaded.has(id));
    }

    public allReady(): boolean {
        if (this.state.players.size === 0) {
            return false;
        }

        for (const player of this.state.players.values()) {
            if (
                !player.isReady ||
                !this.validCharacter(player.characterId)
            ) {
                return false;
            }
        }

        return true;
    }

    private finishLoadingIfPossible(): void {
        if (
            this.state.game.phase !== "loading" ||
            this.state.players.size === 0
        ) {
            return;
        }

        if (this.unloadedMembers().length === 0) {
            this.state.game.phase = "playing";
        }
    }

    private validCharacter(value: unknown): value is number {
        return isCharacterId(value);
    }
}