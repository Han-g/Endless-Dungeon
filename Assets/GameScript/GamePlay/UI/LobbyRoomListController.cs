using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Colyseus;
using TMPro;
using UnityEngine;
using UnityEngine.UI;
using NetworkRoomState = EndlessDungeon.Network.Generated.MyRoomState;

// Attach to LobbyPanel. RoomLobbyConnection belongs on an always-active object.
public sealed class LobbyRoomListController : MonoBehaviour
{
    [SerializeField] private RoomLobbyConnection connection;
    [SerializeField] private GameSecneController menuController;
    [SerializeField] private Transform content;
    [SerializeField] private RoomListItemUI itemPrefab;
    [SerializeField] private TMP_Text statusText;
    [SerializeField] private Button createRoomButton;
    [SerializeField] private TMP_InputField roomTitleInput;

    private readonly Dictionary<string, RoomListItemUI> rows =
        new Dictionary<string, RoomListItemUI>(StringComparer.Ordinal);
    private int generation;
    private bool operationPending;
    private bool subscribed;
    private bool lastRequestsEnabled;
    private string currentStatus = string.Empty;
    private bool canShowListSummary;

    private void OnEnable()
    {
        if (RoomLobbyConnection.Instance != null)
        {
            connection = RoomLobbyConnection.Instance;
        }

        int requestGeneration = ++generation;
        operationPending = false;
        if (menuController != null &&
            (ClientSession.Instance == null || !ClientSession.Instance.IsAuthenticated))
        {
            menuController.OnLoggedOut();
            return;
        }
        if (connection == null || menuController == null || content == null || itemPrefab == null)
        {
            SetStatus("Check the lobby connection settings.");
            if (createRoomButton != null) createRoomButton.interactable = false;
            return;
        }

        connection.ListingsChanged += RenderListings;
        connection.StatusChanged += SetStatus;
        connection.WaitingRoomJoined += HandleRoomJoined;
        subscribed = true;
        SetStatus(string.Empty);
        RenderListings();
        _ = ConnectAsync(requestGeneration);
    }

    private void OnDisable()
    {
        ++generation;
        operationPending = false;
        if (subscribed && connection != null)
        {
            connection.ListingsChanged -= RenderListings;
            connection.StatusChanged -= SetStatus;
            connection.WaitingRoomJoined -= HandleRoomJoined;
        }
        subscribed = false;
        if (createRoomButton != null) createRoomButton.interactable = false;
        foreach (RoomListItemUI row in rows.Values)
            if (row != null) row.SetJoinEnabled(false);
    }

    private void LateUpdate()
    {
        // Observe local connection flags only; this does not request server data.
        RefreshInteraction();
    }

    private async Task ConnectAsync(int requestGeneration)
    {
        try
        {
            bool connected = await connection.EnsureLobbyConnectedAsync();
            if (!IsCurrent(requestGeneration)) return;
            RenderListings();
            if (!connected && string.IsNullOrEmpty(currentStatus))
                SetStatus("Failed to connect to the lobby.");
        }
        catch (Exception)
        {
            if (IsCurrent(requestGeneration)) SetStatus("Failed to connect to the lobby.");
        }
    }

    // Connect CreateRoomButton.OnClick to this method only.
    public async void OnCreateRoomClicked()
    {
        if (!CanRequest()) return;
        string title = roomTitleInput != null ? roomTitleInput.text.Trim() : string.Empty;
        if (title.Length > 32)
        {
            SetStatus("Room names must be 32 characters or fewer.");
            return;
        }
        if (title.Length == 0) title = "Room01";
        await RunRoomRequestAsync(() => connection.CreateRoomAsync(title), "Creating room...");
    }

    // RoomListItemUI.SetData supplies this callback for the row's actual roomId.
    public async void OnJoin(string roomId)
    {
        if (!CanRequest() || string.IsNullOrEmpty(roomId)) return;
        if (!connection.Listings.TryGetValue(roomId, out LobbyRoomListing listing) ||
            !IsJoinable(roomId, listing))
        {
            SetStatus("This room is unavailable. Check the room list.");
            RenderListings();
            return;
        }
        await RunRoomRequestAsync(() => connection.JoinRoomAsync(roomId), "Joining room...");
    }

    private async Task RunRoomRequestAsync(Func<Task<bool>> request, string message)
    {
        int requestGeneration = generation;
        operationPending = true;
        SetStatus(message);
        RefreshInteraction(true);
        try
        {
            bool succeeded = await request();
            if (IsCurrent(requestGeneration) && !succeeded && currentStatus == message)
                SetStatus("Room request failed. Please try again.");
        }
        catch (Exception)
        {
            if (IsCurrent(requestGeneration)) SetStatus("Room request failed. Please try again.");
        }
        finally
        {
            if (IsCurrent(requestGeneration))
            {
                operationPending = false;
                RenderListings();
            }
        }
    }

