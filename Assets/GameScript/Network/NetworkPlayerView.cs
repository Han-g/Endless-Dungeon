using UnityEngine;
using UnityEngine.InputSystem;

using NetworkPlayerState = EndlessDungeon.Network.Generated.PlayerState;

[DisallowMultipleComponent]
[RequireComponent(typeof(Rigidbody2D))]
public sealed class NetworkPlayerView : MonoBehaviour
{
    // 이동 관련 변수
    [SerializeField, Min(1f)]
    private float positionLerpSpeed = 15f;

    [SerializeField, Min(1f)]
    private float inputSendRate = 20f;

    private NetworkManager networkManager;

    private float inputSendAccumulator;
    private uint inputSequence;
    private Vector2 lastSentDirection;
    private bool hasSentInput;

    private Rigidbody2D body;
    private PlayerInput playerInput;
    private CharacterMove characterMove;
    private NetworkAimInputSender aimInputSender;

    private PlayerOutline playerOutline;
    private PlayerAnimationController playerAnimation;

    private Vector2 targetPosition;
    private bool initialized;

    public bool IsInitialized => initialized;

    public string SessionId
    {
        get;
        private set;
    }

    public bool IsLocalPlayer
    {
        get;
        private set;
    }

    public int CurrentHp
    {
        get;
        private set;
    }

    public int MaxHp
    {
        get;
        private set;
    }

    public bool IsAlive
    {
        get;
        private set;
    }

    public Vector2 NetworkVelocity
    {
        get;
        private set;
    }

    private void Awake()
    {
        body = GetComponent<Rigidbody2D>();
        playerInput = GetComponent<PlayerInput>();
        characterMove = GetComponent<CharacterMove>();
        aimInputSender = GetComponent<NetworkAimInputSender>();
        playerOutline = GetComponentInChildren<PlayerOutline>(true);
        playerAnimation = GetComponentInChildren<PlayerAnimationController>(true);
    }

    public void Initialize(
        NetworkManager networkManager,
        string sessionId,
        bool isLocalPlayer,
        NetworkPlayerState initialState)
    {
        this.networkManager = networkManager;

        SessionId = sessionId;
        IsLocalPlayer = isLocalPlayer;

        if (playerOutline != null)
        {
            playerOutline.Configure(isLocalPlayer);
        }

        gameObject.name =
            isLocalPlayer
                ? $"LocalPlayer_{sessionId}"
                : $"RemotePlayer_{sessionId}";

        if (aimInputSender != null)
        {
            aimInputSender.Initialize(
                networkManager,
                this,
                isLocalPlayer);
        }

        if (playerInput != null)
        {
            playerInput.enabled = isLocalPlayer;
        }

        if (characterMove != null)
        {
            characterMove.enabled = isLocalPlayer;
        }

        // 클라이언트 물리 충돌로 서버 위치가
        // 달라지는 것을 방지한다.
        body.bodyType =
            RigidbodyType2D.Kinematic;

        body.linearVelocity =
            Vector2.zero;

        ApplyState(
            initialState,
            true);

        initialized = true;
    }

    public void ApplyState(
        NetworkPlayerState state,
        bool snapImmediately)
    {
        if (state == null)
        {
            return;
        }

        targetPosition = new Vector2(
            state.x,
            state.y);

        CurrentHp = state.hp;
        MaxHp = state.maxHp;
        IsAlive = state.alive;
        if (playerAnimation != null)
            playerAnimation.ApplyAppearance(state.characterId);

        NetworkVelocity = IsAlive ? new Vector2(
            state.velocityX,
            state.velocityY) : Vector2.zero;

        if (snapImmediately ||
            !initialized)
        {
            body.position =
                targetPosition;
        }

        if (IsLocalPlayer &&
            playerInput != null)
        {
            playerInput.enabled =
                IsAlive;
        }
    }

    private void Update()
    {
        if (
            !initialized ||
            !IsLocalPlayer ||
            !IsAlive ||
            networkManager == null ||
            characterMove == null)
        {
            return;
        }

        Vector2 direction =
            Vector2.ClampMagnitude(
                characterMove.MoveDirection,
                1f);

        inputSendAccumulator +=
            Time.unscaledDeltaTime;

        float sendInterval =
            1f / inputSendRate;

        bool directionChanged =
            !hasSentInput ||
            (direction - lastSentDirection)
                .sqrMagnitude > 0.0001f;

        if (
            !directionChanged &&
            inputSendAccumulator < sendInterval)
        {
            return;
        }

        inputSendAccumulator = 0f;
        lastSentDirection = direction;
        hasSentInput = true;

        inputSequence++;

        networkManager.SendMoveInput(
            direction,
            inputSequence);
    }

    private void FixedUpdate()
    {
        if (!initialized)
        {
            return;
        }

        float interpolation =
            1f - Mathf.Exp(
                -positionLerpSpeed *
                Time.fixedDeltaTime);

        Vector2 nextPosition =
            Vector2.Lerp(
                body.position,
                targetPosition,
                interpolation);

        body.MovePosition(nextPosition);
    }
}
