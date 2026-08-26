using UnityEngine;


[RequireComponent(typeof(Animator))]
[RequireComponent(typeof(SpriteRenderer))]
public class PlayerAnimationController : MonoBehaviour
{
    private static readonly int MoveXHash =
        Animator.StringToHash("MoveX");

    private static readonly int MoveYHash =
        Animator.StringToHash("MoveY");

    private static readonly int IsMovingHash =
        Animator.StringToHash("IsMoving");

    [SerializeField, Min(0f)]
    private float movingThreshold = 0.05f;

    private Animator animator;
    private SpriteRenderer spriteRenderer;
    private Rigidbody2D playerBody;

    private NetworkPlayerView networkPlayerView;
    private CharacterMove characterMove;

    // 이동 중 Move Blend Tree에서 사용할 8방향
    private Vector2 lastMoveDirection = Vector2.down;

    // 정지했을 때 Idle Blend Tree에서 사용할 4방향
    private Vector2 lastIdleDirection = Vector2.down;

    private Vector2 lastDirection = Vector2.down;

    private void Awake()
    {
        animator = GetComponent<Animator>();
        spriteRenderer = GetComponent<SpriteRenderer>();
        playerBody = GetComponentInParent<Rigidbody2D>();

        networkPlayerView = GetComponentInParent<NetworkPlayerView>();
        characterMove = GetComponentInParent<CharacterMove>();

        if (playerBody == null)
        {
            Debug.LogError(
                "부모 Player에서 Rigidbody2D를 찾지 못했습니다.",
                this);

            enabled = false;
        }
    }
    // Start is called once before the first execution of Update after the MonoBehaviour is created
    void Start()
    {
        
    }

    // Update is called once per frame
    void Update()
    {
        Vector2 velocity;

        if (networkPlayerView != null)
        {
            // 내 캐릭터는 입력값을 사용하여
            // 네트워크 지연 없이 즉시 애니메이션을 재생합니다.
            if (
                networkPlayerView.IsLocalPlayer &&
                characterMove != null)
            {
                velocity =
                    characterMove.MoveDirection;
            }
            else
            {
                // 다른 플레이어는 서버에서 받은
                // 이동 속도로 애니메이션을 재생합니다.
                velocity =
                    networkPlayerView.NetworkVelocity;
            }
        }
        else
        {
            // 기존 싱글플레이 호환
            velocity =
                playerBody.linearVelocity;
        }

        bool isMoving =
            velocity.sqrMagnitude >
            movingThreshold * movingThreshold;

        if (isMoving)
        {
            // 이동 애니메이션은 8방향을 사용합니다.
            lastMoveDirection =
                ConvertToEightDirections(velocity);

            // 마지막 이동 방향을 4방향 Idle 방향으로 저장합니다.
            lastIdleDirection =
                ConvertToClockwiseIdleDirection(lastMoveDirection);
        }

        Vector2 animatorDirection =
           isMoving
               ? lastMoveDirection
               : lastIdleDirection;

        animator.SetFloat(MoveXHash, animatorDirection.x);
        animator.SetFloat(MoveYHash, animatorDirection.y);
        animator.SetBool(IsMovingHash, isMoving);
    }

    private static Vector2 ConvertToEightDirections(Vector2 direction)
    {
        const float diagonal = 0.70710678f;

        float angle =
            Mathf.Atan2(direction.y, direction.x) * Mathf.Rad2Deg;

        int octant =
            (Mathf.RoundToInt(angle / 45f) + 8) % 8;

        return octant switch
        {
            0 => Vector2.right,
            1 => new Vector2(diagonal, diagonal),
            2 => Vector2.up,
            3 => new Vector2(-diagonal, diagonal),
            4 => Vector2.left,
            5 => new Vector2(-diagonal, -diagonal),
            6 => Vector2.down,
            7 => new Vector2(diagonal, -diagonal),
            _ => Vector2.down
        };
    }

    private static Vector2 ConvertToClockwiseIdleDirection(
        Vector2 direction)
    {
        bool hasHorizontal =
            Mathf.Abs(direction.x) > 0.01f;

        bool hasVertical =
            Mathf.Abs(direction.y) > 0.01f;

        // 대각선은 시계 방향에 있는 다음 직선 방향으로 결정합니다.
        if (hasHorizontal && hasVertical)
        {
            if (direction.x > 0f && direction.y > 0f)
            {
                return Vector2.right; // 오른쪽 위 → 오른쪽
            }

            if (direction.x > 0f && direction.y < 0f)
            {
                return Vector2.down; // 오른쪽 아래 → 아래
            }

            if (direction.x < 0f && direction.y < 0f)
            {
                return Vector2.left; // 왼쪽 아래 → 왼쪽
            }

            return Vector2.up; // 왼쪽 위 → 위
        }

        // 이미 직선 방향이면 그대로 저장합니다.
        if (hasHorizontal)
        {
            return direction.x > 0f
                ? Vector2.right
                : Vector2.left;
        }

        if (hasVertical)
        {
            return direction.y > 0f
                ? Vector2.up
                : Vector2.down;
        }

        return Vector2.down;
    }
}
