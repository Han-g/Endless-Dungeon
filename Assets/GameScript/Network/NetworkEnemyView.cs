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
    private Color normalColor = Color.white;
    private static Sprite markerSprite;
    private SpriteRenderer markRenderer;

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
        if (spriteRenderer != null) normalColor = spriteRenderer.color;
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
            spriteRenderer.color = state.slowed ? normalColor * new Color(0.5f, 0.85f, 1f) : normalColor;
            ShowMark(IsAlive && state.marked);
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

    private void ShowMark(bool visible)
    {
        if (visible && markRenderer == null)
        {
            if (markerSprite == null)
            {
                var texture = Texture2D.whiteTexture;
                markerSprite = Sprite.Create(texture, new Rect(0, 0, texture.width, texture.height),
                    new Vector2(0.5f, 0.5f), texture.width, 0, SpriteMeshType.FullRect);
            }
            var indicator = new GameObject("Co-op mark");
            indicator.transform.SetParent(spriteRenderer.transform, false);
            float top = spriteRenderer.sprite != null ? spriteRenderer.sprite.bounds.max.y : 0.5f;
            indicator.transform.localPosition = new Vector3(0f, top + 0.16f, 0f);
            indicator.transform.localRotation = Quaternion.Euler(0f, 0f, 45f);
            indicator.transform.localScale = Vector3.one * 0.18f;
            markRenderer = indicator.AddComponent<SpriteRenderer>();
            markRenderer.sprite = markerSprite;
            markRenderer.color = new Color(1f, 0.8f, 0.16f);
            markRenderer.sortingLayerID = spriteRenderer.sortingLayerID;
            markRenderer.sortingOrder = spriteRenderer.sortingOrder + 1;
        }
        if (markRenderer != null) markRenderer.enabled = visible;
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
