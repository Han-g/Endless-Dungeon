import { readFileSync } from "node:fs";

interface Rect {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}

interface TiledObject {
    id: number;
    x: number;
    y: number;
    width: number;
    height: number;
    rotation?: number;
    visible?: boolean;
    [key: string]: unknown;
}

interface TiledLayer {
    name: string;
    type: string;
    x?: number;
    y?: number;
    offsetx?: number;
    offsety?: number;
    visible?: boolean;
    objects?: TiledObject[];
}

interface TiledMap {
    orientation: string;
    infinite: boolean;
    width: number;
    height: number;
    tilewidth: number;
    tileheight: number;
    layers: TiledLayer[];
}

// Unity Map1 루트의 Position과 일치해야 합니다.
// Map1의 Rotation은 0, Scale은 1을 사용합니다.
const MAP_X = -75;
const MAP_Y = 80;
const PPU = 16;

// 현재 Player CapsuleCollider2D를 감싸는 사각형입니다.
const HALF_WIDTH = 0.55 / 2;
const HALF_HEIGHT = 0.75 / 2;
const OFFSET_X = 0;
const OFFSET_Y = 0.38;

export { HALF_WIDTH as PLAYER_BODY_HALF_WIDTH, OFFSET_Y as PLAYER_BODY_CENTER_Y };

// 부동소수점 오차로 벽 안에 걸리지 않도록 작은 간격을 둡니다.
const SKIN = 0.001;

export class MapCollision {
    private readonly walls: Rect[];
    private readonly bounds: Rect;
    private navigationWallBuckets?: Map<string, Rect[]>;

    public constructor() {
        const map = JSON.parse(
            readFileSync(
                new URL("../../data/Map1.json", import.meta.url),
                "utf8"
            )
        ) as TiledMap;

        if (
            map.orientation !== "orthogonal" ||
            map.infinite ||
            ![map.width, map.height, map.tilewidth, map.tileheight]
                .every(value => Number.isFinite(value) && value > 0)
        ) {
            throw new Error("Map1 must be a finite orthogonal map.");
        }

        const layer = map.layers.find(
            item => item.type === "objectgroup" &&
                item.name === "BlockedObject"
        );

        if (!layer?.objects?.length || layer.visible === false) {
            throw new Error("Visible BlockedObject layer is required.");
        }

        const offsetX = (layer.offsetx ?? 0) +
            (layer.x ?? 0) * map.tilewidth;

        const offsetY = (layer.offsety ?? 0) +
            (layer.y ?? 0) * map.tileheight;

        this.walls = layer.objects.map(object => {
            const unsupported = [
                "ellipse", "capsule", "point", "polygon",
                "polyline", "gid", "text", "template"
            ].some(key =>
                object[key] !== undefined && object[key] !== false
            );

            if (
                unsupported ||
                object.visible === false ||
                (object.rotation ?? 0) !== 0 ||
                ![object.x, object.y, object.width, object.height]
                    .every(Number.isFinite) ||
                object.width <= 0 ||
                object.height <= 0
            ) {
                throw new Error(
                    "Unsupported collision object: " + object.id
                );
            }

            const minX = MAP_X + (object.x + offsetX) / PPU;
            const maxY = MAP_Y - (object.y + offsetY) / PPU;

            return {
                minX,
                maxX: minX + object.width / PPU,
                maxY,
                minY: maxY - object.height / PPU
            };
        });

        this.bounds = {
            minX: MAP_X,
            maxX: MAP_X + map.width * map.tilewidth / PPU,
            maxY: MAP_Y,
            minY: MAP_Y - map.height * map.tileheight / PPU
        };

        console.log("[MapCollision] rectangles=" + this.walls.length);
    }

    // 서버 경로 탐색용 월드 경계. 원본 bounds는 외부에서 변경하지 않습니다.
    public getNavigationBounds(): Readonly<Rect> {
        return { ...this.bounds };
    }

    public getNavigationObstacles(): readonly Readonly<Rect>[] {
        return this.walls.map(wall => ({ ...wall }));
    }

