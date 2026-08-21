using System;
using UnityEngine;

[Serializable]
public sealed class PlayerLevelEntry
{
    [SerializeField, Min(1)]
    private int level = 1;

    [SerializeField, Min(0)]
    private int requiredTotalKills;

    [SerializeField, Min(0)]
    private int maxHealthFlatBonus;

    [SerializeField, Min(0.1f)]
    private float moveSpeedMultiplier = 1f;

    [SerializeField, Min(0.1f)]
    private float damageMultiplier = 1f;

    [SerializeField, Min(0f)]
    private float attackSpeedBonus = 0f;

    [SerializeField, Min(0.1f)]
    private float projectileSpeedMultiplier = 1f;

    [SerializeField, Min(0.1f)]
    private float rangeMultiplier = 1f;

    public int Level => level;
    public int RequiredTotalKills =>
        requiredTotalKills;

    public int MaxHealthFlatBonus =>
        maxHealthFlatBonus;

    public float MoveSpeedMultiplier =>
        moveSpeedMultiplier;

    public float DamageMultiplier =>
        damageMultiplier;

    public float AttackSpeedBonus =>
        attackSpeedBonus;

    public float ProjectileSpeedMultiplier =>
        projectileSpeedMultiplier;

    public float RangeMultiplier =>
        rangeMultiplier;
}

[CreateAssetMenu(
    fileName = "LevelProgression",
    menuName = "Endless Dungeon/Level Progression")]
public sealed class LevelProgressionDefinition :
    ScriptableObject
{
    [SerializeField]
    private PlayerLevelEntry[] levels;

    public PlayerLevelEntry GetEntryForKills(
        int totalKills)
    {
        if (levels == null)
        {
            return null;
        }

        PlayerLevelEntry result = null;

        for (int i = 0;
             i < levels.Length;
             i++)
        {
            PlayerLevelEntry entry =
                levels[i];

            if (entry == null)
            {
                continue;
            }

            if (entry.RequiredTotalKills >
                totalKills)
            {
                continue;
            }

            if (result == null ||
                entry.RequiredTotalKills >
                result.RequiredTotalKills)
            {
                result = entry;
            }
        }

        return result;
    }

    public PlayerLevelEntry GetNextEntry(
        int totalKills)
    {
        if (levels == null)
        {
            return null;
        }

        PlayerLevelEntry result = null;

        for (int i = 0;
             i < levels.Length;
             i++)
        {
            PlayerLevelEntry entry =
                levels[i];

            if (entry == null ||
                entry.RequiredTotalKills <=
                totalKills)
            {
                continue;
            }

            if (result == null ||
                entry.RequiredTotalKills <
                result.RequiredTotalKills)
            {
                result = entry;
            }
        }

        return result;
    }
}