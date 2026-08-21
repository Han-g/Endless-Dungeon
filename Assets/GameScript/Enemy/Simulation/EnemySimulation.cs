using System.Collections.Generic;
using UnityEngine;

public class EnemySimulation : MonoBehaviour
{
    [Header("References")]
    [SerializeField] private Transform player;
    [SerializeField] private FlowField2D flowField;

    [Header("Spatial Hash")]
    [SerializeField, Min(0.1f)]
    private float spatialCellSize = 1.5f;

    [Header("Steering Weights")]
    [SerializeField] private float flowWeight = 1f;
    [SerializeField] private float separationWeight = 0.7f;
    [SerializeField] private float formationWeight = 0.25f;
    [SerializeField] private float variationWeight = 0.1f;

    [Header("Formation")]
    [SerializeField, Min(0.1f)]
    private float formationRange = 4f;

    [Header("Variation")]
    [SerializeField, Min(0f)]
    private float variationSpeed = 0.8f;

    private readonly List<EnemyAgent> agents = new();
    private readonly List<EnemyAgent> nearbyBuffer = new();

    private EnemySpatialHash spatialHash;
    private float simulationTime;

    public int ActiveCount => agents.Count;
    [SerializeField] private PlayerHP playerHealth;
    [SerializeField] private Collider2D playerCollider;

    private void Awake()
    {
        spatialHash =
            new EnemySpatialHash(spatialCellSize);

        if (player != null)
        {
            if (playerHealth == null)
            {
                playerHealth =
                    player.GetComponent<PlayerHP>();
            }

            if (playerCollider == null)
            {
                playerCollider =
                    player.GetComponent<Collider2D>();
            }
        }
    }

    public void Register(EnemyAgent agent)
    {
        if (agent != null && !agents.Contains(agent))
        {
            agents.Add(agent);
        }
    }

    public void Unregister(EnemyAgent agent)
    {
        agents.Remove(agent);
    }

    private void FixedUpdate()
    {
        if (player == null || flowField == null)
        {
            return;
        }

        simulationTime += Time.fixedDeltaTime;

        spatialHash.Rebuild(agents);

        for (int i = 0; i < agents.Count; i++)
        {
            EnemyAgent agent = agents[i];

            if (agent == null ||
                !agent.isActiveAndEnabled ||
                agent.Definition == null)
            {
                continue;
            }

            SimulateAgent(agent);
        }
    }

    private void SimulateAgent(EnemyAgent agent)
    {
        Vector2 position = agent.Position;
        Vector2 playerPosition = player.position;

        Vector2 flowDirection =
            flowField.GetDirection(position);

        Vector2 separation =
            CalculateSeparation(agent);

        Vector2 formationOffset =
            CalculateFormation(
                agent,
                position,
                playerPosition);

        Vector2 movementVariation =
            CalculateVariation(agent.StableId);

        Vector2 steering =
            flowDirection * flowWeight +
            separation * separationWeight +
            formationOffset * formationWeight +
            movementVariation * variationWeight;

        Vector2 finalDirection =
    steering.sqrMagnitude > 0.0001f
        ? steering.normalized
        : Vector2.zero;

        finalDirection =
            agent.ApplyAxisAlternation(
                finalDirection,
                playerPosition,
                flowField,
                Time.fixedDeltaTime);

        agent.ApplyMovement(finalDirection);
        agent.UpdateVisualAnimation(simulationTime);

        TryApplyContactDamage(agent);
    }

    private Vector2 CalculateSeparation(
        EnemyAgent agent)
    {
        float radius = agent.SeparationRadius;
        float radiusSquared = radius * radius;

        spatialHash.CollectNearby(
            agent.Position,
            radius,
            nearbyBuffer);

        Vector2 separation = Vector2.zero;

        for (int i = 0;
             i < nearbyBuffer.Count;
             i++)
        {
            EnemyAgent neighbor = nearbyBuffer[i];

            if (neighbor == null || neighbor == agent)
            {
                continue;
            }

            Vector2 offset =
                agent.Position - neighbor.Position;

            float distanceSquared =
                offset.sqrMagnitude;

            if (distanceSquared >= radiusSquared)
            {
                continue;
            }

            if (distanceSquared < 0.0001f)
            {
                float overlapAngle =
                    (agent.StableId -
                     neighbor.StableId)
                    * 2.399963f;

                separation += new Vector2(
                    Mathf.Cos(overlapAngle),
                    Mathf.Sin(overlapAngle));

                continue;
            }

            float distance =
                Mathf.Sqrt(distanceSquared);

            float strength =
                1f - distance / radius;

            separation +=
                offset.normalized * strength;
        }

        return Vector2.ClampMagnitude(
            separation,
            1f);
    }

    private Vector2 CalculateFormation(
        EnemyAgent agent,
        Vector2 position,
        Vector2 playerPosition)
    {
        float angle =
            agent.StableId * 2.399963f;

        Vector2 slotDirection = new Vector2(
            Mathf.Cos(angle),
            Mathf.Sin(angle));

        Vector2 slotPosition =
            playerPosition +
            slotDirection * agent.AttackRadius;

        float distanceToPlayer =
            Vector2.Distance(
                position,
                playerPosition);

        float blend =
            1f - Mathf.InverseLerp(
                agent.AttackRadius,
                agent.AttackRadius + formationRange,
                distanceToPlayer);

        Vector2 toSlot =
            slotPosition - position;

        if (toSlot.sqrMagnitude < 0.0001f)
        {
            return Vector2.zero;
        }

        return toSlot.normalized *
               Mathf.Clamp01(blend);
    }

    private Vector2 CalculateVariation(int stableId)
    {
        float angle =
            simulationTime * variationSpeed +
            stableId * 1.618034f;

        return new Vector2(
            Mathf.Cos(angle),
            Mathf.Sin(angle));
    }
    private void TryApplyContactDamage(EnemyAgent agent)
    {
        if (playerHealth == null ||
            playerCollider == null ||
            playerHealth.IsDead ||
            agent.HitCollider == null ||
            agent.Definition == null)
        {
            return;
        }

        ColliderDistance2D distance =
            agent.HitCollider.Distance(
                playerCollider);

        if (!distance.isOverlapped)
        {
            return;
        }

        playerHealth.TakeDamage(
            agent.Definition.ContactDamage);
    }
}