    // 원형 적이 start -> end 전체 구간을 통과할 수 있는지 검사합니다.
    // 끝점만 검사하면 얇은 장애물을 한 틱에 통과할 수 있습니다.
    public canMoveCircle(
        startX: number, startY: number,
        endX: number, endY: number,
        radius: number
    ): boolean {
        if (![startX, startY, endX, endY, radius].every(Number.isFinite)
            || radius <= 0) {
            return false;
        }

        const minX = Math.min(startX, endX) - radius;
        const maxX = Math.max(startX, endX) + radius;
        const minY = Math.min(startY, endY) - radius;
        const maxY = Math.max(startY, endY) + radius;
        if (minX < this.bounds.minX || maxX > this.bounds.maxX
            || minY < this.bounds.minY || maxY > this.bounds.maxY) {
            return false;
        }

        const dx = endX - startX;
        const dy = endY - startY;
        const lengthSquared = dx * dx + dy * dy;
        const radiusSquared = radius * radius;

        for (const wall of this.getNavigationWallsNear(minX, minY, maxX, maxY)) {
            // 이동 구간에서 멀리 떨어진 벽은 상세 검사하지 않습니다.
            if (maxX < wall.minX || minX > wall.maxX
                || maxY < wall.minY || minY > wall.maxY) {
                continue;
            }

            // 이동 시작점/끝점의 원과 사각형.
            for (const [x, y] of [[startX, startY], [endX, endY]]) {
                const gapX = Math.max(wall.minX - x, 0, x - wall.maxX);
                const gapY = Math.max(wall.minY - y, 0, y - wall.maxY);
                if (gapX * gapX + gapY * gapY <= radiusSquared) {
                    return false;
                }
            }

            // 이동 선분이 사각형 내부를 통과하는지 검사합니다.
            let enter = 0;
            let leave = 1;
            for (const [origin, direction, low, high] of [
                [startX, dx, wall.minX, wall.maxX],
                [startY, dy, wall.minY, wall.maxY]
            ]) {
                if (Math.abs(direction) < 1e-12) {
                    if (origin < low || origin > high) {
                        enter = 1;
                        leave = 0;
                        break;
                    }
                    continue;
                }
                const a = (low - origin) / direction;
                const b = (high - origin) / direction;
                enter = Math.max(enter, Math.min(a, b));
                leave = Math.min(leave, Math.max(a, b));
            }
            if (enter <= leave) {
                return false;
            }

            // 벽 모서리와 선분 사이 거리: 원의 둥근 모서리까지 검사합니다.
            for (const x of [wall.minX, wall.maxX]) {
                for (const y of [wall.minY, wall.maxY]) {
                    const t = lengthSquared > 0
                        ? Math.max(0, Math.min(1,
                            ((x - startX) * dx + (y - startY) * dy)
                            / lengthSquared))
                        : 0;
                    const gapX = x - (startX + dx * t);
                    const gapY = y - (startY + dy * t);
                    if (gapX * gapX + gapY * gapY <= radiusSquared) {
                        return false;
                    }
                }
            }
        }
        return true;
    }

    // 4유닛 구역별로 벽을 묶습니다. 매 이동 검사마다 934개 전부를 순회하지 않습니다.
    private getNavigationWallsNear(
        minX: number, minY: number, maxX: number, maxY: number
    ): Set<Rect> {
        const bucketSize = 4;
        if (!this.navigationWallBuckets) {
            this.navigationWallBuckets = new Map<string, Rect[]>();
            for (const wall of this.walls) {
                for (let y = Math.floor(wall.minY / bucketSize);
                    y <= Math.floor(wall.maxY / bucketSize); y++) {
                    for (let x = Math.floor(wall.minX / bucketSize);
                        x <= Math.floor(wall.maxX / bucketSize); x++) {
                        const key = x + "," + y;
                        const bucket = this.navigationWallBuckets.get(key);
                        if (bucket) bucket.push(wall);
                        else this.navigationWallBuckets.set(key, [wall]);
                    }
                }
            }
        }
        const found = new Set<Rect>();
        for (let y = Math.floor(minY / bucketSize);
            y <= Math.floor(maxY / bucketSize); y++) {
            for (let x = Math.floor(minX / bucketSize);
                x <= Math.floor(maxX / bucketSize); x++) {
                const bucket = this.navigationWallBuckets.get(x + "," + y);
                if (bucket) for (const wall of bucket) found.add(wall);
            }
        }
        return found;
    }

    public canSpawnCircle(
        x: number,
        y: number,
        radius: number
    ): boolean {
        return this.canMoveCircle(
            x, y,
            x, y,
            radius
        );
    }

