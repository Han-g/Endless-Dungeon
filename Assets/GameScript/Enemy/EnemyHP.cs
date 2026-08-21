using System;
using UnityEngine;

[DisallowMultipleComponent]

public class EnemyHP : MonoBehaviour, IDamageable
{
    public int CurrentHealth { get; private set; }
    public int MaxHealth { get; private set; }
    public bool IsDead { get; private set; }

    public event Action<int, int> HealthChanged;
    public event Action Died;
    public static event Action AnyEnemyDied;

    public void Initialize(int maxHealth)
    {
        MaxHealth = Mathf.Max(1, maxHealth);
        CurrentHealth = MaxHealth;
        IsDead = false;

        HealthChanged?.Invoke(
            CurrentHealth,
            MaxHealth);
    }

    public bool TakeDamage(int amount)
    {
        if (IsDead || amount <= 0)
        {
            return false;
        }

        CurrentHealth =
            Mathf.Max(0, CurrentHealth - amount);

        HealthChanged?.Invoke(
            CurrentHealth,
            MaxHealth);

        if (CurrentHealth == 0)
        {
            Die();
        }

        return true;
    }

    private void Die()
    {
        IsDead = true;

        Died?.Invoke();
        AnyEnemyDied?.Invoke();

        // 이후 Object Pool 반환으로 변경할 부분
        Destroy(gameObject);
    }
}
