using TMPro;
using UnityEngine;
using UnityEngine.SceneManagement;

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

    private void Awake()
    {
        gameOverPanel.SetActive(false);
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