    private void HandleRoomJoined(Room<NetworkRoomState> joinedRoom)
    {
        if (!isActiveAndEnabled || joinedRoom == null) return;
        // Only a confirmed server join changes the visible panel.
        menuController.OnRoomJoined();
    }

    private void RenderListings()
    {
        if (!isActiveAndEnabled || connection == null || content == null || itemPrefab == null)
            return;

        var liveIds = new HashSet<string>(StringComparer.Ordinal);
        var orderedIds = new List<string>();
        foreach (KeyValuePair<string, LobbyRoomListing> entry in connection.Listings)
        {
            string id = entry.Key;
            LobbyRoomListing listing = entry.Value;
            if (string.IsNullOrEmpty(id) || listing == null) continue;
            liveIds.Add(id);
            orderedIds.Add(id);

            if (!rows.TryGetValue(id, out RoomListItemUI row) || row == null)
            {
                row = Instantiate(itemPrefab, content, false);
                row.gameObject.SetActive(true);
                rows[id] = row;
            }

            string title = listing.metadata != null ? listing.metadata.title : null;
            string phase = listing.metadata != null ? listing.metadata.phase : null;
            row.SetData(id, string.IsNullOrWhiteSpace(title) ? id : title,
                Math.Max(0, listing.clients), GetCapacity(listing.maxClients),
                PhaseLabel(phase), IsJoinable(id, listing), OnJoin);
        }

        var removedIds = new List<string>();
        foreach (KeyValuePair<string, RoomListItemUI> entry in rows)
            if (!liveIds.Contains(entry.Key)) removedIds.Add(entry.Key);
        foreach (string id in removedIds)
        {
            if (rows[id] != null) Destroy(rows[id].gameObject);
            rows.Remove(id);
        }

        orderedIds.Sort(StringComparer.Ordinal);
        for (int index = 0; index < orderedIds.Count; ++index)
            rows[orderedIds[index]].transform.SetSiblingIndex(index);
        RefreshInteraction(true);
    }

    private static bool IsJoinable(string id, LobbyRoomListing listing)
    {
        if (listing == null || !string.Equals(id, listing.roomId, StringComparison.Ordinal))
            return false;
        int capacity = GetCapacity(listing.maxClients);
        return capacity > 0 && listing.clients >= 0 && listing.clients < capacity &&
            !listing.locked && listing.metadata != null &&
            string.Equals(listing.metadata.phase, "waiting", StringComparison.Ordinal);
    }

    private static int GetCapacity(double value)
    {
        return !double.IsNaN(value) && !double.IsInfinity(value) && value >= 1 &&
            value <= int.MaxValue && Math.Truncate(value) == value ? (int)value : 0;
    }

    private static string PhaseLabel(string phase)
    {
        switch (phase)
        {
            case "waiting": return "Waiting";
            case "playing": return "Playing";
            case "finished": return "Finished";
            case "loading": return "Loading";
            default: return "Unknown Error";
        }
    }

    private bool CanRequest()
    {
        return isActiveAndEnabled && subscribed && connection != null &&
            connection.IsLobbyConnected && !connection.IsBusy && !operationPending &&
            connection.CurrentRoom == null;
    }

    private void RefreshInteraction(bool force = false)
    {
        bool enabled = CanRequest();
        if (!force && lastRequestsEnabled == enabled) return;
        lastRequestsEnabled = enabled;
        if (createRoomButton != null) createRoomButton.interactable = enabled;
        if (roomTitleInput != null) roomTitleInput.interactable = enabled;
        foreach (RoomListItemUI row in rows.Values)
            if (row != null) row.SetJoinEnabled(enabled);
        UpdateListSummary();
    }

    private bool IsCurrent(int requestGeneration)
    {
        return this != null && isActiveAndEnabled && generation == requestGeneration;
    }

    private void SetStatus(string message)
    {
        currentStatus = message ?? string.Empty;
        canShowListSummary = string.IsNullOrWhiteSpace(currentStatus) ||
        currentStatus == "Room list loaded." ||
        currentStatus == "Left the room.";
        if (statusText != null)
        {
            statusText.richText = false;
            statusText.text = currentStatus;
        }
        UpdateListSummary();
    }

    private void UpdateListSummary()
    {
        if (!canShowListSummary || connection == null || !connection.IsLobbyConnected ||
            connection.IsBusy || operationPending || connection.CurrentRoom != null) return;
        string summary = rows.Count == 0
            ? "No rooms available."
            : $"Rooms: {rows.Count}";
        if (currentStatus == summary) return;
        currentStatus = summary;
        if (statusText != null)
        {
            statusText.richText = false;
            statusText.text = summary;
        }
    }
}
