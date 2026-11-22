using UnityEngine;

public enum MainMenuState
{
    Title,
    Login,
    Lobby,
    Room,
    CharacterSelect
}

public class GameSecneController : MonoBehaviour
{
    [SerializeField] private GameObject titlePanel;
    [SerializeField] private GameObject loginPanel;
    [SerializeField] private GameObject lobbyPanel;
    [SerializeField] private GameObject roomPanel;
    [SerializeField] private GameObject characterSelectPanel;

    public MainMenuState CurrentState { get; private set; }

    private void Awake()
    {
        Show(MainMenuState.Title);
    }

    public void OpenLogin()
    {
        Show(MainMenuState.Login);
    }

    public void OnLoginSucceeded()
    {
        if (ClientSession.Instance == null ||
            !ClientSession.Instance.IsAuthenticated)
        {
            Debug.LogWarning("인증된 로그인 세션이 필요합니다.", this);
            return;
        }

        Show(MainMenuState.Lobby);
    }

    public void OnLoggedOut()
    {
        ClientSession.Instance?.ClearAuthentication();
        Show(MainMenuState.Login);
    }

    public void OnRoomJoined()
    {
        Show(MainMenuState.Room);
    }

    public void OnRoomLeft()
    {
        Show(MainMenuState.Lobby);
    }

    public void OnCharacterSelectStarted()
    {
        Show(MainMenuState.CharacterSelect);
    }

    public void OnCharacterSelectionFinished()
    {
        Show(MainMenuState.Room);
    }

    private void Show(MainMenuState state)
    {
        CurrentState = state;
        titlePanel.SetActive(state == MainMenuState.Title);
        loginPanel.SetActive(state == MainMenuState.Login);
        lobbyPanel.SetActive(state == MainMenuState.Lobby);
        roomPanel.SetActive(state == MainMenuState.Room);
        characterSelectPanel.SetActive(state == MainMenuState.CharacterSelect);
    }

    private void Start()
    {
        if (ClientSession.Instance != null && ClientSession.Instance.LoginNoticePending)
        {
            Show(MainMenuState.Login);
            return;
        }

        if (
            ClientSession.Instance != null &&
            ClientSession.Instance.IsAuthenticated &&
            RoomLobbyConnection.Instance != null &&
            RoomLobbyConnection.Instance.CurrentRoom == null)
        {
            Show(MainMenuState.Lobby);
        }
    }
}

