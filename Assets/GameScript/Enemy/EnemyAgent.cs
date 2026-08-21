using UnityEngine;

[RequireComponent(typeof(Rigidbody2D))]
[RequireComponent(typeof(CircleCollider2D))]
[RequireComponent(typeof(EnemyHP))]
public class EnemyAgent : MonoBehaviour
{
    [SerializeField] private SpriteRenderer spriteRenderer;

    [Header("Axis Switching")]
    [SerializeField, Min(0.1f)]
    private float axisSwitchAfter = 3f;

    [SerializeField, Min(0.1f)]
    private float forcedAxisDuration = 0.75f;

    [SerializeField, Min(1f)]
    private float axisDominance = 3f;

    [SerializeField, Min(0.1f)]
    private float axisProbeDistance = 0.6f;

    private enum MoveAxis
    {
        None,
        Horizontal,
        Vertical
    }

    private MoveAxis trackedAxis;
    private float sameAxisTimer;

    private MoveAxis forcedAxis;
    private float forcedAxisTimer;

    public int StableId { get; private set; }
    public EnemyDefinition Definition { get; private set; }
    public Rigidbody2D Body { get; private set; }

    public Vector2 Position => Body.position;
    public float MoveSpeed => Definition.MoveSpeed;
    public float SeparationRadius => Definition.SeparationRadius;
    public float AttackRadius => Definition.AttackRadius;

    private EnemySimulation simulation;
    private bool isRegistered;
    public EnemyHP Health { get; private set; }
    public Collider2D HitCollider { get; private set; }

    private void Awake()
    {
        Body = GetComponent<Rigidbody2D>();
        Health = GetComponent<EnemyHP>();
        HitCollider = GetComponent<Collider2D>();

        if (spriteRenderer == null)
        {
            spriteRenderer = GetComponentInChildren<SpriteRenderer>();
        }
    }

    public void Initialize(
        int stableId,
        EnemyDefinition definition,
        EnemySimulation targetSimulation)
    {
        if (isRegistered && simulation != null)
        {
            simulation.Unregister(this);
        }

        StableId = stableId;
        Definition = definition;
        simulation = targetSimulation;

        Health.Initialize(definition.MaxHealth);
        trackedAxis = MoveAxis.None;
        sameAxisTimer = 0f;
        forcedAxis = MoveAxis.None;
        forcedAxisTimer = 0f;

        if (spriteRenderer != null)
        {
            spriteRenderer.sprite = definition.Sprite;
        }

        simulation.Register(this);
        isRegistered = true;
    }

    public void UpdateVisualAnimation(float animationTime)
    {
        if (Definition == null || spriteRenderer == null)
        {
            return;
        }

        bool isMoving =
            Body.linearVelocity.sqrMagnitude > 0.0025f;

        Sprite[] frames = Definition.MoveFrames;

        if (!isMoving ||
            frames == null ||
            frames.Length == 0)
        {
            spriteRenderer.sprite = Definition.Sprite;
            return;
        }

        // 모든 적이 동시에 같은 프레임으로 움직이지 않도록
        // StableId에 따라 약간의 시간 차이를 준다.
        float phaseOffset =
            (StableId % 17) * 0.071f;

        int frameIndex = Mathf.FloorToInt(
            (animationTime + phaseOffset)
            * Definition.MoveAnimationFps);

        frameIndex %= frames.Length;

        Sprite selectedFrame = frames[frameIndex];

        spriteRenderer.sprite =
            selectedFrame != null
                ? selectedFrame
                : Definition.Sprite;
    }

    public void ApplyMovement(Vector2 direction)
    {
        if (Definition == null)
        {
            Body.linearVelocity = Vector2.zero;
            return;
        }

        Vector2 normalizedDirection =
            Vector2.ClampMagnitude(direction, 1f);

        Body.linearVelocity =
            normalizedDirection * Definition.MoveSpeed;

        if (spriteRenderer != null &&
            Mathf.Abs(normalizedDirection.x) > 0.05f)
        {
            // 에셋이 오른쪽을 바라보므로 왼쪽 이동 시 Flip
            spriteRenderer.flipX = normalizedDirection.x < 0f;
        }
    }

