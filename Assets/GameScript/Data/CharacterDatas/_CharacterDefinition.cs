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

    [Header("Appearance")]
    [SerializeField] private Sprite idleSprite;
    [SerializeField] private AnimatorOverrideController animationController;

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

    public Sprite IdleSprite => idleSprite;
    public AnimatorOverrideController AnimationController => animationController;

    public ProjectileDefinition StartingProjectile =>
        startingProjectile;
}
