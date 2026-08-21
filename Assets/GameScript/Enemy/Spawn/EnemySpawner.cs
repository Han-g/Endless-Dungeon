using UnityEngine;

[System.Serializable]
public sealed class EnemySpawnEntry
{
    public EnemyDefinition definition;

    [Min(1)]
    public int weight = 1;
}

[System.Serializable]
public sealed class EnemySpawnPhase
{
    [Min(0f)]
    public float startTime;

    [Min(0.05f)]
    public float spawnInterval = 1f;

    [Min(1)]
    public int batchSize = 1;

    [Min(1)]
    public int maxAlive = 50;

    public EnemySpawnEntry[] enemies;
}

public class EnemySpawner : MonoBehaviour
{
    [Header("References")]
    [SerializeField] private Camera mainCamera;
    [SerializeField] private Transform player;
    [SerializeField] private Transform enemyContainer;
    [SerializeField] private EnemyAgent enemyPrefab;
    [SerializeField] private EnemySimulation simulation;
    [SerializeField] private FlowField2D flowField;
    [SerializeField] private LayerMask worldCollisionMask;

    [Header("Spawn Ring")]
    [SerializeField, Min(0f)]
    private float cameraMargin = 1.5f;

    [SerializeField, Min(0.1f)]
    private float ringThickness = 3f;

    [SerializeField, Min(1)]
    private int placementAttempts = 16;

    [SerializeField, Min(0.05f)]
    private float collisionProbeRadius = 0.3f;

    [Header("Random")]
    [SerializeField]
    private int randomSeed = 12345;

    [Header("Phases")]
    [SerializeField]
    private EnemySpawnPhase[] phases;

    private System.Random random;
    private int nextEnemyId = 1;
    private float elapsedTime;
    private float spawnAccumulator;
    private EnemySpawnPhase currentPhase;

    private void Awake()
    {
        random = new System.Random(randomSeed);

        if (mainCamera == null)
        {
            mainCamera = Camera.main;
        }
    }

    private void Update()
    {
        if (!CanSpawn())
        {
            return;
        }

        elapsedTime += Time.deltaTime;

        EnemySpawnPhase selectedPhase =
            FindCurrentPhase(elapsedTime);

        if (selectedPhase == null)
        {
            return;
        }

        if (selectedPhase != currentPhase)
        {
            currentPhase = selectedPhase;
            spawnAccumulator = 0f;
        }

        if (simulation.ActiveCount >=
            currentPhase.maxAlive)
        {
            spawnAccumulator = 0f;
            return;
        }

        spawnAccumulator += Time.deltaTime;

        while (spawnAccumulator >=
               currentPhase.spawnInterval)
        {
            spawnAccumulator -=
                currentPhase.spawnInterval;

            for (int i = 0;
                 i < currentPhase.batchSize;
                 i++)
            {
                if (simulation.ActiveCount >=
                    currentPhase.maxAlive)
                {
                    break;
                }

                SpawnOne(currentPhase);
            }
        }
    }

    private bool CanSpawn()
    {
        return mainCamera != null &&
               player != null &&
               enemyContainer != null &&
               enemyPrefab != null &&
               simulation != null &&
               flowField != null &&
               flowField.IsInitialized;
    }

    private EnemySpawnPhase FindCurrentPhase(
        float time)
    {
        if (phases == null)
        {
            return null;
        }

        EnemySpawnPhase result = null;

        for (int i = 0; i < phases.Length; i++)
        {
            EnemySpawnPhase phase = phases[i];

            if (phase != null &&
                phase.startTime <= time &&
                (result == null ||
                 phase.startTime > result.startTime))
            {
                result = phase;
            }
        }

        return result;
    }

    private void SpawnOne(EnemySpawnPhase phase)
    {
        EnemyDefinition definition =
            PickDefinition(phase);

        if (definition == null)
        {
            return;
        }

        if (!TryFindSpawnPosition(
                out Vector2 spawnPosition))
        {
            return;
        }

        EnemyAgent agent = Instantiate(
            enemyPrefab,
            spawnPosition,
            Quaternion.identity,
            enemyContainer);

        agent.Initialize(
            nextEnemyId++,
            definition,
            simulation);
    }

    private EnemyDefinition PickDefinition(
        EnemySpawnPhase phase)
    {
        if (phase.enemies == null ||
            phase.enemies.Length == 0)
        {
            return null;
        }

        int totalWeight = 0;

        for (int i = 0;
             i < phase.enemies.Length;
             i++)
        {
            EnemySpawnEntry entry =
                phase.enemies[i];

            if (entry != null &&
                entry.definition != null)
            {
                totalWeight +=
                    Mathf.Max(1, entry.weight);
            }
        }

        if (totalWeight <= 0)
        {
            return null;
        }

        int roll = random.Next(totalWeight);

        for (int i = 0;
             i < phase.enemies.Length;
             i++)
        {
            EnemySpawnEntry entry =
                phase.enemies[i];

            if (entry == null ||
                entry.definition == null)
            {
                continue;
            }

            roll -= Mathf.Max(1, entry.weight);

            if (roll < 0)
            {
                return entry.definition;
            }
        }

        return null;
    }

    private bool TryFindSpawnPosition(
        out Vector2 result)
    {
        float halfHeight =
            mainCamera.orthographicSize;

        float halfWidth =
            halfHeight * mainCamera.aspect;

        float cameraRadius = Mathf.Sqrt(
            halfWidth * halfWidth +
            halfHeight * halfHeight);

        float minRadius =
            cameraRadius + cameraMargin;

        float maxRadius =
            minRadius + ringThickness;

        for (int attempt = 0;
             attempt < placementAttempts;
             attempt++)
        {
            float angle =
                (float)(random.NextDouble()
                        * Mathf.PI * 2f);

            Vector2 direction = new Vector2(
                Mathf.Cos(angle),
                Mathf.Sin(angle));

            float interpolation =
                (float)random.NextDouble();

            float distance = Mathf.Lerp(
                minRadius,
                maxRadius,
                interpolation);

            Vector2 candidate =
                (Vector2)player.position +
                direction * distance;

            if (!flowField.IsWalkable(candidate))
            {
                continue;
            }

            if (!flowField.IsReachable(candidate))
            {
                continue;
            }

            bool overlapsWall =
                Physics2D.OverlapCircle(
                    candidate,
                    collisionProbeRadius,
                    worldCollisionMask) != null;

            if (overlapsWall)
            {
                continue;
            }

            result = candidate;
            return true;
        }

        result = Vector2.zero;
        return false;
    }
}
