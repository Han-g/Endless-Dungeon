using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using Colyseus;
using UnityEngine;
using UnityEngine.SceneManagement;
using MyRoomState = EndlessDungeon.Network.Generated.MyRoomState;

// Attach to the MainMenuServices scene root, outside every menu panel.
[DefaultExecutionOrder(-200)]
[DisallowMultipleComponent]
public class RoomLobbyConnection : MonoBehaviour
{
    private const string WaitingRoomName = "waiting_room";
    [SerializeField] private string serverAddress = "ws://localhost:2567";

    private readonly Dictionary<string, LobbyRoomListing> listings = new();
    private Client client;
    private Room<NoState> lobby;
    private string connectionToken = string.Empty;
    private int epoch;
    private bool destroyed;
    private bool busy;
    private bool wantLobby;
    private bool retryingLobby;
    private int lobbyRetryCount;
    private float nextLobbyRetryAt = float.PositiveInfinity;
    private static readonly float[] LobbyRetryDelays = { 1f, 2f, 4f, 8f, 15f };

    public static RoomLobbyConnection Instance
    {
        get;
        private set;
    }

    [SerializeField]
    private string gameSceneName = "GamePlayScene";

    private bool gameSceneLoading;

    public bool IsGameTransitioning => gameSceneLoading;

    private readonly Dictionary<
        string,
        TaskCompletionSource<RoomCommandResult>>
        pendingCommands = new();

    public bool IsBusy => busy || pendingCommands.Count > 0;
    public bool IsLobbyConnected => IsLive(lobby) && lobby.Connection.IsOpen;
    public Room<MyRoomState> CurrentRoom { get; private set; }
    public IReadOnlyDictionary<string, LobbyRoomListing> Listings => listings;

    public event Action ListingsChanged;
    public event Action<string> StatusChanged;
    public event Action<Room<MyRoomState>> WaitingRoomJoined;
    public event Action<int> WaitingRoomLeft;
    public event Action<MyRoomState> WaitingStateChanged;

    private static string CurrentToken()
    {
        ClientSession session = ClientSession.Instance;
        return session != null && session.IsAuthenticated
            ? session.AccessToken : string.Empty;
    }

    private bool AuthMatches =>
        !destroyed && connectionToken.Length > 0 && connectionToken == CurrentToken();

    private bool IsLive<T>(Room<T> room) where T : Colyseus.Schema.Schema =>
        AuthMatches && room != null && room.Connection != null;

    private bool IsCurrent(int operation) => AuthMatches && operation == epoch;

    private void Awake()
    {
        if (
            GetComponent<GameSecneController>() != null ||
            transform.parent != null)
        {
            destroyed = true;
            enabled = false;

            Debug.LogError(
                "RoomLobbyConnection은 씬 최상위 " +
                "MainMenuServices에 분리해서 붙이세요.",
                this);

            return;
        }

        if (Instance != null && Instance != this)
        {
            destroyed = true;
            Destroy(gameObject);
            return;
        }

        Instance = this;

        DontDestroyOnLoad(gameObject);
    }

    private void Update()
    {
        if (connectionToken.Length > 0 && connectionToken != CurrentToken())
        {
            DropConnections(true);
            SetStatus("Please Try to Login again.");
        }
        if (wantLobby && !destroyed && CurrentRoom == null && !IsLobbyConnected &&
            !busy && !retryingLobby && CurrentToken().Length > 0 &&
            lobbyRetryCount < LobbyRetryDelays.Length && Time.unscaledTime >= nextLobbyRetryAt)
            _ = RetryLobbyAsync();
    }

    private bool Begin(out int operation)
    {
        operation = epoch;
        if (destroyed || busy) return false;
        string token = CurrentToken();
        if (token.Length == 0)
        {
            SetStatus("Please Try to Login again.");
            return false;
        }
        if (connectionToken.Length > 0 && connectionToken != token)
        {
            DropConnections(true);
            if (busy || destroyed) return false;
        }
        try
        {
            if (client == null)
            {
                if (!Uri.TryCreate(serverAddress, UriKind.Absolute, out Uri address) ||
                    (address.Scheme != "ws" && address.Scheme != "wss") ||
                    address.UserInfo.Length > 0 || address.Query.Length > 0 ||
                    address.Fragment.Length > 0)
                {
                    SetStatus("Check the server connection settings.");
                    return false;
                }
                client = new Client(serverAddress);
                client.Http.AuthToken = token; // Memory only; no Auth.SignIn or token persistence.
                connectionToken = token;
            }
            busy = true;
            operation = ++epoch;
            return true;
        }
        catch
        {
            SetStatus("Check the server connection settings.");
            return false;
        }
    }

