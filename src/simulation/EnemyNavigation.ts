import { MapCollision } from "./MapCollision.js";

export interface NavigationPoint {
    x: number;
    y: number;
}

interface NavigationGrid {
    minX: number;
    minY: number;
    columns: number;
    rows: number;
    walkable: Uint8Array;
    edges: Uint8Array;
    scores: Float64Array;
    parents: Int32Array;
    closed: Uint8Array;
}

interface OpenNode {
    id: number;
    cost: number;
    priority: number;
}

// f = g + h 가 가장 작은 노드를 먼저 꺼내는 최소 힙입니다.
class MinHeap {
    private readonly items: OpenNode[] = [];

    public get size(): number {
        return this.items.length;
    }

    public push(node: OpenNode): void {
        let index = this.items.length;
        this.items.push(node);
        while (index > 0) {
            const parent = (index - 1) >> 1;
            if (this.items[parent].priority <= node.priority) break;
            this.items[index] = this.items[parent];
            index = parent;
        }
        this.items[index] = node;
    }

    public pop(): OpenNode {
        const first = this.items[0];
        const last = this.items.pop()!;
        if (this.items.length === 0) return first;
        let index = 0;
        while (true) {
            const left = index * 2 + 1;
            if (left >= this.items.length) break;
            const right = left + 1;
            const child = right < this.items.length
                && this.items[right].priority < this.items[left].priority
                ? right : left;
            if (last.priority <= this.items[child].priority) break;
            this.items[index] = this.items[child];
            index = child;
        }
        this.items[index] = last;
        return first;
    }
}

const DIRECTIONS: readonly (readonly [number, number])[] = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [1, -1], [-1, 1], [-1, -1]
];

export class EnemyNavigation {
    // 몸체 반지름별로 한 번 생성하여 공유합니다. 경로는 적마다 별도입니다.
    private readonly grids = new Map<number, NavigationGrid>();

    public constructor(
        private readonly collision: MapCollision,
        private readonly cellSize = 0.5,
        private readonly maxExpandedNodes = 8000
    ) {
        if (!Number.isFinite(cellSize) || cellSize <= 0
            || !Number.isInteger(maxExpandedNodes) || maxExpandedNodes < 1) {
            throw new Error("Invalid enemy navigation settings.");
        }
    }

    public prepare(radius: number): void {
        this.getGrid(radius);
    }

    public findPath(
        start: NavigationPoint,
        target: NavigationPoint,
        radius: number,
        attackRadius: number
    ): NavigationPoint[] {
        if (![start.x, start.y, target.x, target.y, radius, attackRadius]
            .every(Number.isFinite) || radius <= 0 || attackRadius <= 0) {
            return [];
        }

        const grid = this.getGrid(radius);
        grid.scores.fill(Infinity);
        grid.parents.fill(-1);
        grid.closed.fill(0);
        const open = new MinHeap();

        // 목표는 플레이어 중심의 한 셀이 아니라,
        // 벽에 가리지 않은 공격 사거리 안의 셀들입니다.
        const heuristic = (point: NavigationPoint): number =>
            Math.max(0, Math.hypot(point.x - target.x, point.y - target.y)
                - attackRadius);

        const startColumn = Math.floor((start.x - grid.minX) / this.cellSize);
        const startRow = Math.floor((start.y - grid.minY) / this.cellSize);

        // 원 위에 스폰된 실제 좌표와 격자 중심을 안전한 선분으로 연결합니다.
        for (let row = startRow - 1; row <= startRow + 1; row++) {
            for (let column = startColumn - 1; column <= startColumn + 1; column++) {
                if (!this.isWalkable(grid, column, row)) continue;
                const id = row * grid.columns + column;
                const point = this.toPoint(grid, id);
                if (!this.collision.canMoveCircle(
                    start.x, start.y, point.x, point.y, radius)) continue;
                const cost = Math.hypot(point.x - start.x, point.y - start.y);
                grid.scores[id] = cost;
                open.push({ id, cost, priority: cost + heuristic(point) });
            }
        }

        let expanded = 0;
        while (open.size > 0 && expanded < this.maxExpandedNodes) {
            const current = open.pop();
            if (grid.closed[current.id]
                || current.cost > grid.scores[current.id]) continue;
            grid.closed[current.id] = 1;
            expanded++;

            const point = this.toPoint(grid, current.id);
            if (Math.hypot(point.x - target.x, point.y - target.y)
                <= attackRadius
                && this.collision.canMoveCircle(
                    point.x, point.y, target.x, target.y, 0.001)) {
                return this.buildPath(grid, current.id, start, radius);
            }

            const column = current.id % grid.columns;
            const row = Math.floor(current.id / grid.columns);
            for (let direction = 0; direction < DIRECTIONS.length; direction++) {
                const [dx, dy] = DIRECTIONS[direction];
                const nextColumn = column + dx;
                const nextRow = row + dy;
                if (!this.isWalkable(grid, nextColumn, nextRow)) continue;

                // 대각선 양옆 셀도 비어 있어야 합니다. 모서리 끼워 통과 금지.
                if (dx !== 0 && dy !== 0
                    && (!this.isWalkable(grid, column + dx, row)
                        || !this.isWalkable(grid, column, row + dy))) continue;

                const nextId = nextRow * grid.columns + nextColumn;
                if (grid.closed[nextId]) continue;

                // 두 셀의 중심이 비어 있어도 사이에 얇은 벽이 있을 수 있습니다.
                // 정적인 맵이므로 검사한 연결은 캐시합니다.
                const edgeId = current.id * DIRECTIONS.length + direction;
                const nextPoint = this.toPoint(grid, nextId);
                if (grid.edges[edgeId] === 0) {
                    grid.edges[edgeId] = this.collision.canMoveCircle(
                        point.x, point.y, nextPoint.x, nextPoint.y, radius)
                        ? 1 : 2;
                }
                if (grid.edges[edgeId] !== 1) continue;

                const cost = current.cost
                    + this.cellSize * (dx !== 0 && dy !== 0 ? Math.SQRT2 : 1);
                if (cost >= grid.scores[nextId]) continue;
                grid.scores[nextId] = cost;
                grid.parents[nextId] = current.id;
                open.push({
                    id: nextId, cost,
                    priority: cost + heuristic(nextPoint)
                });
            }
        }

        // 탐색 한도 초과 / 연결된 길 없음. 벽을 무시하는 직선 추적은 하지 않습니다.
        return [];
    }

