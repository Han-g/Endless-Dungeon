using System;
using System.Globalization;
using System.Text;
using EndlessDungeon.Network.Generated;
using TMPro;
using UnityEngine;

[DisallowMultipleComponent]
public sealed class BattleGrowthHUD : MonoBehaviour
{
    [SerializeField] private NetworkManager networkManager;
    [SerializeField] private GameObject panel;
    [SerializeField] private TMP_Text levelText;
    [SerializeField] private TMP_Text healthText;
    [SerializeField] private RectTransform healthFill;
    [SerializeField] private TMP_Text experienceText;
    [SerializeField] private RectTransform experienceFill;
    [SerializeField] private RectTransform gainsPanel;
    [SerializeField] private TMP_Text gainsText;

    private bool playing;
    private string displayedSession;
    private byte characterId;
    private byte level;
    private int currentHp;
    private uint experience;
    private uint floor;
    private uint next;
    private CombatStats lastStats;

    private void OnEnable()
    {
        ResetDisplay();
        networkManager.GameStateChanged += OnGameState;
        networkManager.PlayerAdded += OnAdded;
        networkManager.PlayerChanged += OnPlayer;
        networkManager.PlayerRemoved += OnRemoved;
        networkManager.RoomLeft += OnLeft;
        OnGameState(networkManager.State?.game);
    }

    private void OnDisable()
    {
        networkManager.GameStateChanged -= OnGameState;
        networkManager.PlayerAdded -= OnAdded;
        networkManager.PlayerChanged -= OnPlayer;
        networkManager.PlayerRemoved -= OnRemoved;
        networkManager.RoomLeft -= OnLeft;
        playing = false;
        ResetDisplay();
    }

    private void ResetDisplay()
    {
        displayedSession = null;
        gainsPanel.gameObject.SetActive(false);
        panel.SetActive(false);
    }

    private void OnGameState(GameState game)
    {
        bool nowPlaying = game?.phase == "playing";
        if (playing == nowPlaying) return;
        playing = nowPlaying;
        ResetDisplay();

        var players = networkManager.State?.players;
        var id = networkManager.LocalSessionId;
        if (playing && players != null && !string.IsNullOrEmpty(id) &&
            players.TryGetValue(id, out var player))
        {
            OnPlayer(id, player);
        }
    }

    private void OnAdded(string id, PlayerState player, bool isLocal)
    {
        if (isLocal) OnPlayer(id, player);
    }

    private void OnRemoved(string id, PlayerState player)
    {
        if (id == displayedSession) ResetDisplay();
    }

    private void OnLeft(int code)
    {
        playing = false;
        ResetDisplay();
    }

    private void OnPlayer(string id, PlayerState player)
    {
        if (!playing || id != networkManager.LocalSessionId || player == null || player.level == 0) return;
        bool initial = displayedSession != id || characterId != player.characterId || level > player.level;
        if (initial)
        {
            gainsPanel.gameObject.SetActive(false);
            panel.SetActive(true);
        }
        else if (player.level > level)
        {
            ShowLevelUp(level, player, lastStats);
        }

        if (initial || currentHp != player.hp || lastStats.MaxHp != player.maxHp)
        {
            currentHp = player.hp;
            healthText.text = $"HP  {currentHp} / {player.maxHp}";
            float fraction = player.maxHp > 0 ? Mathf.Clamp01((float)currentHp / player.maxHp) : 0f;
            healthFill.anchorMax = new Vector2(fraction, 1f);
        }

        if (initial || level != player.level || experience != player.experience ||
            floor != player.levelStartExperience || next != player.nextLevelExperience)
        {
            ShowExperience(player);
        }

        displayedSession = id;
        characterId = player.characterId;
        level = player.level;
        experience = player.experience;
        floor = player.levelStartExperience;
        next = player.nextLevelExperience;
        // Colyseus updates the same PlayerState instance in place.
        lastStats = new CombatStats(player);
    }

    private void ShowExperience(PlayerState player)
    {
        levelText.text = $"Lv. {player.level}";
        float fraction = 1f;
        if (player.nextLevelExperience == 0)
        {
            experienceText.text = "MAX LEVEL";
        }
        else
        {
            long needed = (long)player.nextLevelExperience - player.levelStartExperience;
            long earned = Math.Max(0L, (long)player.experience - player.levelStartExperience);
            earned = Math.Min(earned, Math.Max(0L, needed));
            fraction = needed > 0 ? (float)earned / needed : 0f;
            experienceText.text = $"{earned} / {needed} XP";
        }
        experienceFill.anchorMax = new Vector2(fraction, 1f);
    }

    private void ShowLevelUp(byte oldLevel, PlayerState current, CombatStats previous)
    {
        var message = new StringBuilder();
        message.Append("<b>Level up   ").Append(oldLevel).Append(" > ").Append(current.level).Append("</b>");
        AddGain(message, "Max HP", (long)current.maxHp - previous.MaxHp);
        AddGain(message, "Damage", (long)current.damage - previous.Damage);
        AddGain(message, "Attacks/sec", current.attacksPerSecond - previous.AttacksPerSecond);
        AddGain(message, "Move speed", current.moveSpeed - previous.MoveSpeed);
        AddGain(message, "Projectile speed", current.projectileSpeed - previous.ProjectileSpeed);
        AddGain(message, "Projectile range", current.projectileRange - previous.ProjectileRange);
        AddGain(message, "Extra targets", current.bonusProjectileHits - previous.BonusHits);
        gainsPanel.gameObject.SetActive(true);
        gainsText.text = message.ToString();
        gainsPanel.SetSizeWithCurrentAnchors(RectTransform.Axis.Vertical, gainsText.preferredHeight + 24f);
    }

    private static void AddGain(StringBuilder message, string label, double delta)
    {
        double rounded = Math.Round(delta, 3, MidpointRounding.AwayFromZero);
        if (rounded <= 0) return;
        message.Append('\n').Append(label).Append("   <color=#BCEAB1>+")
            .Append(rounded.ToString("0.###", CultureInfo.InvariantCulture)).Append("</color>");
    }

    private readonly struct CombatStats
    {
        public readonly int MaxHp, Damage, BonusHits;
        public readonly float AttacksPerSecond, MoveSpeed, ProjectileSpeed, ProjectileRange;

        public CombatStats(PlayerState player)
        {
            MaxHp = player.maxHp;
            Damage = player.damage;
            BonusHits = player.bonusProjectileHits;
            AttacksPerSecond = player.attacksPerSecond;
            MoveSpeed = player.moveSpeed;
            ProjectileSpeed = player.projectileSpeed;
            ProjectileRange = player.projectileRange;
        }
    }
}
