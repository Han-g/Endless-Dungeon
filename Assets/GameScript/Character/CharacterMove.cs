using UnityEngine;
using UnityEngine.InputSystem;

public class CharacterMove : MonoBehaviour
{
    public Vector2 MoveDirection { get; private set; }

    public void OnMove(InputValue value)
    {
        MoveDirection = value.Get<Vector2>();
    }

    private void OnDisable()
    {
        MoveDirection = Vector2.zero;
    }
}
