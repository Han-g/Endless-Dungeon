using System.Collections.Generic;
using UnityEngine;

using NetworkEnemyState =
    EndlessDungeon.Network.Generated.EnemyState;

[DisallowMultipleComponent]
public sealed class NetworkEnemyRegistry :
    MonoBehaviour
{
    [Header("References")]
    [SerializeField]
    private NetworkManager networkManager;

    [SerializeField]
    private NetworkEnemyView enemyPrefab;

    [SerializeField]
    private Transform enemyContainer;

    [Header("Enemy Definitions")]
    [SerializeField]
    private EnemyDefinition[] enemyDefinitions;

    private readonly Dictionary<
        int,
        EnemyDefinition> definitionsById =
        new();

    private readonly Dictionary<
        string,
        NetworkEnemyView> enemyViews =
        new();

    private void Awake()
    {
        if (enemyContainer == null)
        {
            enemyContainer = transform;
        }

        BuildDefinitionDictionary();
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

        networkManager.EnemyAdded +=
            HandleEnemyAdded;

        networkManager.EnemyChanged +=
            HandleEnemyChanged;

        networkManager.EnemyRemoved +=
            HandleEnemyRemoved;

        networkManager.RoomLeft +=
            HandleRoomLeft;

        SynchronizeCurrentEnemies();
    }

    private void OnDisable()
    {
        if (networkManager != null)
        {
            networkManager.EnemyAdded -=
                HandleEnemyAdded;

            networkManager.EnemyChanged -=
                HandleEnemyChanged;

            networkManager.EnemyRemoved -=
                HandleEnemyRemoved;

            networkManager.RoomLeft -=
                HandleRoomLeft;
        }

        ClearAllEnemies();
    }

    private void BuildDefinitionDictionary()
    {
        definitionsById.Clear();

        if (enemyDefinitions == null)
        {
            return;
        }

        foreach (
            EnemyDefinition definition
            in enemyDefinitions)
        {
            if (definition == null)
            {
                continue;
            }

            if (
                definitionsById.ContainsKey(
                    definition.TypeId)
            )
            {
                Debug.LogWarning(
                    $"Enemy TypeId " +
                    $"{definition.TypeId}가 " +
                    "중복되었습니다.",
                    definition);

                continue;
            }

            definitionsById.Add(
                definition.TypeId,
                definition);
        }
    }

    private void SynchronizeCurrentEnemies()
    {
        if (
            networkManager.State == null ||
            networkManager.State.enemies == null
        )
        {
            return;
        }

        networkManager.State.enemies.ForEach(
            (enemyId, enemyState) =>
            {
                HandleEnemyAdded(
                    enemyId,
                    enemyState);
            });
    }

    private void HandleEnemyAdded(
        string enemyId,
        NetworkEnemyState enemyState)
    {
        if (enemyState == null)
        {
            return;
        }

        if (enemyViews.TryGetValue(
                enemyId,
                out NetworkEnemyView existingView))
        {
            if (existingView != null)
            {
                existingView.ApplyState(
                    enemyState,
                    true);
            }

            return;
        }

        if (enemyPrefab == null)
        {
            Debug.LogError(
                "Network Enemy 프리팹이 " +
                "지정되지 않았습니다.",
                this);

            return;
        }

        int typeId = enemyState.typeId;

        if (!definitionsById.TryGetValue(
                typeId,
                out EnemyDefinition definition))
        {
            Debug.LogError(
                $"Enemy TypeId {typeId}에 " +
                "해당하는 EnemyDefinition이 없습니다.",
                this);

            return;
        }

        Vector3 spawnPosition =
            new Vector3(
                enemyState.x,
                enemyState.y,
                0f);

        NetworkEnemyView view =
            Instantiate(
                enemyPrefab,
                spawnPosition,
                Quaternion.identity,
                enemyContainer);

        view.Initialize(
            enemyId,
            enemyState,
            definition);

        enemyViews.Add(
            enemyId,
            view);

        Debug.Log(
            $"네트워크 적 생성: {enemyId}, " +
            $"TypeId: {typeId}");
    }

    private void HandleEnemyChanged(
        string enemyId,
        NetworkEnemyState enemyState)
    {
        if (!enemyViews.TryGetValue(
                enemyId,
                out NetworkEnemyView view))
        {
            HandleEnemyAdded(
                enemyId,
                enemyState);

            return;
        }

        if (view != null)
        {
            view.ApplyState(
                enemyState,
                false);
        }
    }

    private void HandleEnemyRemoved(
        string enemyId,
        NetworkEnemyState enemyState)
    {
        if (!enemyViews.TryGetValue(
                enemyId,
                out NetworkEnemyView view))
        {
            return;
        }

        enemyViews.Remove(enemyId);

        if (view != null)
        {
            Destroy(view.gameObject);
        }

        Debug.Log(
            $"네트워크 적 제거: {enemyId}");
    }

    private void HandleRoomLeft(int code)
    {
        ClearAllEnemies();
    }

    private void ClearAllEnemies()
    {
        foreach (
            NetworkEnemyView view
            in enemyViews.Values)
        {
            if (view != null)
            {
                Destroy(view.gameObject);
            }
        }

        enemyViews.Clear();
    }
}