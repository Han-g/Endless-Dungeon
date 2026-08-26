using UnityEngine;
using UnityEngine.InputSystem;


[DisallowMultipleComponent]
[RequireComponent(typeof(PlayerHP))]
[RequireComponent(typeof(PlayerStats))]
public class PlayerAttack : MonoBehaviour
{
    [Header("References")]
    [SerializeField]
    private Camera mainCamera;

    [SerializeField]
    private Transform attackOrigin;

    [SerializeField, Min(1f)]
    private float networkAimSendRate = 20f;

    private NetworkManager networkManager;
    private bool networkControlled;
    private float nextNetworkSendTime;

    private PlayerHP playerHP;
    private PlayerStats stats;

    private Vector2 pointerScreenPosition;
    private Vector2 aimDirection = Vector2.right;

    private float nextAttackTime;

    private void Awake()
    {
        playerHP = GetComponent<PlayerHP>();
        stats = GetComponent<PlayerStats>();

        if (mainCamera == null)
        {
            mainCamera = Camera.main;
        }

        if (attackOrigin == null)
        {
            attackOrigin =
                transform.Find("AttackOrigin");
        }

        if (attackOrigin == null)
        {
            Debug.LogError(
                "Player 아래에서 AttackOrigin을 찾을 수 없습니다.",
                this);

            enabled = false;
        }
    }

    private void Start()
    {
        if (Mouse.current == null)
        {
            return;
        }

        pointerScreenPosition =
            Mouse.current.position.ReadValue();

        UpdateAimDirection();
    }

    private void Update()
    {
        UpdateAimDirection();

        if (networkControlled)
        {
            TrySendNetworkAttack();
            return;
        }

        TryAttack();
    }

    public void OnAim(InputValue value)
    {
        pointerScreenPosition =
            value.Get<Vector2>();
    }

    private void UpdateAimDirection()
    {
        if (mainCamera == null)
        {
            return;
        }

        float cameraDistance =
            Mathf.Abs(
                mainCamera.transform.position.z -
                transform.position.z);

        Vector3 screenPosition =
            new Vector3(
                pointerScreenPosition.x,
                pointerScreenPosition.y,
                cameraDistance);

        Vector3 mouseWorldPosition =
            mainCamera.ScreenToWorldPoint(
                screenPosition);

        Vector2 direction =
            (Vector2)mouseWorldPosition -
            (Vector2)attackOrigin.position;

        if (direction.sqrMagnitude < 0.0001f)
        {
            return;
        }

        aimDirection = direction.normalized;
    }

    private void TryAttack()
    {
        if (playerHP.IsDead)
        {
            return;
        }

        PlayerProjectile prefab =
            stats.ProjectilePrefab;

        if (prefab == null)
        {
            return;
        }

        if (Time.time < nextAttackTime)
        {
            return;
        }

        nextAttackTime =
            Time.time +
            1f / stats.AttacksPerSecond;

        Vector2 spawnPosition =
            (Vector2)attackOrigin.position +
            aimDirection *
            stats.SpawnDistance;

        float angle =
            Mathf.Atan2(
                aimDirection.y,
                aimDirection.x) *
            Mathf.Rad2Deg;

        angle +=
            stats.RotationOffset;

        PlayerProjectile projectile =
            Instantiate(
                prefab,
                spawnPosition,
                Quaternion.Euler(
                    0f,
                    0f,
                    angle));

        projectile.Initialize(
            aimDirection,
            stats.Damage,
            stats.ProjectileSpeed,
            stats.ProjectileRange,
            stats.Projectile.ProjectileSprite,
            stats.Projectile.ProjectileScale);
    }

    public void ConfigureNetworkMode(
    NetworkManager targetNetworkManager,
    bool isLocalPlayer)
    {
        networkManager =
            targetNetworkManager;

        networkControlled = true;

        enabled = isLocalPlayer;
    }

    private void TrySendNetworkAttack()
    {
        if (
            networkManager == null ||
            playerHP.IsDead)
        {
            return;
        }

        if (
            Time.unscaledTime <
            nextNetworkSendTime)
        {
            return;
        }

        nextNetworkSendTime =
            Time.unscaledTime +
            1f / networkAimSendRate;

        networkManager.SendAttackInput(
            aimDirection);
    }
}
