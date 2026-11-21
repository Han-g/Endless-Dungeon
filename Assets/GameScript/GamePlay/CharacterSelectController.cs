using TMPro;
using UnityEngine;
using UnityEngine.UI;

using NetworkRoomState =
    EndlessDungeon.Network.Generated.MyRoomState;
using NetworkCharacterStats =
    EndlessDungeon.Network.Generated.CharacterStatsState;

public class CharacterSelectController : MonoBehaviour
{
    [Header("Character Data")]
    [SerializeField]
    private CharacterDefinition[] characters;

    [Header("UI")]
    [SerializeField]
    private TMP_Text selectedCharacterText;

    [SerializeField]
    private Button confirmButton;

    [SerializeField]
    private TMP_Text statusText;

    [SerializeField]
    private Button cancelButton;

    [Header("Room")]
    [SerializeField]
    private RoomLobbyConnection connection;

    [SerializeField]
    private GameSecneController menuController;

    private CharacterDefinition selectedCharacter;

    private bool submitting;
    private bool subscribed;
    private int generation;

    private void OnEnable()
    {
        ++generation;

        submitting = false;
        selectedCharacter = null;

        if (RoomLobbyConnection.Instance != null)
        {
            connection = RoomLobbyConnection.Instance;
        }

        SetStatus(string.Empty);

        if (selectedCharacterText != null)
        {
            selectedCharacterText.text =
                "Select a Character.";
        }

        if (
            connection == null ||
            connection.CurrentRoom == null ||
            menuController == null)
        {
            SetStatus("Check the room connection.");

            RefreshButtons();

            return;
        }

        connection.WaitingRoomLeft += HandleRoomLeft;
        connection.StatusChanged += SetStatus;
        connection.WaitingStateChanged += HandleWaitingStateChanged;

        subscribed = true;

        var room = connection.CurrentRoom;

        if (
            room.State?.players != null &&
            room.State.players.TryGetValue(
                room.SessionId,
                out var player) &&
            player != null)
        {
            SelectCharacter(player.characterId);
        }

        RefreshButtons();
    }

    private void OnDisable()
    {
        ++generation;

        if (subscribed && connection != null)
        {
            connection.WaitingRoomLeft -= HandleRoomLeft;
            connection.StatusChanged -= SetStatus;
            connection.WaitingStateChanged -= HandleWaitingStateChanged;
        }

        subscribed = false;
    }

    public void SelectCharacter(int characterId)
    {
        if (submitting)
        {
            return;
        }

        selectedCharacter = FindCharacter(characterId);

        if (selectedCharacter == null)
        {
            SetStatus("Character data is missing.");
        }

        RefreshSelectedCharacterText();
        RefreshButtons();
    }

    private bool TryGetSelectedStats(out NetworkCharacterStats stats)
    {
        stats = null;
        var room = connection != null ? connection.CurrentRoom : null;

        return selectedCharacter != null &&
            room?.State?.characterCatalog != null &&
            room.State.characterCatalog.TryGetValue(
                selectedCharacter.CharacterId.ToString(), out stats) &&
            stats != null;
    }

    private void RefreshSelectedCharacterText()
    {
        if (selectedCharacterText == null)
        {
            return;
        }

        selectedCharacterText.richText = false;
        if (selectedCharacter == null)
        {
            selectedCharacterText.text = "Select a Character.";
            return;
        }

        if (!TryGetSelectedStats(out var stats))
        {
            selectedCharacterText.text =
                $"{selectedCharacter.DisplayName}\nLoading character stats...";
            return;
        }

        string weapon = selectedCharacter.StartingProjectile != null
            ? selectedCharacter.StartingProjectile.WeaponName
            : "None";

        selectedCharacterText.text =
            $"{selectedCharacter.DisplayName}\n" +
            $"HP: {stats.maxHp}\n" +
            $"Move Speed: {stats.moveSpeed:0.##}\n" +
            $"Damage per Hit: {stats.damage}\n" +
            $"Attacks / Sec: {stats.attacksPerSecond:0.##}\n" +
            $"Starting Weapon: {weapon}";
    }

    private void HandleWaitingStateChanged(NetworkRoomState state)
    {
        if (!isActiveAndEnabled)
        {
            return;
        }

        var room = connection != null ? connection.CurrentRoom : null;
        // 초기 상태가 늦게 도착한 경우만 초기화하고, 사용자의 미리보기 선택은 유지합니다.
        if (selectedCharacter == null && room != null &&
            state?.players != null &&
            state.players.TryGetValue(room.SessionId, out var player) &&
            player != null)
        {
            selectedCharacter = FindCharacter(player.characterId);
        }

        RefreshSelectedCharacterText();
        RefreshButtons();
    }

    public async void ConfirmCharacter()
    {
        if (
            submitting ||
            selectedCharacter == null ||
            !CanSelect() ||
            !TryGetSelectedStats(out _))
        {
            return;
        }

        int requestGeneration = generation;

        var source = connection.CurrentRoom;

        submitting = true;

        RefreshButtons();

        SetStatus("Confirming your character...");

        try
        {
            bool accepted = await connection.SetReadyAsync(
                true,
                selectedCharacter.CharacterId);

            if (
                this == null ||
                !isActiveAndEnabled ||
                requestGeneration != generation)
            {
                return;
            }

            if (
                accepted &&
                connection.CurrentRoom == source &&
                source.State.game.phase == "waiting")
            {
                menuController.OnCharacterSelectionFinished();
            }
        }
        finally
        {
            if (
                this != null &&
                isActiveAndEnabled &&
                requestGeneration == generation)
            {
                submitting = false;

                RefreshButtons();
            }
        }
    }

    public void CancelSelection()
    {
        if (submitting || !CanSelect())
        {
            return;
        }

        // 선택 화면을 열기 전에 이미 준비를 취소했다.
        menuController.OnCharacterSelectionFinished();
    }

    private bool CanSelect()
    {
        var room =
            connection != null
                ? connection.CurrentRoom
                : null;

        return
            subscribed &&
            room != null &&
            room.State?.game != null &&
            room.State.game.phase == "waiting" &&
            !connection.IsGameTransitioning;
    }

    private void RefreshButtons()
    {
        bool available = !submitting && CanSelect();

        if (confirmButton != null)
        {
            confirmButton.interactable =
                available && TryGetSelectedStats(out _);
        }

        if (cancelButton != null)
        {
            cancelButton.interactable = available;
        }
    }

    private void HandleRoomLeft(int code)
    {
        if (
            !isActiveAndEnabled ||
            menuController == null)
        {
            return;
        }

        if (
            ClientSession.Instance != null &&
            ClientSession.Instance.IsAuthenticated)
        {
            menuController.OnRoomLeft();
        }
        else
        {
            menuController.OnLoggedOut();
        }
    }

    private CharacterDefinition FindCharacter(int id)
    {
        if (characters == null)
        {
            return null;
        }

        foreach (CharacterDefinition character in characters)
        {
            if (
                character != null &&
                character.CharacterId == id)
            {
                return character;
            }
        }

        return null;
    }

    private void SetStatus(string message)
    {
        if (statusText == null)
        {
            return;
        }

        statusText.richText = false;

        statusText.text = message ?? string.Empty;
    }
}
