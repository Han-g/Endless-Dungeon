using System.Collections.Generic;
using UnityEngine;

public sealed class EnemySpatialHash
{
    private readonly float cellSize;

    private readonly Dictionary<
        Vector2Int,
        List<EnemyAgent>> buckets = new();

    public EnemySpatialHash(float cellSize)
    {
        this.cellSize = Mathf.Max(0.1f, cellSize);
    }

    public void Rebuild(
        IReadOnlyList<EnemyAgent> agents)
    {
        foreach (List<EnemyAgent> bucket in buckets.Values)
        {
            bucket.Clear();
        }

        for (int i = 0; i < agents.Count; i++)
        {
            EnemyAgent agent = agents[i];

            if (agent == null || !agent.isActiveAndEnabled)
            {
                continue;
            }

            Vector2Int cell =
                GetCell(agent.Position);

            if (!buckets.TryGetValue(
                    cell,
                    out List<EnemyAgent> bucket))
            {
                bucket = new List<EnemyAgent>();
                buckets.Add(cell, bucket);
            }

            bucket.Add(agent);
        }
    }

    public void CollectNearby(
        Vector2 position,
        float radius,
        List<EnemyAgent> results)
    {
        results.Clear();

        Vector2Int center = GetCell(position);

        int searchRange =
            Mathf.CeilToInt(radius / cellSize);

        for (int y = -searchRange;
             y <= searchRange;
             y++)
        {
            for (int x = -searchRange;
                 x <= searchRange;
                 x++)
            {
                Vector2Int cell =
                    center + new Vector2Int(x, y);

                if (!buckets.TryGetValue(
                        cell,
                        out List<EnemyAgent> bucket))
                {
                    continue;
                }

                results.AddRange(bucket);
            }
        }
    }

    private Vector2Int GetCell(Vector2 position)
    {
        return new Vector2Int(
            Mathf.FloorToInt(position.x / cellSize),
            Mathf.FloorToInt(position.y / cellSize));
    }
}
