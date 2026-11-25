using UnityEngine;

using NetworkProjectileState =
    EndlessDungeon.Network.Generated.ProjectileState;

[RequireComponent(typeof(SpriteRenderer))]
public sealed class NetworkProjectileView :
    MonoBehaviour
{
    [SerializeField, Min(1f)]
    private float positionLerpSpeed = 30f;

    [SerializeField, Range(0f, 1f)]
    private float remoteProjectileAlpha = 0.6f;

    private SpriteRenderer spriteRenderer;
    private float activeRotationOffset;

    private Vector2 targetPosition;
    private bool initialized;

    private void Awake()
    {
        spriteRenderer =
            GetComponent<SpriteRenderer>();
    }

    public void Initialize(
    NetworkProjectileState state,
    ProjectileDefinition definition,
    bool isLocalProjectile)
    {
        if (state == null ||
            definition == null)
        {
            return;
        }

        spriteRenderer.sprite =
            definition.ProjectileSprite;

        transform.localScale =
            Vector3.one *
            definition.ProjectileScale;

        activeRotationOffset =
            definition.RotationOffset;

        Color color =
            spriteRenderer.color;

        color.a =
            isLocalProjectile || definition.IsEnemyProjectile
                ? 1f
                : remoteProjectileAlpha;

        spriteRenderer.color = color;

        ApplyState(state, true);
        initialized = true;
    }

    public void ApplyState(
        NetworkProjectileState state,
        bool snapImmediately)
    {
        if (state == null)
        {
            return;
        }

        targetPosition =
            new Vector2(state.x, state.y);

        float angle =
            Mathf.Atan2(
                state.directionY,
                state.directionX) *
            Mathf.Rad2Deg;

        transform.rotation =
            Quaternion.Euler(
                0f,
                0f,
                angle + activeRotationOffset);

        if (
            snapImmediately ||
            !initialized)
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

        float interpolation =
            1f - Mathf.Exp(
                -positionLerpSpeed *
                Time.deltaTime);

        Vector2 position =
            Vector2.Lerp(
                transform.position,
                targetPosition,
                interpolation);

        transform.position =
            new Vector3(
                position.x,
                position.y,
                0f);
    }
}
