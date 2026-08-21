using UnityEngine;

[RequireComponent(typeof(Rigidbody2D))]
[RequireComponent(typeof(Collider2D))]
public class PlayerProjectile : MonoBehaviour
{
    [Header("Collision")]
    [SerializeField]
    private LayerMask worldCollisionMask;

    private Rigidbody2D body;
    private SpriteRenderer spriteRenderer;

    private int damage;
    private bool isConsumed;

    private void Awake()
    {
        body = GetComponent<Rigidbody2D>();
        spriteRenderer = GetComponent<SpriteRenderer>();
    }

    public void Initialize(
        Vector2 direction,
        int projectileDamage,
        float moveSpeed,
        float lifetime,
        Sprite projectileSprite,
        float projectileScale)
    {
        if (spriteRenderer != null &&
            projectileSprite != null)
        {
            spriteRenderer.sprite = projectileSprite;
        }

        transform.localScale =
            Vector3.one * Mathf.Max(0.1f, projectileScale);

        damage = Mathf.Max(1, projectileDamage);

        Vector2 normalizedDirection =
            direction.sqrMagnitude > 0.0001f
                ? direction.normalized
                : Vector2.right;

        body.linearVelocity =
            normalizedDirection * moveSpeed;

        Destroy(gameObject, lifetime);
    }

    private void OnTriggerEnter2D(Collider2D other)
    {
        if (isConsumed)
        {
            return;
        }

        EnemyHP enemyHP =
            other.GetComponentInParent<EnemyHP>();

        if (enemyHP != null)
        {
            if (enemyHP.TakeDamage(damage))
            {
                Consume();
            }

            return;
        }

        bool hitWorld =
            (worldCollisionMask.value &
             (1 << other.gameObject.layer)) != 0;

        if (hitWorld)
        {
            Consume();
        }
    }

    private void Consume()
    {
        if (isConsumed)
        {
            return;
        }

        isConsumed = true;
        body.linearVelocity = Vector2.zero;

        // 추후 오브젝트 풀 반환으로 교체
        Destroy(gameObject);
    }
}
