using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Tilemaps;

public class FlowField2D : MonoBehaviour
{
    [Header("References")]
    [SerializeField] private Tilemap groundTilemap;
    [SerializeField] private Transform target;
    [SerializeField] private LayerMask worldCollisionMask;

    [Header("Settings")]
    [SerializeField, Min(0.05f)]
    private float refreshInterval = 0.15f;

    [SerializeField]
    private Vector2 collisionProbeSize =
        new Vector2(0.8f, 0.8f);

    private static readonly Vector3Int[] NeighborOffsets =
    {
        Vector3Int.right,
        Vector3Int.left,
        Vector3Int.up,
        Vector3Int.down
    };

    private BoundsInt mapBounds;
    private int width;
    private int height;

    private bool[] walkable;
    private int[] costs;
    private Vector2[] directions;

    private Vector3Int lastTargetCell;
    private float nextRefreshTime;
    private bool initialized;

    public bool IsInitialized => initialized;

    private void Start()
    {
        BuildWalkableGrid();

        if (initialized && target != null)
        {
            RebuildFlowField(
                groundTilemap.WorldToCell(target.position));
        }
    }

    private void Update()
    {
        if (!initialized || target == null)
        {
            return;
        }

        Vector3Int targetCell =
            groundTilemap.WorldToCell(target.position);

        if (targetCell == lastTargetCell)
        {
            return;
        }

        if (Time.time < nextRefreshTime)
        {
            return;
        }

        RebuildFlowField(targetCell);
    }

    private void BuildWalkableGrid()
    {
        if (groundTilemap == null)
        {
            Debug.LogError(
                "FlowField2D: Ground Tilemap이 연결되지 않았습니다.",
                this);

            return;
        }

        mapBounds = groundTilemap.cellBounds;
        width = mapBounds.size.x;
        height = mapBounds.size.y;

        int cellCount = width * height;

        walkable = new bool[cellCount];
        costs = new int[cellCount];
        directions = new Vector2[cellCount];

        int walkableCount = 0;

        for (int y = mapBounds.yMin;
             y < mapBounds.yMax;
             y++)
        {
            for (int x = mapBounds.xMin;
                 x < mapBounds.xMax;
                 x++)
            {
                Vector3Int cell = new Vector3Int(x, y, 0);
                int index = GetIndex(cell);

                bool hasGround =
                    groundTilemap.HasTile(cell);

                Vector3 center =
                    groundTilemap.GetCellCenterWorld(cell);

                bool hasCollision =
                    Physics2D.OverlapBox(
                        center,
                        collisionProbeSize,
                        0f,
                        worldCollisionMask) != null;

                walkable[index] =
                    hasGround && !hasCollision;

                if (walkable[index])
                {
                    walkableCount++;
                }
            }
        }

        initialized = true;

        Debug.Log(
            $"FlowField 생성: {width}x{height}, " +
            $"이동 가능 셀 {walkableCount}개",
            this);
    }

    private void RebuildFlowField(Vector3Int targetCell)
    {
        lastTargetCell = targetCell;
        nextRefreshTime =
            Time.time + refreshInterval;

        for (int i = 0; i < costs.Length; i++)
        {
            costs[i] = int.MaxValue;
            directions[i] = Vector2.zero;
        }

        if (!IsCellWalkable(targetCell))
        {
            Debug.LogWarning(
                $"FlowField2D: 플레이어 셀 {targetCell}이 " +
                "이동 불가능 셀입니다.",
                this);

            return;
        }

        Queue<Vector3Int> queue =
            new Queue<Vector3Int>();

        costs[GetIndex(targetCell)] = 0;
        queue.Enqueue(targetCell);

        while (queue.Count > 0)
        {
            Vector3Int current = queue.Dequeue();
            int currentCost = costs[GetIndex(current)];

            foreach (Vector3Int offset in NeighborOffsets)
            {
                Vector3Int neighbor = current + offset;

                if (!IsCellWalkable(neighbor))
                {
                    continue;
                }

                int neighborIndex = GetIndex(neighbor);

                if (costs[neighborIndex] != int.MaxValue)
                {
                    continue;
                }

                costs[neighborIndex] =
                    currentCost + 1;

                queue.Enqueue(neighbor);
            }
        }

        BuildDirections();
    }

    private void BuildDirections()
    {
        for (int y = mapBounds.yMin;
             y < mapBounds.yMax;
             y++)
        {
            for (int x = mapBounds.xMin;
                 x < mapBounds.xMax;
                 x++)
            {
                Vector3Int current =
                    new Vector3Int(x, y, 0);

                int currentIndex = GetIndex(current);

                if (!walkable[currentIndex] ||
                    costs[currentIndex] == int.MaxValue)
                {
                    continue;
                }

                int bestCost = costs[currentIndex];
                Vector3Int bestCell = current;

                foreach (Vector3Int offset in NeighborOffsets)
                {
                    Vector3Int neighbor = current + offset;

                    if (!IsInside(neighbor))
                    {
                        continue;
                    }

                    int neighborCost =
                        costs[GetIndex(neighbor)];

                    if (neighborCost < bestCost)
                    {
                        bestCost = neighborCost;
                        bestCell = neighbor;
                    }
                }

                if (bestCell == current)
                {
                    directions[currentIndex] =
                        Vector2.zero;

                    continue;
                }

                Vector2 currentWorld =
                    groundTilemap.GetCellCenterWorld(current);

                Vector2 bestWorld =
                    groundTilemap.GetCellCenterWorld(bestCell);

                directions[currentIndex] =
                    (bestWorld - currentWorld).normalized;
            }
        }
    }

    public Vector2 GetDirection(Vector2 worldPosition)
    {
        if (!initialized)
        {
            return Vector2.zero;
        }

        Vector3Int cell =
            groundTilemap.WorldToCell(worldPosition);

        if (!IsInside(cell))
        {
            return Vector2.zero;
        }

        return directions[GetIndex(cell)];
    }

    public bool IsWalkable(Vector2 worldPosition)
    {
        if (!initialized)
        {
            return false;
        }

        Vector3Int cell =
            groundTilemap.WorldToCell(worldPosition);

        return IsCellWalkable(cell);
    }

    public bool IsReachable(Vector2 worldPosition)
    {
        if (!initialized)
        {
            return false;
        }

        Vector3Int cell =
            groundTilemap.WorldToCell(worldPosition);

        if (!IsInside(cell))
        {
            return false;
        }

        return costs[GetIndex(cell)] != int.MaxValue;
    }

    private bool IsCellWalkable(Vector3Int cell)
    {
        return IsInside(cell) &&
               walkable[GetIndex(cell)];
    }

    private bool IsInside(Vector3Int cell)
    {
        return cell.x >= mapBounds.xMin &&
               cell.x < mapBounds.xMax &&
               cell.y >= mapBounds.yMin &&
               cell.y < mapBounds.yMax;
    }

    private int GetIndex(Vector3Int cell)
    {
        int localX = cell.x - mapBounds.xMin;
        int localY = cell.y - mapBounds.yMin;

        return localX + localY * width;
    }
}
