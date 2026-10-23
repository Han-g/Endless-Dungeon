using System;
using System.Collections.Generic;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

using NetworkRoomState =
    EndlessDungeon.Network.Generated.MyRoomState;

using NetworkPlayerState =
    EndlessDungeon.Network.Generated.PlayerState;

public sealed class RoomPanelController : MonoBehaviour
{
    [Serializable]
    public sealed class CharacterPortrait
    {
        public int characterId;

        public Sprite portrait;
    }

    [SerializeField]
    private RoomLobbyConnection connection;

    [SerializeField]
    private GameSecneController menuController;

    [SerializeField]
    private RoomMemberSlotUI[] slots;

    [SerializeField]
    private TMP_Text roomIdText;

    [SerializeField]
    private TMP_Text statusText;

    [SerializeField]
    private Button leaveButton;

    [SerializeField]
    private Button readyButton;

    [SerializeField]
    private Button gameStartButton;

    [SerializeField]
    private TMP_Dropdown characterDropdown;

    [SerializeField]
    private CharacterDefinition[] characters;

    [SerializeField]
    private CharacterPortrait[] portraits;

    private bool subscribed;
    private bool operationPending;
    private int generation;

    private TMP_Text readyLabel;

    private void OnEnable()
    {
        ++generation;

        operationPending = false;

        if (RoomLobbyConnection.Instance != null)
        {
            connection = RoomLobbyConnection.Instance;
        }

        readyLabel =
            readyButton != null
                ? readyButton.GetComponentInChildren<TMP_Text>(true)
                : null;

        SetStatus(string.Empty);

        if (
            connection == null ||
            menuController == null)
        {
            ClearSlots();

            SetStatus("Check the room connection settings.");

            RefreshInteraction();

            return;
        }

        connection.WaitingStateChanged += RenderState;
        connection.WaitingRoomLeft += HandleRoomLeft;
        connection.StatusChanged += SetStatus;

        subscribed = true;

        RenderState(
            connection.CurrentRoom != null
                ? connection.CurrentRoom.State
                : null);
    }

    private void OnDisable()
    {
        ++generation;

        if (subscribed && connection != null)
        {
            connection.WaitingStateChanged -= RenderState;
            connection.WaitingRoomLeft -= HandleRoomLeft;
            connection.StatusChanged -= SetStatus;
        }

        subscribed = false;
    }

    private void LateUpdate()
    {
        RefreshInteraction();
    }

    private void RenderState(NetworkRoomState state)
    {
        if (!isActiveAndEnabled)
        {
            return;
        }

        var room =
            connection != null
                ? connection.CurrentRoom
                : null;

        if (roomIdText != null)
        {
            roomIdText.richText = false;

            roomIdText.text =
                room != null
                    ? $"Room ID: {room.RoomId}"
                    : string.Empty;
        }

        var members =
            new List<KeyValuePair<string, NetworkPlayerState>>();

        if (state?.players != null)
        {
            state.players.ForEach(
                (string id, NetworkPlayerState player) =>
                {
                    if (player != null)
                    {
                        members.Add(
                            new KeyValuePair<
                                string,
                                NetworkPlayerState>(
                                id,
                                player));
                    }
                });
        }

        members.Sort(
            (a, b) =>
                string.CompareOrdinal(a.Key, b.Key));

        for (
            int index = 0;
            slots != null && index < slots.Length;
            ++index)
        {
            var slot = slots[index];

            if (slot == null)
            {
                continue;
            }

            if (index >= members.Count)
            {
                slot.ShowEmpty();
                continue;
            }

            var member = members[index];
            var player = member.Value;

            var definition =
                FindCharacter(player.characterId);

            slot.ShowMember(
                player.name,
                CharacterName(player.characterId),
                FindPortrait(player.characterId),
                state != null &&
                    member.Key == state.hostSessionId,
                room != null &&
                    member.Key == room.SessionId,
                player.isReady,
                definition != null
                    ? definition.BaseMaxHealth
                    : 0,
                definition != null
                    ? definition.BaseMoveSpeed
                    : 0f);
        }

        RefreshInteraction();
    }

