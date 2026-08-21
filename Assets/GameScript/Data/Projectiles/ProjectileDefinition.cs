using UnityEngine;

[CreateAssetMenu(
    fileName = "ProjectileDefinition",
    menuName = "Endless Dungeon/Projectile Definition")]
public class ProjectileDefinition : ScriptableObject
{
    [Header("Identity")]
    [SerializeField]
    private int projectileId;

    [SerializeField]
    private string displayName;

    [Header("Prefab")]
    [SerializeField]
    private PlayerProjectile prefab;

    [SerializeField]
    private Sprite projectileSprite;

    [SerializeField, Min(0.1f)]
    private float projectileScale = 1f;

    [Header("Attack")]
    [SerializeField, Min(1)]
    private int baseDamage = 10;

    [SerializeField, Min(0.1f)]
    private float attacksPerSecond = 6f;

    [SerializeField, Min(0.1f)]
    private float moveSpeed = 12f;

    [SerializeField, Min(0.1f)]
    private float range = 8f;

    [SerializeField, Min(0f)]
    private float spawnDistance = 0.7f;

    [SerializeField]
    private float rotationOffset = -90f;

    public int ProjectileId => projectileId;
    public string DisplayName => displayName;
    public PlayerProjectile Prefab => prefab;
    public Sprite ProjectileSprite => projectileSprite;
    public float ProjectileScale => projectileScale;

    public int BaseDamage => baseDamage;
    public float AttacksPerSecond => attacksPerSecond;
    public float MoveSpeed => moveSpeed;
    public float Range => range;
    public float SpawnDistance => spawnDistance;
    public float RotationOffset => rotationOffset;
}