    private void End(int operation)
    {
        if (!destroyed && operation == epoch) busy = false;
    }

    public async Task<bool> EnsureLobbyConnectedAsync()
    {
        if (destroyed) return false;
        if (!wantLobby || (!retryingLobby && lobbyRetryCount >= LobbyRetryDelays.Length))
            lobbyRetryCount = 0;
        wantLobby = true;
        if (IsLobbyConnected)
        {
            lobbyRetryCount = 0;
            nextLobbyRetryAt = float.PositiveInfinity;
            return true;
        }
        if (!Begin(out int operation))
        {
            ScheduleLobbyRetry();
            return false;
        }
        wantLobby = true; // Begin may have invalidated a previous account's connections.
        Room<NoState> joined = null;
        try
        {
            if (CurrentRoom != null)
            {
                wantLobby = false;
                SetStatus("Leave the room before entering the lobby.");
                return false;
            }
            SetStatus("Connecting to the lobby...");
            joined = await client.JoinOrCreate("lobby", new Dictionary<string, object>
            {
                ["filter"] = new Dictionary<string, object> { ["name"] = WaitingRoomName }
            });
            joined.Reconnection.Enabled = false;
            if (!IsCurrent(operation))
            {
                await LeaveSafely(joined);
                return false;
            }
            lobby = joined;
            BindLobby(joined);
            // LobbyRoom may send its initial snapshot before handlers exist.
            await joined.Send("filter", new Dictionary<string, object> { ["name"] = WaitingRoomName });
            if (!IsCurrent(operation) || lobby != joined) return false;
            lobbyRetryCount = 0;
            nextLobbyRetryAt = float.PositiveInfinity;
            SetStatus("Room list loaded.");
            return true;
        }
        catch
        {
            if (lobby == joined)
            {
                lobby = null;
                ClearListings();
            }
            await LeaveSafely(joined);
            if (IsCurrent(operation)) SetStatus("Failed to connect to the lobby.");
            return false;
        }
        finally
        {
            End(operation);
            if (operation == epoch) ScheduleLobbyRetry();
        }
    }

    private void ScheduleLobbyRetry()
    {
        if (destroyed || !wantLobby || retryingLobby || CurrentRoom != null ||
            IsLobbyConnected || CurrentToken().Length == 0) return;
        if (lobbyRetryCount >= LobbyRetryDelays.Length)
        {
            nextLobbyRetryAt = float.PositiveInfinity;
            SetStatus("Failed to connect to the lobby.");
            return;
        }
        nextLobbyRetryAt = Time.unscaledTime + LobbyRetryDelays[lobbyRetryCount];
    }

    private async Task RetryLobbyAsync()
    {
        retryingLobby = true;
        lobbyRetryCount++;
        try { await EnsureLobbyConnectedAsync(); }
        catch { SetStatus("Failed to connect to the lobby."); }
        finally
        {
            retryingLobby = false;
            ScheduleLobbyRetry();
        }
    }

    private void BindLobby(Room<NoState> source)
    {
        source.OnMessage<LobbyRoomListing[]>("rooms", rows =>
        {
            if (lobby != source || !IsLive(source)) return;
            listings.Clear();
            if (rows != null)
                foreach (LobbyRoomListing row in rows)
                    if (ValidListing(row)) listings[row.roomId] = row;
            ListingsChanged?.Invoke();
        });
        source.OnMessage<object[]>("+", message =>
        {
            if (lobby != source || !IsLive(source) || message == null ||
                message.Length != 2 || !(message[0] is string id) || !ValidId(id)) return;
            if (message[1] is IDictionary<string, object> data &&
                TryListing(id, data, out LobbyRoomListing row))
                listings[id] = row;
            else
                listings.Remove(id);
            ListingsChanged?.Invoke();
        });
        source.OnMessage<string>("-", id =>
        {
            if (lobby == source && IsLive(source) && ValidId(id) && listings.Remove(id))
                ListingsChanged?.Invoke();
        });
        source.OnLeave += _ =>
        {
            if (lobby != source || destroyed) return;
            lobby = null;
            ClearListings();
            SetStatus("Lobby disconnected. Reconnecting...");
            ScheduleLobbyRetry();
        };
        source.OnError += (_, __) =>
        {
            if (lobby == source && AuthMatches) SetStatus("Lobby connection error.");
        };
    }

