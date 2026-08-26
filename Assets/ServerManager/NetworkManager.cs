using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Colyseus;
using Colyseus.Schema;
using UnityEngine;

using NetworkRoomState =
    EndlessDungeon.Network.Generated.MyRoomState;

using NetworkGameState =
    EndlessDungeon.Network.Generated.GameState;

using NetworkPlayerState =
    EndlessDungeon.Network.Generated.PlayerState;

using NetworkEnemyState =
    EndlessDungeon.Network.Generated.EnemyState;

using NetworkProjectileState =
    EndlessDungeon.Network.Generated.ProjectileState;

[DisallowMultipleComponent]
public class NetworkManager : MonoBehaviour
{
    [Header("Connection")]
    [SerializeField]
    private string serverAddress =
        "ws://localhost:2567";

    [SerializeField]
    private string roomName = "my_room";

    [SerializeField]
    private string playerName = "Player";

    [SerializeField]
    private bool connectOnStart = true;

    private Client client;
    private Room<NetworkRoomState> room;

    private StateCallbackStrategy<NetworkRoomState>
        callbacks;

    private readonly List<Action> rootBindings = new();

    private readonly Dictionary<string, Action>
        playerBindings = new();

    private readonly Dictionary<string, Action>
        enemyBindings = new();

    private readonly Dictionary<string, Action>
    projectileBindings = new();

    private bool isConnecting;

    public bool IsConnected => room != null;
    public bool IsConnecting => isConnecting;

    public string RoomId =>
        room != null ? room.RoomId : string.Empty;

    public string LocalSessionId =>
        room != null ? room.SessionId : string.Empty;

    public NetworkRoomState State =>
        room != null ? room.State : null;

    public event Action<string, string> RoomJoined;
    public event Action<int> RoomLeft;
    public event Action<string> ConnectionFailed;

    public event Action<NetworkRoomState>
        RoomInfoChanged;

    public event Action<NetworkGameState>
        GameStateChanged;

    public event Action<
        string,
        NetworkPlayerState,
        bool> PlayerAdded;

    public event Action<
        string,
        NetworkPlayerState> PlayerChanged;

    public event Action<
        string,
        NetworkPlayerState> PlayerRemoved;

    public event Action<
        string,
        NetworkEnemyState> EnemyAdded;

    public event Action<
        string,
        NetworkEnemyState> EnemyChanged;

    public event Action<
        string,
        NetworkEnemyState> EnemyRemoved;

    public event Action<
    string,
    NetworkProjectileState> ProjectileAdded;

    public event Action<
        string,
        NetworkProjectileState> ProjectileChanged;

    public event Action<
        string,
        NetworkProjectileState> ProjectileRemoved;

    private async void Start()
    {
        if (connectOnStart)
        {
            await JoinRoomAsync();
        }
    }

    public async Task JoinRoomAsync()
    {
        if (room != null || isConnecting)
        {
            return;
        }

        isConnecting = true;

        try
        {
            if (client == null)
            {
                client = new Client(serverAddress);
            }

            int selectedCharacterId = ClientSession.Instance != null
                ? ClientSession.Instance.SelectedCharacterId: 1;

            Dictionary<string, object> options = new()
            {
                ["playerName"] = playerName,
                ["characterId"] = selectedCharacterId
            };

            room =
                await client.JoinOrCreate<
                    NetworkRoomState>(
                    roomName,
                    options);

            room.OnLeave += HandleRoomLeft;
            room.OnError += HandleRoomError;

            BindStateCallbacks();

            RoomJoined?.Invoke(
                room.RoomId,
                room.SessionId);

            Debug.Log(
                $"방 참가 완료: {room.RoomId}, " +
                $"Session: {room.SessionId}");
        }
        catch (Exception exception)
        {
            Room<NetworkRoomState> failedRoom = room;

            ClearRoom();

            if (failedRoom != null)
            {
                await failedRoom.Leave();
            }

            ConnectionFailed?.Invoke(
                exception.Message);

            Debug.LogException(exception, this);
        }
        finally
        {
            isConnecting = false;
        }
    }

    private void BindStateCallbacks()
    {
        callbacks = Callbacks.Get(room);

        rootBindings.Add(
            callbacks.Listen(
                state => state.game.phase,
                (currentValue, previousValue) =>
                {
                    RaiseGameStateChanged();
                }));

        rootBindings.Add(
            callbacks.Listen(
                state => state.game.elapsedSeconds,
                (currentValue, previousValue) =>
                {
                    RaiseGameStateChanged();
                }));

        rootBindings.Add(
            callbacks.Listen(
                state => state.game.killCount,
                (currentValue, previousValue) =>
                {
                    RaiseGameStateChanged();
                }));

        rootBindings.Add(
            callbacks.Listen(
                state => state.game.seed,
                (currentValue, previousValue) =>
                {
                    RaiseGameStateChanged();
                }));

        rootBindings.Add(
            callbacks.Listen(
                state => state.hostSessionId,
                (currentValue, previousValue) =>
                {
                    RoomInfoChanged?.Invoke(
                        room.State);
                }));

        rootBindings.Add(
            callbacks.OnAdd(
                state => state.players,
                HandlePlayerAdded));

        rootBindings.Add(
            callbacks.OnRemove(
                state => state.players,
                HandlePlayerRemoved));

        rootBindings.Add(
            callbacks.OnAdd(
                state => state.enemies,
                HandleEnemyAdded));

        rootBindings.Add(
            callbacks.OnRemove(
                state => state.enemies,
                HandleEnemyRemoved));

        rootBindings.Add(
            callbacks.OnAdd(
                state => state.projectiles,
                HandleProjectileAdded));

        rootBindings.Add(
            callbacks.OnRemove(
                state => state.projectiles,
                HandleProjectileRemoved));

        // OnChange는 등록 직후 현재 값을 호출하지 않으므로
        // 현재 상태를 한 번 직접 알린다.
        RoomInfoChanged?.Invoke(room.State);
        RaiseGameStateChanged();
    }

