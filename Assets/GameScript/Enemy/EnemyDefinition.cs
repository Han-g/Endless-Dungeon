using UnityEngine;

[CreateAssetMenu(
    fileName = "EnemyDefinition",
    menuName = "Endless Dungeon/Enemy Definition")]
public sealed class EnemyDefinition : ScriptableObject
{
    [SerializeField] private int typeId;
    [SerializeField] private Sprite sprite;
    [SerializeField] private Sprite[] moveFrames;
    [SerializeField, Min(1f)] private float moveAnimationFps = 6f;
    [SerializeField] private float moveSpeed = 2f;
    [SerializeField] private float separationRadius = 0.8f;
    [SerializeField] private float attackRadius = 1.2f;
    [SerializeField] private int maxHealth = 10;
    [SerializeField, Min(0)] private int contactDamage = 10;

    public int TypeId => typeId;
    public Sprite Sprite => sprite;
    public float MoveSpeed => moveSpeed;
    public Sprite[] MoveFrames => moveFrames;
    public float MoveAnimationFps => moveAnimationFps;
    public float SeparationRadius => separationRadius;
    public float AttackRadius => attackRadius;
    public int MaxHealth => maxHealth;
    public int ContactDamage => contactDamage;
}
