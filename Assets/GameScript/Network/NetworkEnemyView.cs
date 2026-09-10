using UnityEngine;

using NetworkEnemyState =
    EndlessDungeon.Network.Generated.EnemyState;

[DisallowMultipleComponent]
public sealed class NetworkEnemyView :
    MonoBehaviour
{
    [Header("References")]
    [SerializeField]
    private SpriteRenderer spriteRenderer;

    [Header("Movement")]
    [SerializeField, Min(1f)]
    private float positionLerpSpeed = 15f;

    private EnemyDefinition definition;

    private Vector2 targetPosition;
    private Vector2 networkVelocity;

    private float animationElapsed;
    private int currentFrameIndex = -1;

    private bool initialized;

    public string EnemyId
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

    public Vector2 NetworkVelocity =>
        networkVelocity;

    private void Awake()
    {
        if (spriteRenderer == null)
        {
            spriteRenderer =
                GetComponentInChildren<
                    SpriteRenderer>(true);
        }
    }

    public void Initialize(
        string enemyId,
        NetworkEnemyState initialState,
        EnemyDefinition enemyDefinition)
    {
        if (
            initialState == null ||
            enemyDefinition == null
        )
        {
            return;
        }

        EnemyId = enemyId;
        definition = enemyDefinition;

        gameObject.name =
            $"Enemy_{enemyId}_" +
            $"Type_{definition.TypeId}";

        if (spriteRenderer != null)
        {
            spriteRenderer.sprite =
                definition.Sprite;
        }

        animationElapsed = 0f;
        currentFrameIndex = -1;

        ApplyState(
            initialState,
            true);

        initialized = true;
    }

    public void ApplyState(
        NetworkEnemyState state,
        bool snapImmediately)
    {
        if (state == null)
        {
            return;
        }

        targetPosition =
            new Vector2(
                state.x,
                state.y);

        networkVelocity =
            state.alive
                ? new Vector2(
                    state.velocityX,
                    state.velocityY)
                : Vector2.zero;

        CurrentHp = state.hp;
        MaxHp = state.maxHp;
        IsAlive = state.alive;

        if (spriteRenderer != null)
        {
            spriteRenderer.enabled =
                IsAlive;
        }

        if (
            snapImmediately ||
            !initialized
        )
        {
            transform.position =
                new Vector3(
                    targetPosition.x,
                    targetPosition.y,
                    0f);
        }
    }

    private void Update()
    {
        if (!initialized)
        {
            return;
        }

        UpdatePosition();
        UpdateAnimation();
    }

    private void UpdatePosition()
    {
        float interpolation =
            1f - Mathf.Exp(
                -positionLerpSpeed *
                Time.deltaTime);

        Vector2 currentPosition =
            transform.position;

        Vector2 nextPosition =
            Vector2.Lerp(
                currentPosition,
                targetPosition,
                interpolation);

        transform.position =
            new Vector3(
                nextPosition.x,
                nextPosition.y,
                0f);
    }

    private void UpdateAnimation()
    {
        if (
            spriteRenderer == null ||
            definition == null ||
            !IsAlive
        )
        {
            return;
        }

        Sprite[] moveFrames = definition.MoveFrames;

        // 이동 속도와 관계없이 프레임이 있으면 재생합니다.
        if (moveFrames == null || moveFrames.Length == 0)
        {
            animationElapsed = 0f;
            currentFrameIndex = -1;

            spriteRenderer.sprite = definition.Sprite;
            return;
        }

        animationElapsed +=
            Time.deltaTime;

        float framesPerSecond =
            Mathf.Max(
                1f,
                definition.MoveAnimationFps);

        int frameIndex =
            Mathf.FloorToInt(
                animationElapsed *
                framesPerSecond) %
            moveFrames.Length;

        if (
            frameIndex ==
            currentFrameIndex
        )
        {
            return;
        }

        currentFrameIndex = frameIndex;

        Sprite frame =
            moveFrames[frameIndex];

        if (frame != null)
        {
            spriteRenderer.sprite = frame;
        }
    }
}