    public async void OnReadyClicked()
    {
        if (
            !CanRequest() ||
            !TryLocalPlayer(out _))
        {
            return;
        }

        int requestGeneration = generation;

        var source = connection.CurrentRoom;

        operationPending = true;

        RefreshInteraction();

        try
        {
            // 준비를 취소했다는 서버 응답을 받은 뒤
            // 캐릭터 선택 화면을 연다.
            bool accepted =
                await connection.SetReadyAsync(false);

            if (
                IsCurrent(requestGeneration) &&
                accepted &&
                connection.CurrentRoom == source &&
                source.State.game.phase == "waiting")
            {
                menuController.OnCharacterSelectStarted();
            }
        }
        finally
        {
            if (IsCurrent(requestGeneration))
            {
                operationPending = false;

                RefreshInteraction();
            }
        }
    }

    public async void OnGameStartClicked()
    {
        if (
            !CanRequest() ||
            !CanStart())
        {
            return;
        }

        int requestGeneration = generation;

        operationPending = true;

        RefreshInteraction();

        try
        {
            await connection.RequestStartAsync();

            // 씬 전환은 서버 상태 변경을 받은
            // RoomLobbyConnection이 처리한다.
        }
        finally
        {
            if (IsCurrent(requestGeneration))
            {
                operationPending = false;

                RefreshInteraction();
            }
        }
    }

    public async void OnLeaveRoomClicked()
    {
        if (!CanRequest())
        {
            return;
        }

        int requestGeneration = generation;

        operationPending = true;

        RefreshInteraction();

        try
        {
            await connection.LeaveRoomAsync();
        }
        finally
        {
            if (IsCurrent(requestGeneration))
            {
                operationPending = false;

                RefreshInteraction();
            }
        }
    }

    private bool CanRequest()
    {
        var room =
            connection != null
                ? connection.CurrentRoom
                : null;

        return
            isActiveAndEnabled &&
            subscribed &&
            !operationPending &&
            room != null &&
            room.State?.game != null &&
            room.State.game.phase == "waiting" &&
            !connection.IsBusy &&
            !connection.IsGameTransitioning;
    }

    private bool TryLocalPlayer(
        out NetworkPlayerState player)
    {
        player = null;

        var room =
            connection != null
                ? connection.CurrentRoom
                : null;

        return
            room?.State?.players != null &&
            room.State.players.TryGetValue(
                room.SessionId,
                out player) &&
            player != null;
    }

    private bool CanStart()
    {
        var room =
            connection != null
                ? connection.CurrentRoom
                : null;

        if (
            room?.State?.players == null ||
            room.State.players.Count == 0 ||
            room.State.hostSessionId != room.SessionId)
        {
            return false;
        }

        bool allReady = true;

        room.State.players.ForEach(
            (string id, NetworkPlayerState player) =>
            {
                if (
                    player == null ||
                    !player.isReady)
                {
                    allReady = false;
                }
            });

        return allReady;
    }

    private void RefreshInteraction()
    {
        bool available = CanRequest();

        if (leaveButton != null)
        {
            leaveButton.interactable = available;
        }

        if (readyButton != null)
        {
            readyButton.interactable =
                available && TryLocalPlayer(out _);
        }

        if (gameStartButton != null)
        {
            gameStartButton.interactable =
                available && CanStart();
        }

        // 이번 흐름에서는 CharacterPanel에서 선택한다.
        if (characterDropdown != null)
        {
            characterDropdown.interactable = false;
        }

        if (readyLabel != null)
        {
            readyLabel.text =
                TryLocalPlayer(out var player) &&
                player.isReady
                    ? "Change Character"
                    : "Ready";
        }
    }

    private void HandleRoomLeft(int code)
    {
        if (!isActiveAndEnabled)
        {
            return;
        }

        ClearSlots();

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

        foreach (var definition in characters)
        {
            if (
                definition != null &&
                definition.CharacterId == id)
            {
                return definition;
            }
        }

        return null;
    }

    private string CharacterName(int id)
    {
        var definition = FindCharacter(id);

        return definition != null
            ? definition.DisplayName
            : $"Character {id}";
    }

    private Sprite FindPortrait(int id)
    {
        if (portraits == null)
        {
            return null;
        }

        foreach (var entry in portraits)
        {
            if (
                entry != null &&
                entry.characterId == id)
            {
                return entry.portrait;
            }
        }

        return null;
    }

    private void ClearSlots()
    {
        if (slots == null)
        {
            return;
        }

        foreach (var slot in slots)
        {
            if (slot != null)
            {
                slot.ShowEmpty();
            }
        }
    }

    private bool IsCurrent(int value)
    {
        return
            this != null &&
            isActiveAndEnabled &&
            value == generation;
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