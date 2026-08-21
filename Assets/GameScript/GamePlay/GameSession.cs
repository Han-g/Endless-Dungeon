using UnityEngine;

[DisallowMultipleComponent]
public class GameSession : MonoBehaviour
{
    [Header("References")]
    [SerializeField]
    private PlayerHP playerHP;

    [SerializeField]
    private GameFinishUI gameOverUI;

    private float survivalTime;
    private int enemyKillCount;
    private bool isGameOver;

    private void Awake()
    {
        // 에디터에서 이전 실행이 0으로 끝난 경우도 복구
        Time.timeScale = 1f;
    }

    private void OnEnable()
    {
        if (playerHP != null)
        {
            playerHP.Died += HandlePlayerDied;
        }

        EnemyHP.AnyEnemyDied += HandleEnemyDied;
    }

    private void OnDisable()
    {
        if (playerHP != null)
        {
            playerHP.Died -= HandlePlayerDied;
        }

        EnemyHP.AnyEnemyDied -= HandleEnemyDied;
    }

    private void Update()
    {
        if (!isGameOver)
        {
            survivalTime += Time.deltaTime;
        }
    }

    private void HandleEnemyDied()
    {
        if (!isGameOver)
        {
            enemyKillCount++;
        }
    }

    private void HandlePlayerDied()
    {
        if (isGameOver)
        {
            return;
        }

        isGameOver = true;

        gameOverUI.Show(
            survivalTime,
            enemyKillCount);

        // 적, 물리, 스포너 등 게임 전체 정지
        Time.timeScale = 0f;
    }
}