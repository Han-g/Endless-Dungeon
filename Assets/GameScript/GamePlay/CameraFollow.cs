using UnityEngine;

public class CameraFollow : MonoBehaviour
{
    [SerializeField]
    private Transform target;

    [SerializeField]
    private Vector2 offset;

    [SerializeField, Min(0.01f)]
    private float smoothTime = 0.18f;

    [SerializeField, Min(0f)]
    private float maxSpeed = 50f;

    [SerializeField, Min(1f)]
    private float pixelsPerUnit = 16f;

    [SerializeField]
    private bool snapOnStart = true;

    private Vector3 smoothVelocity;
    private Vector3 smoothPosition;
    private float cameraZ;

    private void Awake()
    {
        cameraZ = transform.position.z;
        smoothPosition = transform.position;
    }

    // Start is called once before the first execution of Update after the MonoBehaviour is created
    void Start()
    {
        if (snapOnStart)
        {
            SnapToTarget();
        }
    }

    private void LateUpdate()
    {
        if (target == null)
        {
            return;
        }

        Vector3 desiredPosition = GetDesiredPosition();

        smoothPosition = Vector3.SmoothDamp(
            smoothPosition,
            desiredPosition,
            ref smoothVelocity,
            smoothTime,
            maxSpeed,
            Time.deltaTime);

        // 실제 카메라는 픽셀 격자에 맞춘 좌표만 사용한다.
        transform.position = SnapToPixelGrid(smoothPosition);
    }

    private Vector3 GetDesiredPosition()
    {
        return new Vector3(
            target.position.x + offset.x,
            target.position.y + offset.y,
            cameraZ);
    }

    private Vector3 SnapToPixelGrid(Vector3 position)
    {
        return new Vector3(
            Mathf.Round(position.x * pixelsPerUnit) / pixelsPerUnit,
            Mathf.Round(position.y * pixelsPerUnit) / pixelsPerUnit,
            cameraZ);
    }

    private void SnapToTarget()
    {
        if (target == null)
        {
            return;
        }

        smoothPosition = GetDesiredPosition();
        transform.position = SnapToPixelGrid(smoothPosition);
        smoothVelocity = Vector3.zero;
    }

    public void SetTarget(
    Transform newTarget)
    {
        target = newTarget;

        if (target != null)
        {
            SnapToTarget();
        }
    }
}