    private void RaiseGameStateChanged()
    {
        if (room == null ||
            room.State == null ||
            room.State.game == null)
        {
            return;
        }

        GameStateChanged?.Invoke(
            room.State.game);
    }

    private void HandlePlayerAdded(
        string sessionId,
        NetworkPlayerState player)
    {
        RemovePlayerBinding(sessionId);

        bool isLocalPlayer =
            sessionId == room.SessionId;

        PlayerAdded?.Invoke(
            sessionId,
            player,
            isLocalPlayer);

        playerBindings[sessionId] =
            callbacks.OnChange(
                player,
                () =>
                {
                    PlayerChanged?.Invoke(
                        sessionId,
                        player);
                });
    }

    private void HandlePlayerRemoved(
        string sessionId,
        NetworkPlayerState player)
    {
        RemovePlayerBinding(sessionId);

        PlayerRemoved?.Invoke(
            sessionId,
            player);
    }

    private void HandleEnemyAdded(
        string enemyId,
        NetworkEnemyState enemy)
    {
        RemoveEnemyBinding(enemyId);

        EnemyAdded?.Invoke(enemyId, enemy);

        enemyBindings[enemyId] =
            callbacks.OnChange(
                enemy,
                () =>
                {
                    EnemyChanged?.Invoke(
                        enemyId,
                        enemy);
                });
    }

    private void HandleEnemyRemoved(
        string enemyId,
        NetworkEnemyState enemy)
    {
        RemoveEnemyBinding(enemyId);

        EnemyRemoved?.Invoke(
            enemyId,
            enemy);
    }

    public void SendMoveInput(
        Vector2 direction,
        uint sequence)
    {
        if (room == null)
        {
            return;
        }

        direction =
            Vector2.ClampMagnitude(
                direction,
                1f);

        _ = room.Send(
            "input/move",
            new MoveInputMessage
            {
                x = direction.x,
                y = direction.y,
                sequence = sequence
            });
    }

    public void SendAttackInput(
        Vector2 aimDirection)
    {
        if (room == null)
        {
            return;
        }

        aimDirection =
            Vector2.ClampMagnitude(
                aimDirection,
                1f);

        _ = room.Send(
            "input/attack",
            new AttackInputMessage
            {
                aimX = aimDirection.x,
                aimY = aimDirection.y
            });
    }

    public async Task LeaveRoomAsync()
    {
        if (room != null)
        {
            await room.Leave();
        }
    }

    private void HandleRoomLeft(int code)
    {
        ClearRoom();
        RoomLeft?.Invoke(code);

        Debug.Log($"방 연결 종료: {code}");
    }

    private void HandleRoomError(
        int code,
        string message)
    {
        ConnectionFailed?.Invoke(message);

        Debug.LogError(
            $"Room error {code}: {message}",
            this);
    }

    private void RemovePlayerBinding(
        string sessionId)
    {
        if (!playerBindings.TryGetValue(
                sessionId,
                out Action unbind))
        {
            return;
        }

        unbind?.Invoke();
        playerBindings.Remove(sessionId);
    }

    private void RemoveEnemyBinding(
        string enemyId)
    {
        if (!enemyBindings.TryGetValue(
                enemyId,
                out Action unbind))
        {
            return;
        }

        unbind?.Invoke();
        enemyBindings.Remove(enemyId);
    }

    private void ClearRoom()
    {
        foreach (Action unbind in rootBindings)
        {
            unbind?.Invoke();
        }

        rootBindings.Clear();

        foreach (Action unbind
                 in playerBindings.Values)
        {
            unbind?.Invoke();
        }

        playerBindings.Clear();

        foreach (Action unbind
                 in enemyBindings.Values)
        {
            unbind?.Invoke();
        }

        enemyBindings.Clear();

        foreach (Action unbind
         in projectileBindings.Values)
        {
            unbind?.Invoke();
        }

        projectileBindings.Clear();

        if (room != null)
        {
            room.OnLeave -= HandleRoomLeft;
            room.OnError -= HandleRoomError;
        }

        callbacks = null;
        room = null;
    }

    private void HandleProjectileAdded(
    string projectileId,
    NetworkProjectileState projectile)
    {
        RemoveProjectileBinding(projectileId);

        ProjectileAdded?.Invoke(
            projectileId,
            projectile);

        projectileBindings[projectileId] =
            callbacks.OnChange(
                projectile,
                () =>
                {
                    ProjectileChanged?.Invoke(
                        projectileId,
                        projectile);
                });
    }

    private void HandleProjectileRemoved(
        string projectileId,
        NetworkProjectileState projectile)
    {
        RemoveProjectileBinding(projectileId);

        ProjectileRemoved?.Invoke(
            projectileId,
            projectile);
    }

    private void RemoveProjectileBinding(
        string projectileId)
    {
        if (!projectileBindings.TryGetValue(
                projectileId,
                out Action unbind))
        {
            return;
        }

        unbind?.Invoke();

        projectileBindings.Remove(
            projectileId);
    }

    private void OnDestroy()
    {
        Room<NetworkRoomState> currentRoom = room;

        ClearRoom();

        if (currentRoom != null)
        {
            _ = currentRoom.Leave();
        }
    }
}

[Serializable]
public sealed class MoveInputMessage
{
    public float x;
    public float y;
    public uint sequence;
}

[Serializable]
public sealed class AttackInputMessage
{
    public float aimX;
    public float aimY;
}