    private getGrid(radius: number): NavigationGrid {
        if (!Number.isFinite(radius) || radius <= 0) {
            throw new Error("Enemy navigation radius must be positive.");
        }
        const cached = this.grids.get(radius);
        if (cached) return cached;

        const bounds = this.collision.getNavigationBounds();
        const columns = Math.ceil((bounds.maxX - bounds.minX) / this.cellSize);
        const rows = Math.ceil((bounds.maxY - bounds.minY) / this.cellSize);
        const count = columns * rows;
        const grid: NavigationGrid = {
            minX: bounds.minX, minY: bounds.minY, columns, rows,
            walkable: new Uint8Array(count),
            edges: new Uint8Array(count * DIRECTIONS.length),
            scores: new Float64Array(count),
            parents: new Int32Array(count),
            closed: new Uint8Array(count)
        };
        // 먼저 맵 가장자리에서 몸체가 밖으로 나가는 셀을 제외합니다.
        for (let id = 0; id < count; id++) {
            const point = this.toPoint(grid, id);
            grid.walkable[id] = point.x - radius >= bounds.minX
                && point.x + radius <= bounds.maxX
                && point.y - radius >= bounds.minY
                && point.y + radius <= bounds.maxY ? 1 : 0;
        }

        // 셀마다 모든 벽을 검사하지 않고, 각 벽 주변 셀만 막습니다.
        for (const wall of this.collision.getNavigationObstacles()) {
            const minColumn = Math.max(0, Math.ceil(
                (wall.minX - radius - grid.minX) / this.cellSize - 0.5));
            const maxColumn = Math.min(columns - 1, Math.floor(
                (wall.maxX + radius - grid.minX) / this.cellSize - 0.5));
            const minRow = Math.max(0, Math.ceil(
                (wall.minY - radius - grid.minY) / this.cellSize - 0.5));
            const maxRow = Math.min(rows - 1, Math.floor(
                (wall.maxY + radius - grid.minY) / this.cellSize - 0.5));
            for (let row = minRow; row <= maxRow; row++) {
                for (let column = minColumn; column <= maxColumn; column++) {
                    const id = row * columns + column;
                    if (!grid.walkable[id]) continue;
                    const point = this.toPoint(grid, id);
                    const dx = Math.max(wall.minX - point.x, 0, point.x - wall.maxX);
                    const dy = Math.max(wall.minY - point.y, 0, point.y - wall.maxY);
                    if (dx * dx + dy * dy <= radius * radius) {
                        grid.walkable[id] = 0;
                    }
                }
            }
        }
        this.grids.set(radius, grid);
        return grid;
    }

    private isWalkable(grid: NavigationGrid, column: number, row: number): boolean {
        return column >= 0 && column < grid.columns
            && row >= 0 && row < grid.rows
            && grid.walkable[row * grid.columns + column] === 1;
    }

    private toPoint(grid: NavigationGrid, id: number): NavigationPoint {
        return {
            x: grid.minX + (id % grid.columns + 0.5) * this.cellSize,
            y: grid.minY + (Math.floor(id / grid.columns) + 0.5) * this.cellSize
        };
    }

    private buildPath(
        grid: NavigationGrid, endId: number,
        start: NavigationPoint, radius: number
    ): NavigationPoint[] {
        const path: NavigationPoint[] = [];
        for (let id = endId; id !== -1; id = grid.parents[id]) {
            path.push(this.toPoint(grid, id));
        }
        path.reverse();

        // 충돌 없는 직선 구간을 합쳐 격자마다 꺾이는 움직임을 줄입니다.
        const smoothed: NavigationPoint[] = [];
        let anchor = start;
        for (let i = 1; i < path.length; i++) {
            if (!this.collision.canMoveCircle(
                anchor.x, anchor.y, path[i].x, path[i].y, radius)) {
                anchor = path[i - 1];
                smoothed.push(anchor);
            }
        }
        smoothed.push(path[path.length - 1]);
        return smoothed;
    }
}