    // 이 거리보다 큰 원은 맵에 닿을 수 없습니다.
    public getMaxSearchRadius(x: number, y: number): number {
        const dx = Math.max(
            Math.abs(this.bounds.minX - x),
            Math.abs(this.bounds.maxX - x)
        );
        const dy = Math.max(
            Math.abs(this.bounds.minY - y),
            Math.abs(this.bounds.maxY - y)
        );

        return Math.hypot(dx, dy);
    }

    // 지정된 원 둘레의 빈 구간에서 무작위 위치를 선택합니다.
    public findSpawnOnRing(
        centreX: number,
        centreY: number,
        ringRadius: number,
        bodyRadius: number
    ): { x: number; y: number } | undefined {
        if (
            ![centreX, centreY, ringRadius, bodyRadius]
                .every(Number.isFinite) ||
            ringRadius <= 0 ||
            bodyRadius <= 0
        ) {
            return undefined;
        }

        const tau = Math.PI * 2;
        const epsilon = 1e-8;
        const angles = [0, tau];

        const addAngle = (angle: number): void => {
            const normalized = ((angle % tau) + tau) % tau;

            if (
                normalized > epsilon &&
                normalized < tau - epsilon
            ) {
                angles.push(normalized);
            }
        };

        const cutX = (x: number): void => {
            const t = (x - centreX) / ringRadius;
            if (t < -1 || t > 1) return;

            const angle = Math.acos(t);
            addAngle(angle);
            addAngle(-angle);
        };

        const cutY = (y: number): void => {
            const t = (y - centreY) / ringRadius;
            if (t < -1 || t > 1) return;

            const angle = Math.asin(t);
            addAngle(angle);
            addAngle(Math.PI - angle);
        };

        // 적이 원형이므로 사각형 장애물의 모서리도
        // 적의 몸 반지름을 고려하여 계산합니다.
        const cutCorner = (x: number, y: number): void => {
            const dx = x - centreX;
            const dy = y - centreY;
            const distance = Math.hypot(dx, dy);

            if (distance < epsilon) return;

            const cosine = (
                ringRadius * ringRadius +
                distance * distance -
                bodyRadius * bodyRadius
            ) / (2 * ringRadius * distance);

            if (cosine < -1 || cosine > 1) return;

            const direction = Math.atan2(dy, dx);
            const offset = Math.acos(cosine);

            addAngle(direction - offset);
            addAngle(direction + offset);
        };

        // 맵 바깥도 생성 불가능한 영역으로 처리합니다.
        cutX(this.bounds.minX + bodyRadius);
        cutX(this.bounds.maxX - bodyRadius);
        cutY(this.bounds.minY + bodyRadius);
        cutY(this.bounds.maxY - bodyRadius);

        for (const wall of this.walls) {
            const minX = wall.minX - bodyRadius;
            const maxX = wall.maxX + bodyRadius;
            const minY = wall.minY - bodyRadius;
            const maxY = wall.maxY + bodyRadius;

            const nearX = Math.max(
                minX - centreX, 0, centreX - maxX
            );
            const nearY = Math.max(
                minY - centreY, 0, centreY - maxY
            );

            const farX = Math.max(
                Math.abs(minX - centreX),
                Math.abs(maxX - centreX)
            );
            const farY = Math.max(
                Math.abs(minY - centreY),
                Math.abs(maxY - centreY)
            );

            // 원 둘레와 경계가 만날 가능성이 없는 장애물은 제외합니다.
            if (
                nearX * nearX + nearY * nearY >
                ringRadius * ringRadius ||
                farX * farX + farY * farY <
                ringRadius * ringRadius
            ) {
                continue;
            }

            cutX(minX);
            cutX(maxX);
            cutY(minY);
            cutY(maxY);

            for (const x of [wall.minX, wall.maxX]) {
                for (const y of [wall.minY, wall.maxY]) {
                    cutCorner(x, y);
                }
            }
        }

        const sorted = angles.sort((a, b) => a - b);

        const cuts = sorted.filter(
            (angle, index) =>
                index === 0 ||
                angle - sorted[index - 1] > epsilon
        );

        const pointAt = (angle: number) => ({
            x: centreX + Math.cos(angle) * ringRadius,
            y: centreY + Math.sin(angle) * ringRadius
        });

        const free: { from: number; to: number }[] = [];
        let totalLength = 0;

        // 경계 사이에서는 충돌 여부가 같으므로 중간점을 검사합니다.
        for (let i = 0; i + 1 < cuts.length; i++) {
            const from = cuts[i];
            const to = cuts[i + 1];
            const midpoint = pointAt((from + to) / 2);

            if (
                this.canSpawnCircle(
                    midpoint.x,
                    midpoint.y,
                    bodyRadius
                )
            ) {
                free.push({ from, to });
                totalLength += to - from;
            }
        }

        if (free.length === 0) {
            return undefined;
        }

        // 긴 구간일수록 그 길이에 비례해 선택되도록 합니다.
        let ticket = Math.random() * totalLength;
        let chosen = free[free.length - 1];

        for (const interval of free) {
            const length = interval.to - interval.from;

            if (ticket < length) {
                chosen = interval;
                break;
            }

            ticket -= length;
        }

        const fraction = Math.max(
            1e-6,
            Math.min(1 - 1e-6, Math.random())
        );

        const candidate = pointAt(
            chosen.from +
            (chosen.to - chosen.from) * fraction
        );

        if (
            this.canSpawnCircle(
                candidate.x,
                candidate.y,
                bodyRadius
            )
        ) {
            return candidate;
        }

        // 경계 근처 부동소수점 오차가 있으면 검증된 중간점을 사용합니다.
        const midpoint = pointAt(
            (chosen.from + chosen.to) / 2
        );

        return this.canSpawnCircle(
            midpoint.x,
            midpoint.y,
            bodyRadius
        )
            ? midpoint
            : undefined;
    }

