using System;
using EndlessDungeon.Network.Generated;
using TMPro;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.UI;

[DisallowMultipleComponent]
public sealed class TeamTraitHUD : MonoBehaviour
{
    [SerializeField] private NetworkManager networkManager;
    [SerializeField] private GameObject panel;
    [SerializeField] private TMP_Text progress;
    [SerializeField] private GameObject choices;
    [SerializeField] private TMP_Text countdown;
    [SerializeField] private Button[] buttons;
    [SerializeField] private TMP_Text[] labels;

    private uint shownOffer, lastKills, lastTarget, lastRank;
    private string lastTrait;
    private int shownSeconds = -1;
    private string[] shownOptions;
    private uint[] shownRanks;

    private void Awake()
    {
        shownOptions = new string[buttons.Length];
        shownRanks = new uint[buttons.Length];
        for (int i = 0; i < buttons.Length; i++)
        {
            int index = i;
            buttons[i].onClick.AddListener(() => Pick(index));
            labels[i].fontSizeMax = labels[i].fontSize;
            labels[i].fontSizeMin = 12f;
            labels[i].enableAutoSizing = true;
            labels[i].textWrappingMode = TextWrappingModes.Normal;
        }
    }

    private void OnEnable()
    {
        Hide();
        networkManager.GameStateChanged += OnGame;
        networkManager.PlayerAdded += OnAdded;
        networkManager.PlayerChanged += OnChanged;
        networkManager.PlayerRemoved += OnRemoved;
        networkManager.RoomLeft += OnLeft;
        Refresh();
    }

    private void OnDisable()
    {
        networkManager.GameStateChanged -= OnGame;
        networkManager.PlayerAdded -= OnAdded;
        networkManager.PlayerChanged -= OnChanged;
        networkManager.PlayerRemoved -= OnRemoved;
        networkManager.RoomLeft -= OnLeft;
        Hide();
    }

    private void OnGame(GameState _) => Refresh();
    private void OnAdded(string id, PlayerState p, bool local) { if (local) Refresh(); }
    private void OnChanged(string id, PlayerState p) { if (id == networkManager.LocalSessionId) Refresh(); }
    private void OnRemoved(string id, PlayerState p) { if (id == networkManager.LocalSessionId) Hide(); }
    private void OnLeft(int _) => Hide();

    private void Hide()
    {
        panel.SetActive(false);
        CloseChoices();
    }

    private void CloseChoices()
    {
        shownOffer = 0;
        shownSeconds = -1;
        choices.SetActive(false);
    }

    private static uint Rank(PlayerState p, string id)
    {
        return !string.IsNullOrEmpty(id) && p.traitRanks != null && p.traitRanks.TryGetValue(id, out uint rank) ? rank : 0;
    }

    private void Refresh()
    {
        var state = networkManager.State;
        string id = networkManager.LocalSessionId;
        if (state?.game?.phase != "playing" || string.IsNullOrEmpty(id) || state.players == null ||
            !state.players.TryGetValue(id, out var player) || state.traitCatalog == null)
        {
            if (panel.activeSelf) Hide();
            return;
        }
        var catalog = state.traitCatalog;
        uint kills = state.game.killCount;
        uint rank = Rank(player, player.lastTraitId);
        if (!panel.activeSelf || lastKills != kills || lastTarget != state.nextTraitKills ||
            lastTrait != player.lastTraitId || lastRank != rank)
        {
            panel.SetActive(true);
            lastKills = kills;
            lastTarget = state.nextTraitKills;
            lastTrait = player.lastTraitId;
            lastRank = rank;
            string line = lastTarget > 0 ? $"Team kills   {kills} / {lastTarget}" : $"Team kills   {kills}";
            for (int i = 0; i < catalog.Count; i++)
            {
                var entry = catalog[i];
                if (entry == null || entry.id != lastTrait) continue;
                string status = rank >= entry.maxRank ? "   MAX" : "";
                line += $"\n{entry.title}   Rank {rank}/{entry.maxRank}{status}";
                break;
            }
            progress.text = line;
        }

        int seconds = Mathf.CeilToInt((float)(player.traitDeadline - state.game.elapsedSeconds));
        var options = player.traitOptions;
        int count = options?.Count ?? 0;
        if (!player.alive || player.traitDeadline <= 0 || seconds <= 0 || count == 0 || count > buttons.Length)
        {
            if (choices.activeSelf) CloseChoices();
            return;
        }
        for (int i = 0; i < buttons.Length; i++)
        {
            bool visible = i < count;
            if (buttons[i].gameObject.activeSelf != visible) buttons[i].gameObject.SetActive(visible);
            if (!visible)
            {
                shownOptions[i] = null;
                continue;
            }
            string optionId = options[i];
            uint current = Rank(player, optionId);
            if (shownOffer == player.traitOfferId && shownOptions[i] == optionId && shownRanks[i] == current) continue;
            TraitDefinitionState trait = null;
            for (int j = 0; j < catalog.Count; j++)
            {
                if (catalog[j]?.id != optionId) continue;
                trait = catalog[j];
                break;
            }
            if (trait == null || current >= trait.maxRank || trait.rankDescriptions == null ||
                current >= trait.rankDescriptions.Count || string.IsNullOrEmpty(trait.rankDescriptions[(int)current]))
            {
                CloseChoices();
                return;
            }
            shownOptions[i] = trait.id;
            shownRanks[i] = current;
            labels[i].text = $"<b>[{i+1}]  {trait.title}   Rank {current} to {current + 1}/{trait.maxRank}</b>\n{trait.rankDescriptions[(int)current]}";
        }
        shownOffer = player.traitOfferId;
        if (!choices.activeSelf) choices.SetActive(true);
        if (shownSeconds != seconds)
        {
            shownSeconds = seconds;
            countdown.text = $"Choose one trait\nAuto-pick [1] in {seconds}s";
        }
    }

    private void Update()
    {
        if (shownOffer == 0 || Keyboard.current == null) return;
        var keys = Keyboard.current;
        if (keys.digit1Key.wasPressedThisFrame) Pick(0);
        else if (keys.digit2Key.wasPressedThisFrame) Pick(1);
        else if (keys.digit3Key.wasPressedThisFrame) Pick(2);
    }

    private async void Pick(int index)
    {
        var state = networkManager.State;
        if (shownOffer == 0 || state?.game?.phase != "playing" ||
            !state.players.TryGetValue(networkManager.LocalSessionId, out var player) || !player.alive ||
            player.traitOfferId != shownOffer || player.traitDeadline <= state.game.elapsedSeconds ||
            (uint)index >= buttons.Length || player.traitOptions == null || index >= player.traitOptions.Count ||
            player.traitOptions[index] != shownOptions[index]) return;
        try
        {
            await networkManager.ChooseTraitAsync(shownOffer, shownOptions[index]);
        }
        catch (Exception error)
        {
            Debug.LogWarning("Trait selection could not be sent: " + error.Message, this);
        }
    }
}