    public Task<bool> CreateRoomAsync(string title)
    {
        title = (title ?? string.Empty).Trim();
        if (title.Length == 0 || title.Length > 32)
        {
            SetStatus("Room titles must be 1-32 characters.");
            return Task.FromResult(false);
        }
        return EnterWaitingRoomAsync(true, title);
    }

    public Task<bool> JoinRoomAsync(string id)
    {
        if (!ValidId(id) || !listings.TryGetValue(id, out LobbyRoomListing row) ||
            !ValidListing(row) || row.locked || row.clients >= row.maxClients ||
            row.metadata?.phase != "waiting")
        {
            SetStatus("Select an available room.");
            return Task.FromResult(false);
        }
        // The listing is a UI hint. The server validates the final admission.
        return EnterWaitingRoomAsync(false, id);
    }

    private async Task<bool> EnterWaitingRoomAsync(bool create, string value)
    {
        if (!Begin(out int operation)) return false;
        Room<MyRoomState> joined = null;
        try
        {
            if (CurrentRoom != null)
            {
                SetStatus("Already in a room.");
                return false;
            }
            SetStatus(create ? "Creating room..." : "Joining room...");
            var options = new Dictionary<string, object>
            {
                ["characterId"] = ClientSession.Instance.SelectedCharacterId
            };
            if (create) options["roomTitle"] = value;
            joined = create
                ? await client.Create<MyRoomState>(WaitingRoomName, options)
                : await client.JoinById<MyRoomState>(value, options);
            joined.Reconnection.Enabled = false;
            if (!IsCurrent(operation))
            {
                await LeaveSafely(joined);
                return false;
            }
            CurrentRoom = joined;
            wantLobby = false;
            nextLobbyRetryAt = float.PositiveInfinity;
            BindWaitingRoom(joined);
            Room<NoState> oldLobby = lobby;
            lobby = null;
            ClearListings();
            WaitingRoomJoined?.Invoke(joined);
            PublishState(joined, joined.State);
            // Only stop the lobby subscription; keep the waiting-room connection.
            await LeaveSafely(oldLobby);
            if (!IsCurrent(operation) || CurrentRoom != joined) return false;
            SetStatus("Joined the room.");
            return true;
        }
        catch
        {
            if (CurrentRoom == joined && joined != null)
            {
                CurrentRoom = null;
                ClientSession.Instance?.ClearRoom();
                WaitingRoomLeft?.Invoke(1000);
            }
            await LeaveSafely(joined);
            if (IsCurrent(operation)) SetStatus("Failed to create or join the room.");
            return false;
        }
        finally { End(operation); }
    }

    private void BindWaitingRoom(Room<MyRoomState> source)
    {
        gameSceneLoading = false;

        source.OnMessage<RoomCommandResult>(
            "room/result",
            result =>
            {
                if (
                    CurrentRoom != source ||
                    result == null ||
                    string.IsNullOrEmpty(result.requestId))
                {
                    return;
                }

                if (
                    pendingCommands.TryGetValue(
                        result.requestId,
                        out var pending))
                {
                    pending.TrySetResult(result);
                }
            });

        source.OnStateChange +=
            (state, _) => PublishState(source, state);

        source.OnLeave += code =>
        {
            if (CurrentRoom != source || destroyed)
            {
                return;
            }

            FailPendingCommands();

            gameSceneLoading = false;

            CurrentRoom = null;

            ClientSession.Instance?.ClearRoom();

            SetStatus("Left the room.");

            WaitingRoomLeft?.Invoke(code);
        };

        source.OnError += (_, __) =>
        {
            if (CurrentRoom == source && AuthMatches)
            {
                SetStatus("Check the room connection.");
            }
        };
    }

    private void PublishState(
    Room<MyRoomState> source,
    MyRoomState state)
    {
        if (
            CurrentRoom != source ||
            !IsLive(source) ||
            state == null)
        {
            return;
        }

        ClientSession session = ClientSession.Instance;

        session.SetRoom(
            source.RoomId,
            state.hostSessionId == source.SessionId);

        if (
            state.players != null &&
            state.players.TryGetValue(
                source.SessionId,
                out var player) &&
            player != null)
        {
            session.SetSelectedCharacter(player.characterId);
        }

        WaitingStateChanged?.Invoke(state);

        if (
            state.game != null &&
            (
                state.game.phase == "loading" ||
                state.game.phase == "playing"
            ) &&
            !gameSceneLoading &&
            SceneManager.GetActiveScene().name != gameSceneName)
        {
            _ = LoadGameSceneAsync(source);
        }
    }

