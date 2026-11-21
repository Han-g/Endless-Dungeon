using UnityEngine;

[CreateAssetMenu(fileName = "CharacterDefinition", menuName = "Endless Dungeon/CharacterDefinition")]
public class CharacterDefinition : ScriptableObject
{
    [Header("Identity")]
    [SerializeField]
    private int characterId;

    [SerializeField]
    private string displayName;

    [Header("Appearance")]
    [SerializeField] private Sprite idleSprite;
    [SerializeField] private AnimatorOverrideController animationController;

    [Header("Starting Weapon")]
    [SerializeField]
    private ProjectileDefinition startingProjectile;

    public int CharacterId => characterId;
    public string DisplayName => displayName;
    public Sprite IdleSprite => idleSprite;
    public AnimatorOverrideController AnimationController => animationController;

    public ProjectileDefinition StartingProjectile =>
        startingProjectile;
}
