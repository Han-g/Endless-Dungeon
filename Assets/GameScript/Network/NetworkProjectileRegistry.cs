using System.Collections.Generic;
using UnityEngine;

using NetworkProjectileState =
    EndlessDungeon.Network.Generated.ProjectileState;

public sealed class NetworkProjectileRegistry :
    MonoBehaviour
{
    [SerializeField]
    private NetworkManager networkManager;

    [SerializeField]
    private NetworkProjectileView projectilePrefab;

    [SerializeField]
    private Transform projectileContainer;

    [SerializeField]
    private ProjectileDefinition[]
    projectileDefinitions;

    private readonly Dictionary<
        int,
        ProjectileDefinition>
        definitionsById = new();

    private readonly Dictionary<
        string,
        NetworkProjectileView> views = new();

    private void Awake()
    {
        if (projectileContainer == null)
        {
            projectileContainer = transform;
        }

        definitionsById.Clear();

        foreach (ProjectileDefinition definition
                 in projectileDefinitions)
        {
            if (definition == null)
            {
                continue;
            }

            definitionsById[
                definition.ProjectileId] =
                definition;
        }
    }

    private void OnEnable()
    {
        networkManager.ProjectileAdded +=
            HandleAdded;

        networkManager.ProjectileChanged +=
            HandleChanged;

        networkManager.ProjectileRemoved +=
            HandleRemoved;

        networkManager.RoomLeft +=
            HandleRoomLeft;
    }

    private void OnDisable()
    {
        if (networkManager != null)
        {
            networkManager.ProjectileAdded -=
                HandleAdded;

            networkManager.ProjectileChanged -=
                HandleChanged;

            networkManager.ProjectileRemoved -=
                HandleRemoved;

            networkManager.RoomLeft -=
                HandleRoomLeft;
        }

        Clear();
    }

    private void HandleAdded(
        string projectileId,
        NetworkProjectileState state)
    {
        if (!definitionsById.TryGetValue(
        state.projectileTypeId,
        out ProjectileDefinition definition))
        {
            Debug.LogError(
                $"Projectile ID {state.projectileTypeId}에 " +
                "해당하는 Definition이 없습니다.",
                this);

            return;
        }

        if (
            projectilePrefab == null ||
            views.ContainsKey(projectileId))
        {
            return;
        }

        NetworkProjectileView view =
            Instantiate(
                projectilePrefab,
                projectileContainer);

        view.name =
            $"Projectile_{projectileId}";

        bool isLocalProjectile = 
            state.ownerSessionId == networkManager.LocalSessionId;

        view.Initialize(
            state,
            definition,
            isLocalProjectile);

        views.Add(projectileId, view);
    }

    private void HandleChanged(
        string projectileId,
        NetworkProjectileState state)
    {
        if (!views.TryGetValue(
                projectileId,
                out NetworkProjectileView view))
        {
            HandleAdded(projectileId, state);
            return;
        }

        view.ApplyState(state, false);
    }

    private void HandleRemoved(
        string projectileId,
        NetworkProjectileState state)
    {
        if (!views.Remove(
                projectileId,
                out NetworkProjectileView view))
        {
            return;
        }

        if (view != null)
        {
            Destroy(view.gameObject);
        }
    }

    private void HandleRoomLeft(int code)
    {
        Clear();
    }

    private void Clear()
    {
        foreach (
            NetworkProjectileView view
            in views.Values)
        {
            if (view != null)
            {
                Destroy(view.gameObject);
            }
        }

        views.Clear();
    }
}