    public async Task LeaveRoomAsync()
    {
        if (destroyed) return;

        FailPendingCommands();
        gameSceneLoading = false;

        int operation = ++epoch; // Also invalidates an in-flight create/join.
        busy = true;
        Room<MyRoomState> oldRoom = CurrentRoom;
        CurrentRoom = null;
        ClientSession.Instance?.ClearRoom();
        try { await LeaveSafely(oldRoom); }
        finally
        {
            if (!destroyed && operation == epoch)
            {
                busy = false;
                SetStatus("대기방에서 퇴장했습니다.");
                if (oldRoom != null) WaitingRoomLeft?.Invoke(1000);
            }
        }
    }

    public async Task SelectCharacterAsync(int id)
    {
        if (id < 1 || id > 4)
        {
            return;
        }

        await SendRoomCommandAsync(
            "room/character",
            new Dictionary<string, object>
            {
                ["characterId"] = id
            });
    }

    private void DropConnections(bool notify)
    {
        FailPendingCommands();
        gameSceneLoading = false;

        ++epoch;
        busy = false;
        wantLobby = false;
        lobbyRetryCount = 0;
        nextLobbyRetryAt = float.PositiveInfinity;
        Room<NoState> oldLobby = lobby;
        Room<MyRoomState> oldRoom = CurrentRoom;
        lobby = null;
        CurrentRoom = null;
        connectionToken = string.Empty;
        if (client != null) client.Http.AuthToken = string.Empty;
        client = null;
        ClientSession.Instance?.ClearRoom();
        listings.Clear();
        _ = LeaveSafely(oldLobby);
        _ = LeaveSafely(oldRoom);
        if (notify && !destroyed)
        {
            ListingsChanged?.Invoke();
            if (oldRoom != null) WaitingRoomLeft?.Invoke(1000);
        }
    }

    public bool TryGetGameRoom(
    out Room<MyRoomState> room)
    {
        room = CurrentRoom;

        return
            IsLive(room) &&
            room.Connection.IsOpen &&
            room.State?.game != null &&
            (
                room.State.game.phase == "loading" ||
                room.State.game.phase == "playing"
            );
    }

    public Task<bool> SetReadyAsync(
        bool ready,
        int characterId = 0)
    {
        if (ready && (characterId < 1 || characterId > 4))
        {
            return Task.FromResult(false);
        }

        return SendRoomCommandAsync(
            "room/ready",
            new Dictionary<string, object>
            {
                ["ready"] = ready,
                ["characterId"] = characterId
            });
    }

    public Task<bool> RequestStartAsync()
    {
        return SendRoomCommandAsync(
            "room/start",
            new Dictionary<string, object>());
    }

    public Task<bool> ReportGameLoadedAsync()
    {
        return SendRoomCommandAsync(
            "game/loaded",
            new Dictionary<string, object>());
    }

    private async Task<bool> SendRoomCommandAsync(
        string type,
        Dictionary<string, object> payload)
    {
        var source = CurrentRoom;

        if (
            destroyed ||
            !IsLive(source) ||
            !source.Connection.IsOpen)
        {
            SetStatus("Check the room connection.");
            return false;
        }

        string requestId = Guid.NewGuid().ToString("N");

        payload["requestId"] = requestId;

        var pending =
            new TaskCompletionSource<RoomCommandResult>(
                TaskCreationOptions.RunContinuationsAsynchronously);

        pendingCommands[requestId] = pending;

        try
        {
            await source.Send(type, payload);

            Task completed = await Task.WhenAny(
                pending.Task,
                Task.Delay(8000));

            if (completed != pending.Task)
            {
                SetStatus(
                    "Request timed out. Check your ready status and try again.");

                return false;
            }

            RoomCommandResult result = await pending.Task;

            if (CurrentRoom != source || !AuthMatches)
            {
                return false;
            }

            if (!result.ok)
            {
                SetStatus(CommandError(result.error));
            }

            return result.ok;
        }
        catch
        {
            SetStatus("Room request failed.");
            return false;
        }
        finally
        {
            pendingCommands.Remove(requestId);
        }
    }

    private void FailPendingCommands()
    {
        foreach (var pending in pendingCommands.Values)
        {
            pending.TrySetResult(
                new RoomCommandResult
                {
                    ok = false,
                    error = "DISCONNECTED"
                });
        }

        pendingCommands.Clear();
    }

