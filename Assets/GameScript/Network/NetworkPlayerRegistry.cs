using System.Collections.Generic;
using UnityEngine;

using NetworkPlayerState = EndlessDungeon.Network.Generated.PlayerState;

[DisallowMultipleComponent]
public sealed class NetworkPlayerRegistry :
    MonoBehaviour
{
    [Header("References")]
    [SerializeField]
    private NetworkManager networkManager;

    [SerializeField]
    private NetworkPlayerView playerPrefab;

    [SerializeField]
    private Transform playerContainer;

    [SerializeField]
    private CameraFollow cameraFollow;

    private readonly Dictionary<
        string,
        NetworkPlayerView> playerViews = new();

    private void Awake()
    {
        if (playerContainer == null)
        {
            playerContainer = transform;
        }
    }

    private void OnEnable()
    {
        if (networkManager == null)
        {
            Debug.LogError(
                "NetworkManager가 지정되지 않았습니다.",
                this);

            enabled = false;
            return;
        }

        // 이벤트 구독
        networkManager.PlayerAdded +=
            HandlePlayerAdded;

        networkManager.PlayerChanged +=
            HandlePlayerChanged;

        networkManager.PlayerRemoved +=
            HandlePlayerRemoved;

        networkManager.RoomLeft +=
            HandleRoomLeft;

        // NetworkManager가 이미 방에 참가한 뒤
        // Registry가 활성화된 경우를 처리한다.
        SynchronizeCurrentPlayers();
    }

    private void OnDisable()
    {
        if (networkManager != null)
        {
            // 이벤트 구독 해제
            networkManager.PlayerAdded -=
                HandlePlayerAdded;

            networkManager.PlayerChanged -=
                HandlePlayerChanged;

            networkManager.PlayerRemoved -=
                HandlePlayerRemoved;

            networkManager.RoomLeft -=
                HandleRoomLeft;
        }

        ClearAllPlayers();
    }

    private void SynchronizeCurrentPlayers()
    {
        if (networkManager.State == null ||
            networkManager.State.players == null)
        {
            return;
        }

        networkManager.State.players.ForEach(
            (sessionId, playerState) =>
            {
                bool isLocalPlayer =
                    sessionId ==
                    networkManager.LocalSessionId;

                HandlePlayerAdded(
                    sessionId,
                    playerState,
                    isLocalPlayer);
            });
    }

    private void HandlePlayerAdded(
        string sessionId,
        NetworkPlayerState playerState,
        bool isLocalPlayer)
    {
        if (playerPrefab == null)
        {
            Debug.LogError(
                "Player 프리팹이 지정되지 않았습니다.",
                this);

            return;
        }

        // OnAdd 재호출이나 재동기화로 인한
        // 중복 생성을 방지한다.
        if (playerViews.TryGetValue(
                sessionId,
                out NetworkPlayerView existingView))
        {
            existingView.ApplyState(
                playerState,
                true);

            return;
        }

        Vector3 spawnPosition = new Vector3(
            playerState.x,
            playerState.y,
            0f);

        NetworkPlayerView view = Instantiate(
            playerPrefab,
            spawnPosition,
            Quaternion.identity,
            playerContainer);

        view.Initialize(
            networkManager,
            sessionId,
            isLocalPlayer,
            playerState);

        playerViews.Add(
            sessionId,
            view);

        if (isLocalPlayer &&
            cameraFollow != null)
        {
            cameraFollow.SetTarget(
                view.transform);
        }

        Debug.Log(
            $"플레이어 생성: {sessionId}, " +
            $"Local: {isLocalPlayer}");
    }

    private void HandlePlayerChanged(
        string sessionId,
        NetworkPlayerState playerState)
    {
        if (!playerViews.TryGetValue(
                sessionId,
                out NetworkPlayerView view))
        {
            // 추가 이벤트를 놓친 경우 복구
            HandlePlayerAdded(
                sessionId,
                playerState,
                sessionId ==
                networkManager.LocalSessionId);

            return;
        }

        view.ApplyState(
            playerState,
            false);
    }

    private void HandlePlayerRemoved(
        string sessionId,
        NetworkPlayerState playerState)
    {
        if (!playerViews.TryGetValue(
                sessionId,
                out NetworkPlayerView view))
        {
            return;
        }

        playerViews.Remove(sessionId);

        if (view != null)
        {
            Destroy(view.gameObject);
        }

        Debug.Log(
            $"플레이어 제거: {sessionId}");
    }

    private void HandleRoomLeft(int code)
    {
        ClearAllPlayers();
    }

    private void ClearAllPlayers()
    {
        foreach (NetworkPlayerView view
                 in playerViews.Values)
        {
            if (view != null)
            {
                Destroy(view.gameObject);
            }
        }

        playerViews.Clear();
    }
}