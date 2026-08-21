using UnityEngine;


[RequireComponent(typeof(Rigidbody2D))]
[RequireComponent(typeof(CharacterMove))]
[RequireComponent(typeof(PlayerStats))]
public class PlayerMotor : MonoBehaviour
{
    private Rigidbody2D body;
    private CharacterMove inputReader;
    private PlayerStats stats;

    private void Awake()
    {
        body = GetComponent<Rigidbody2D>();
        inputReader = GetComponent<CharacterMove>();
        stats = GetComponent<PlayerStats>();
    }

    private void FixedUpdate()
    {
        Vector2 direction =
            Vector2.ClampMagnitude(
                inputReader.MoveDirection,
                1f);

        body.linearVelocity =
            direction * stats.MoveSpeed;
    }

    private void OnDisable()
    {
        if (body != null)
        {
            body.linearVelocity =
                Vector2.zero;
        }
    }
}
