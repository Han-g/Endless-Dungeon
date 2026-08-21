using System;
using UnityEngine;

[DisallowMultipleComponent]
[RequireComponent(typeof(PlayerStats))]
public class PlayerHP : MonoBehaviour, IDamageable
{
    [SerializeField, Min(0f)]
    private float damageCooldown = 0.5f;

    public int CurrentHealth
    {
        get;
        private set;
    }

    public int MaxHealth =>
        maxHealth;

    public bool IsDead
    {
        get;
        private set;
    }

    public event Action<int, int> HealthChanged;
    public event Action Died;

    private PlayerStats stats;
    private int maxHealth;
    private float nextDamageTime;

    private void Awake()
    {
        stats = GetComponent<PlayerStats>();

        maxHealth = stats.MaxHealth;
        CurrentHealth = maxHealth;
        IsDead = false;
    }

    private void OnEnable()
    {
        stats.StatsChanged +=
            HandleStatsChanged;
    }

    private void OnDisable()
    {
        if (stats != null)
        {
            stats.StatsChanged -=
                HandleStatsChanged;
        }
    }

    private void HandleStatsChanged()
    {
        int previousMaxHealth =
            maxHealth;

        maxHealth =
            stats.MaxHealth;

        if (!IsDead &&
            maxHealth > previousMaxHealth)
        {
            int increase =
                maxHealth - previousMaxHealth;

            CurrentHealth += increase;
        }

        CurrentHealth =
            Mathf.Clamp(
                CurrentHealth,
                0,
                maxHealth);

        HealthChanged?.Invoke(
            CurrentHealth,
            maxHealth);
    }

    public bool TakeDamage(int amount)
    {
        if (IsDead || amount <= 0)
        {
            return false;
        }

        if (Time.time < nextDamageTime)
        {
            return false;
        }

        nextDamageTime =
            Time.time + damageCooldown;

        CurrentHealth =
            Mathf.Max(
                0,
                CurrentHealth - amount);

        HealthChanged?.Invoke(
            CurrentHealth,
            maxHealth);

        if (CurrentHealth == 0)
        {
            Die();
        }

        return true;
    }

    public void Heal(int amount)
    {
        if (IsDead || amount <= 0)
        {
            return;
        }

        CurrentHealth =
            Mathf.Min(
                maxHealth,
                CurrentHealth + amount);

        HealthChanged?.Invoke(
            CurrentHealth,
            maxHealth);
    }

    private void Die()
    {
        IsDead = true;

        PlayerMotor motor =
            GetComponent<PlayerMotor>();

        if (motor != null)
        {
            motor.enabled = false;
        }

        Died?.Invoke();

        Debug.Log(
            "Player 사망",
            this);
    }
}
