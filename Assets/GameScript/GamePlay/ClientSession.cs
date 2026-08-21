using UnityEngine;

public class ClientSession : MonoBehaviour
{
    public static ClientSession Instance
    {
        get;
        private set;
    }

    public string UserId
    {
        get;
        private set;
    }

    public string RoomId
    {
        get;
        private set;
    }

    public bool IsHost
    {
        get;
        private set;
    }

    public int SelectedCharacterId
    {
        get;
        private set;
    } = 1;

    private void Awake()
    {
        if (Instance != null &&
            Instance != this)
        {
            Destroy(gameObject);
            return;
        }

        Instance = this;
        DontDestroyOnLoad(gameObject);
    }

    public void SetSelectedCharacter(
        int characterId)
    {
        SelectedCharacterId = characterId;
    }
}
