using TMPro;
using UnityEngine;
using UnityEngine.SceneManagement;
using System.Collections;

using NetworkGameState =
    EndlessDungeon.Network.Generated.GameState;

#if UNITY_EDITOR
using UnityEditor;
#endif

[DisallowMultipleComponent]
public sealed class GameFinishUI : MonoBehaviour
{
    [Header("References")]
    [SerializeField]
    private GameObject gameOverPanel;

    [SerializeField]
    private TMP_Text survivalTimeText;

    [SerializeField]
    private TMP_Text enemyKillText;

    [Header("Network")]
    [SerializeField]
    private NetworkManager networkManager;

    [Header("Finish")]
    [SerializeField, Min(0f)]
    private float finishDelaySeconds = 0.8f;

    private bool finishRequested;
    private Coroutine finishRoutine;

    private void Awake()
    {
        gameOverPanel.SetActive(false);
    }

    private void OnEnable()
    {
        if (networkManager == null)
        {
            Debug.LogError(
                "GameFinishUI에 NetworkManager를 연결하세요.",
                this);
            return;
        }

        networkManager.GameStateChanged += HandleGameStateChanged;

        // 이미 종료 상태를 받은 뒤 UI가 활성화된 경우도 처리합니다.
        HandleGameStateChanged(networkManager.State?.game);
    }

    private void OnDisable()
    {
        if (networkManager != null)
        {
            networkManager.GameStateChanged -= HandleGameStateChanged;
        }

        if (finishRoutine != null)
        {
            StopCoroutine(finishRoutine);
            finishRoutine = null;
        }

        finishRequested = false;
    }

    private void HandleGameStateChanged(NetworkGameState state)
    {
        if (
            state == null ||
            state.phase != "finished" ||
            finishRequested)
        {
            return;
        }

        // 같은 종료 상태를 여러 번 받아도 한 번만 실행합니다.
        finishRequested = true;

        int kills = (int)System.Math.Min(
            state.killCount,
            (uint)int.MaxValue);

        finishRoutine = StartCoroutine(
            ShowFinishAfterDelay(
                state.elapsedSeconds,
                kills));
    }

    private IEnumerator ShowFinishAfterDelay(
        float survivalTime,
        int enemyKillCount)
    {
        yield return new WaitForSecondsRealtime(finishDelaySeconds);

        Show(survivalTime, enemyKillCount);

        finishRoutine = null;
    }

    public void Show(
        float survivalTime,
        int enemyKillCount)
    {
        survivalTimeText.text =
            $"TIME : {FormatTime(survivalTime)}";

        enemyKillText.text =
            $"KILL : {enemyKillCount}";

        gameOverPanel.SetActive(true);

        Cursor.visible = true;
        Cursor.lockState = CursorLockMode.None;
    }

    public void RetryGame()
    {
        Time.timeScale = 1f;

        SceneManager.LoadScene(
            SceneManager.GetActiveScene().buildIndex);
    }

    public void QuitGame()
    {
        Time.timeScale = 1f;

#if UNITY_EDITOR
        EditorApplication.isPlaying = false;
#else
        Application.Quit();
#endif
    }

    private static string FormatTime(float seconds)
    {
        int totalSeconds =
            Mathf.FloorToInt(seconds);

        int minutes = totalSeconds / 60;
        int remainingSeconds = totalSeconds % 60;

        return $"{minutes:00}:{remainingSeconds:00}";
    }
}