    public canStand(x: number, y: number): boolean {
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
            return false;
        }

        const cx = x + OFFSET_X;
        const cy = y + OFFSET_Y;

        if (
            cx - HALF_WIDTH < this.bounds.minX ||
            cx + HALF_WIDTH > this.bounds.maxX ||
            cy - HALF_HEIGHT < this.bounds.minY ||
            cy + HALF_HEIGHT > this.bounds.maxY
        ) {
            return false;
        }

        return !this.walls.some(wall =>
            cx + HALF_WIDTH > wall.minX &&
            cx - HALF_WIDTH < wall.maxX &&
            cy + HALF_HEIGHT > wall.minY &&
            cy - HALF_HEIGHT < wall.maxY
        );
    }

    public move(
        x: number,
        y: number,
        dx: number,
        dy: number
    ): { x: number; y: number } {
        if (
            !Number.isFinite(dx) ||
            !Number.isFinite(dy) ||
            !this.canStand(x, y)
        ) {
            return { x, y };
        }

        let cx = x + OFFSET_X;
        let cy = y + OFFSET_Y;

        // 1. X축 이동 경로를 검사합니다.
        let nextX = Math.max(
            this.bounds.minX + HALF_WIDTH + SKIN,
            Math.min(cx + dx, this.bounds.maxX - HALF_WIDTH - SKIN)
        );

        for (const wall of this.walls) {
            if (
                cy + HALF_HEIGHT <= wall.minY ||
                cy - HALF_HEIGHT >= wall.maxY
            ) {
                continue;
            }

            if (dx > 0 && cx + HALF_WIDTH <= wall.minX) {
                nextX = Math.min(
                    nextX,
                    wall.minX - HALF_WIDTH - SKIN
                );
            } else if (dx < 0 && cx - HALF_WIDTH >= wall.maxX) {
                nextX = Math.max(
                    nextX,
                    wall.maxX + HALF_WIDTH + SKIN
                );
            }
        }

        cx = nextX;

        // 2. 확정된 X 위치에서 Y축 이동 경로를 검사합니다.
        let nextY = Math.max(
            this.bounds.minY + HALF_HEIGHT + SKIN,
            Math.min(cy + dy, this.bounds.maxY - HALF_HEIGHT - SKIN)
        );

        for (const wall of this.walls) {
            if (
                cx + HALF_WIDTH <= wall.minX ||
                cx - HALF_WIDTH >= wall.maxX
            ) {
                continue;
            }

            if (dy > 0 && cy + HALF_HEIGHT <= wall.minY) {
                nextY = Math.min(
                    nextY,
                    wall.minY - HALF_HEIGHT - SKIN
                );
            } else if (dy < 0 && cy - HALF_HEIGHT >= wall.maxY) {
                nextY = Math.max(
                    nextY,
                    wall.maxY + HALF_HEIGHT + SKIN
                );
            }
        }

        cy = nextY;

        // 충돌체 중심에서 Player 루트 좌표로 되돌립니다.
        return {
            x: cx - OFFSET_X,
            y: cy - OFFSET_Y
        };
    }
}