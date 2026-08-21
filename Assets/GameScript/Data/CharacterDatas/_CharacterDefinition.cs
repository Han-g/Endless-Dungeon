using UnityEngine;

[CreateAssetMenu(fileName = "CharacterDefinition", menuName = "Endless Dungeon/CharacterDefinition")]
public class CharacterDefinition : ScriptableObject
{
    [Header("Identity")]
    [SerializeField]
    private int characterId;

    [SerializeField]
    private string displayName;

    [Header("Base Stats")]
    [SerializeField, Min(1)]
    private int baseMaxHealth = 100;

    [SerializeField, Min(0.1f)]
    private float baseMoveSpeed = 4f;

    [Header("Attack Multipliers")]
    [SerializeField, Min(0.1f)]
    private float damageMultiplier = 1f;

    [SerializeField, Min(0.1f)]
    private float attackSpeedBonus = 1f;

    [SerializeField, Min(0.1f)]
    private float projectileSpeedMultiplier = 1f;

    [SerializeField, Min(0.1f)]
    private float rangeMultiplier = 1f;

    [Header("Starting Weapon")]
    [SerializeField]
    private ProjectileDefinition startingProjectile;

    public int CharacterId => characterId;
    public string DisplayName => displayName;

    public int BaseMaxHealth => baseMaxHealth;
    public float BaseMoveSpeed => baseMoveSpeed;

    public float DamageMultiplier => damageMultiplier;
    public float AttackSpeedBonus =>
        attackSpeedBonus;

    public float ProjectileSpeedMultiplier =>
        projectileSpeedMultiplier;

    public float RangeMultiplier =>
        rangeMultiplier;

    public ProjectileDefinition StartingProjectile =>
        startingProjectile;
}
