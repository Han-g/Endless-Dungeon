using UnityEngine;

public interface IDamageable
{
    int CurrentHealth { get; }
    int MaxHealth { get; }
    bool IsDead { get; }

    bool TakeDamage(int amount);
}

public class DamageInterface
{
    
}
