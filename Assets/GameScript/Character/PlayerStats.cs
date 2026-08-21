using System;
using UnityEngine;


[DefaultExecutionOrder(-100)]
[DisallowMultipleComponent]
public class PlayerStats : MonoBehaviour
{
    [Header("Character")]
    [SerializeField]
    private CharacterDefinition startingCharacter;

    public event Action StatsChanged;

    public CharacterDefinition Character
    {
        get;
        private set;
    }

    public ProjectileDefinition Projectile
    {
        get;
        private set;
    }

    public int Level
    {
        get;
        private set;
    } = 1;

    private int maxHealthFlatBonus;

    private float moveSpeedLevelMultiplier = 1f;
    private float damageLevelMultiplier = 1f;
    private float attackSpeedLevelBonus = 0f;
    private float projectileSpeedLevelMultiplier = 1f;
    private float rangeLevelMultiplier = 1f;

    public int MaxHealth =>
        Character == null
            ? 1
            : Mathf.Max(
                1,
                Character.BaseMaxHealth +
                maxHealthFlatBonus);

    public float MoveSpeed =>
        Character == null
            ? 0f
            : Character.BaseMoveSpeed *
              moveSpeedLevelMultiplier;

    public int Damage
    {
        get
        {
            if (Character == null ||
                Projectile == null)
            {
                return 1;
            }

            float result =
                Projectile.BaseDamage *
                Character.DamageMultiplier *
                damageLevelMultiplier;

            return Mathf.Max(
                1,
                Mathf.RoundToInt(result));
        }
    }

    public float AttacksPerSecond
    {
        get
        {
            if (Character == null ||
                Projectile == null)
            {
                return 0.1f;
            }

            float result =
            Character.AttackSpeedBonus +
            attackSpeedLevelBonus;

            return Mathf.Max(
                0.1f,
                result);
        }
    }

    public float ProjectileSpeed
    {
        get
        {
            if (Character == null ||
                Projectile == null)
            {
                return 0.1f;
            }

            return Mathf.Max(
                0.1f,
                Projectile.MoveSpeed *
                Character.ProjectileSpeedMultiplier *
                projectileSpeedLevelMultiplier);
        }
    }

    public float ProjectileRange
    {
        get
        {
            if (Character == null ||
                Projectile == null)
            {
                return 0.1f;
            }

            return Mathf.Max(
                0.1f,
                Projectile.Range *
                Character.RangeMultiplier *
                rangeLevelMultiplier);
        }
    }

    public PlayerProjectile ProjectilePrefab =>
        Projectile != null
            ? Projectile.Prefab
            : null;

    public float SpawnDistance =>
        Projectile != null
            ? Projectile.SpawnDistance
            : 0f;

    public float RotationOffset =>
        Projectile != null
            ? Projectile.RotationOffset
            : 0f;

    private void Awake()
    {
        Initialize(startingCharacter);
    }

    public void Initialize(
        CharacterDefinition definition)
    {
        if (definition == null)
        {
            Debug.LogError(
                "Starting Character가 연결되지 않았습니다.",
                this);

            return;
        }

        Character = definition;
        Projectile =
            definition.StartingProjectile;

        Level = 1;

        maxHealthFlatBonus = 0;

        moveSpeedLevelMultiplier = 1f;
        damageLevelMultiplier = 1f;
        attackSpeedLevelBonus = 0f;
        projectileSpeedLevelMultiplier = 1f;
        rangeLevelMultiplier = 1f;

        StatsChanged?.Invoke();
    }

    public void ApplyLevel(
        PlayerLevelEntry entry)
    {
        if (entry == null)
        {
            return;
        }

        Level = entry.Level;

        maxHealthFlatBonus =
            entry.MaxHealthFlatBonus;

        moveSpeedLevelMultiplier =
            entry.MoveSpeedMultiplier;

        damageLevelMultiplier =
            entry.DamageMultiplier;

        attackSpeedLevelBonus =
            entry.AttackSpeedBonus;

        projectileSpeedLevelMultiplier =
            entry.ProjectileSpeedMultiplier;

        rangeLevelMultiplier =
            entry.RangeMultiplier;

        StatsChanged?.Invoke();
    }

    public void SetProjectile(
        ProjectileDefinition definition)
    {
        if (definition == null)
        {
            return;
        }

        Projectile = definition;
        StatsChanged?.Invoke();
    }
}