    private void OnDisable()
    {
        if (Body != null)
        {
            Body.linearVelocity = Vector2.zero;
        }

        if (isRegistered && simulation != null)
        {
            simulation.Unregister(this);
            isRegistered = false;
        }
    }

    public Vector2 ApplyAxisAlternation(
    Vector2 desiredDirection,
    Vector2 targetPosition,
    FlowField2D flowField,
    float deltaTime)
    {
        if (desiredDirection.sqrMagnitude < 0.0001f)
        {
            trackedAxis = MoveAxis.None;
            sameAxisTimer = 0f;

            return Vector2.zero;
        }

        // 이미 반대 축 이동을 강제하고 있는 상태
        if (forcedAxisTimer > 0f)
        {
            Vector2 forcedDirection =
                GetDirectionForAxis(
                    forcedAxis,
                    targetPosition);

            if (CanMoveInDirection(
                    forcedDirection,
                    flowField))
            {
                forcedAxisTimer -= deltaTime;
                return forcedDirection;
            }

            // 반대 축에 벽이 있으면 강제 전환 중단
            forcedAxisTimer = 0f;
            forcedAxis = MoveAxis.None;
        }

        MoveAxis currentAxis =
            GetDominantAxis(desiredDirection);

        // 대각선 이동이면 한 축 이동 타이머를 초기화
        if (currentAxis == MoveAxis.None)
        {
            trackedAxis = MoveAxis.None;
            sameAxisTimer = 0f;

            return desiredDirection;
        }

        if (currentAxis == trackedAxis)
        {
            sameAxisTimer += deltaTime;
        }
        else
        {
            trackedAxis = currentAxis;
            sameAxisTimer = 0f;
        }

        if (sameAxisTimer < axisSwitchAfter)
        {
            return desiredDirection;
        }

        MoveAxis nextAxis =
            currentAxis == MoveAxis.Horizontal
                ? MoveAxis.Vertical
                : MoveAxis.Horizontal;

        Vector2 alternateDirection =
            GetDirectionForAxis(
                nextAxis,
                targetPosition);

        // 다른 축이 벽이거나 플레이어와 축 좌표가 같으면
        // 기존 Flow Field 방향을 유지
        if (!CanMoveInDirection(
                alternateDirection,
                flowField))
        {
            sameAxisTimer = axisSwitchAfter;
            return desiredDirection;
        }

        forcedAxis = nextAxis;
        forcedAxisTimer = forcedAxisDuration;

        trackedAxis = nextAxis;
        sameAxisTimer = 0f;

        return alternateDirection;
    }

    private MoveAxis GetDominantAxis(
        Vector2 direction)
    {
        float horizontal =
            Mathf.Abs(direction.x);

        float vertical =
            Mathf.Abs(direction.y);

        if (horizontal > vertical * axisDominance)
        {
            return MoveAxis.Horizontal;
        }

        if (vertical > horizontal * axisDominance)
        {
            return MoveAxis.Vertical;
        }

        return MoveAxis.None;
    }

    private Vector2 GetDirectionForAxis(
        MoveAxis axis,
        Vector2 targetPosition)
    {
        Vector2 offset =
            targetPosition - Position;

        switch (axis)
        {
            case MoveAxis.Horizontal:
                if (Mathf.Abs(offset.x) < 0.05f)
                {
                    return Vector2.zero;
                }

                return new Vector2(
                    Mathf.Sign(offset.x),
                    0f);

            case MoveAxis.Vertical:
                if (Mathf.Abs(offset.y) < 0.05f)
                {
                    return Vector2.zero;
                }

                return new Vector2(
                    0f,
                    Mathf.Sign(offset.y));

            default:
                return Vector2.zero;
        }
    }

    private bool CanMoveInDirection(
        Vector2 direction,
        FlowField2D flowField)
    {
        if (direction.sqrMagnitude < 0.0001f)
        {
            return false;
        }

        if (flowField == null)
        {
            return true;
        }

        Vector2 probePosition =
            Position +
            direction.normalized * axisProbeDistance;

        return flowField.IsWalkable(probePosition);
    }
}
