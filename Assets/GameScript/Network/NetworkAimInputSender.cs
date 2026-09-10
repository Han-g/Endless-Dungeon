using UnityEngine;
using UnityEngine.InputSystem;

[DisallowMultipleComponent]
public sealed class NetworkAimInputSender :
    MonoBehaviour
{
    [Header("References")]
    [SerializeField]
    private Camera mainCamera;

    [SerializeField]
    private Transform attackOrigin;

    [Header("Network")]
    [SerializeField, Min(1f)]
    private float sendRate = 20f;

    private NetworkManager networkManager;
    private NetworkPlayerView playerView;

    private Vector2 pointerScreenPosition;
    private Vector2 aimDirection = Vector2.right;

    private float nextSendTime;
    private bool initialized;

    private void Awake()
    {
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

    public void Initialize(
        NetworkManager targetNetworkManager,
        NetworkPlayerView targetPlayerView,
        bool isLocalPlayer)
    {
        networkManager =
            targetNetworkManager;

        playerView =
            targetPlayerView;

        initialized =
            isLocalPlayer &&
            networkManager != null &&
            playerView != null;

        enabled = initialized;
    }

    public void OnAim(InputValue value)
    {
        pointerScreenPosition =
            value.Get<Vector2>();
    }

    private void Update()
    {
        if (
            !initialized ||
            networkManager == null ||
            playerView == null ||
            !playerView.IsAlive)
        {
            return;
        }

        UpdateAimDirection();

        if (
            Time.unscaledTime <
            nextSendTime)
        {
            return;
        }

        nextSendTime =
            Time.unscaledTime +
            1f / sendRate;

        networkManager.SendAttackInput(
            aimDirection);
    }

    private void UpdateAimDirection()
    {
        if (
            mainCamera == null ||
            attackOrigin == null)
        {
            return;
        }

        float cameraDistance =
            Mathf.Abs(
                mainCamera.transform.position.z -
                attackOrigin.position.z);

        Vector3 screenPosition =
            new Vector3(
                pointerScreenPosition.x,
                pointerScreenPosition.y,
                cameraDistance);

        Vector3 pointerWorldPosition =
            mainCamera.ScreenToWorldPoint(
                screenPosition);

        Vector2 direction =
            (Vector2)pointerWorldPosition -
            (Vector2)attackOrigin.position;

        if (
            direction.sqrMagnitude <
            0.0001f)
        {
            return;
        }

        aimDirection =
            direction.normalized;
    }
}