    private static string CommandError(string error)
    {
        switch (error)
        {
            case "NOT_HOST":
                return "Only the host can start the game.";

            case "NOT_ALL_READY":
                return "All players must be ready.";

            case "INVALID_CHARACTER":
                return "Check your character selection.";

            case "NOT_WAITING":
                return "The game has already started or ended.";

            case "NOT_MEMBER":
                return "Check your room membership.";

            case "NOT_LOADING":
                return "Check the game loading status.";

            case "DISCONNECTED":
                return "Room connection closed.";

            default:
                return "Unable to apply the request.";
        }
    }

    private async Task LoadGameSceneAsync(
        Room<MyRoomState> source)
    {
        gameSceneLoading = true;

        await Task.Yield();

        if (CurrentRoom != source || !AuthMatches)
        {
            gameSceneLoading = false;
            return;
        }

        try
        {
            if (
                !Application.CanStreamedLevelBeLoaded(
                    gameSceneName))
            {
                throw new InvalidOperationException(
                    "GAME_SCENE_UNAVAILABLE");
            }

            AsyncOperation loading =
                SceneManager.LoadSceneAsync(gameSceneName);

            if (loading == null)
            {
                throw new InvalidOperationException(
                    "GAME_SCENE_UNAVAILABLE");
            }

            while (!loading.isDone)
            {
                await Task.Yield();
            }
        }
        catch
        {
            gameSceneLoading = false;

            SetStatus(
                "Add GamePlayScene to the Build Profiles Scene List.");

            await LeaveRoomAsync();
        }
    }

    private static async Task LeaveSafely(IRoom room)
    {
        if (room == null) return;
        try { await room.Leave(true); }
        catch { /* Best-effort cleanup; never log authentication-bearing exceptions. */ }
    }

    private void ClearListings()
    {
        listings.Clear();
        if (!destroyed) ListingsChanged?.Invoke();
    }

    private void SetStatus(string message)
    {
        if (!destroyed) StatusChanged?.Invoke(message);
    }

    private void OnDestroy()
    {
        if (Instance != this)
        {
            return;
        }

        destroyed = true;

        DropConnections(false);

        Instance = null;
    }

    private static bool ValidId(string id) =>
        !string.IsNullOrEmpty(id) && id.Length <= 128 &&
        Regex.IsMatch(id, "^[A-Za-z0-9_-]+$");

    private static bool ValidListing(LobbyRoomListing row)
    {
        if (row == null || !ValidId(row.roomId) || row.name != WaitingRoomName ||
            row.clients < 0 || row.maxClients <= 0 ||
            double.IsNaN(row.maxClients) || double.IsInfinity(row.maxClients)) return false;
        row.metadata ??= new LobbyRoomMetadata { title = row.roomId, phase = string.Empty };
        return true;
    }

    private static bool TryListing(string id, IDictionary<string, object> data, out LobbyRoomListing row)
    {
        row = null;
        if (data.TryGetValue("roomId", out object embeddedId) && !Equals(embeddedId, id)) return false;
        if (!data.TryGetValue("name", out object name) || !(name is string roomName) ||
            !data.TryGetValue("clients", out object count) || !TryNumber(count, out double clients) ||
            clients < 0 || clients > int.MaxValue || clients != Math.Truncate(clients) ||
            !data.TryGetValue("maxClients", out object maximum) || !TryNumber(maximum, out double max))
            return false;
        var metadata = new LobbyRoomMetadata();
        if (data.TryGetValue("metadata", out object rawMetadata) &&
            rawMetadata is IDictionary<string, object> fields)
        {
            if (fields.TryGetValue("title", out object title)) metadata.title = title as string;
            if (fields.TryGetValue("phase", out object phase)) metadata.phase = phase as string;
        }
        row = new LobbyRoomListing
        {
            roomId = id, name = roomName, clients = (int)clients, maxClients = max,
            locked = data.TryGetValue("locked", out object locked) && locked is bool value && value,
            metadata = metadata
        };
        return ValidListing(row);
    }

    private static bool TryNumber(object input, out double number)
    {
        number = 0;
        if (!(input is IConvertible) || input is string || input is bool || input is char) return false;
        try
        {
            number = Convert.ToDouble(input, CultureInfo.InvariantCulture);
            return !double.IsNaN(number) && !double.IsInfinity(number);
        }
        catch { return false; }
    }
}

[Serializable]
public class LobbyRoomListing
{
    public string roomId, name;
    public int clients;
    public double maxClients;
    public bool locked;
    public LobbyRoomMetadata metadata;
}

[Serializable]
public class LobbyRoomMetadata
{
    public string title, phase;
}

[Serializable]
public sealed class RoomCommandResult
{
    public string requestId;

    public bool ok;

    public string error;
}