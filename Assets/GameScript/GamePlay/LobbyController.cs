using System.Collections;
using TMPro;
using UnityEngine;
using UnityEngine.Networking;
using UnityEngine.UI;

public class LobbyController : MonoBehaviour
{
    [SerializeField] private string apiBaseUrl = "http://localhost:2567";
    [SerializeField] private TMP_Text displayNameText;
    [SerializeField] private TMP_Text accountIdText;
    [SerializeField] private TMP_Text statusText;
    [SerializeField] private Button logoutButton;
    [SerializeField] private Button refreshButton;
    [SerializeField] private GameSecneController menuController;

    private Coroutine activeRoutine;
    private UnityWebRequest activeRequest;
    private bool isBusy;
    private bool logoutPending;

    private void OnEnable()
    {
        SetBusy(false);
        SetStatus(string.Empty);
        ClientSession session = ClientSession.Instance;
        if (session == null || !session.IsAuthenticated)
        {
            session?.ClearAuthentication();
            menuController?.OnLoggedOut();
            return;
        }

        ApplyIdentityToUi(session);
    }

    // Optional Refresh button. Login has already verified /me.
    public void OnRefreshClicked()
    {
        if (isBusy) return;
        ClientSession session = ClientSession.Instance;
        if (session == null || !session.IsAuthenticated)
        {
            session?.ClearAuthentication();
            menuController?.OnLoggedOut();
            return;
        }

        if (!AuthHttp.TryGetUrl(apiBaseUrl, "/api/auth/me", out string url))
        {
            SetStatus("API 주소를 확인하세요.");
            return;
        }

        SetBusy(true);
        SetStatus("계정 정보 새로고침 중...");
        activeRoutine = StartCoroutine(RefreshProfile(url, session.AccessToken));
    }

    private IEnumerator RefreshProfile(string url, string token)
    {
        activeRequest = AuthHttp.CreateJsonRequest(
            url, UnityWebRequest.kHttpVerbGET, token: token);
        yield return activeRequest.SendWebRequest();

        bool succeeded = activeRequest.result == UnityWebRequest.Result.Success;
        long statusCode = activeRequest.responseCode;
        string body = activeRequest.downloadHandler.text;
        ReleaseRequest();
        activeRoutine = null;
        SetBusy(false);

        ClientSession session = ClientSession.Instance;
        if (session == null || session.AccessToken != token)
        {
            yield break;
        }

        if (statusCode == 401 || !session.IsAuthenticated)
        {
            session.ClearAuthentication();
            menuController?.OnLoggedOut();
            yield break;
        }

        if (!succeeded)
        {
            SetStatus(AuthHttp.ErrorMessage(statusCode, body));
            yield break;
        }

        if (!AuthHttp.TryReadJson(body, out AccountResponseDto account) ||
            !session.ApplyAccountProfile(account.user))
        {
            SetStatus("계정 정보를 적용하지 못했습니다.");
            yield break;
        }

        ApplyIdentityToUi(session);
        SetStatus(string.Empty);
    }

    public void OnLogoutClicked()
    {
        if (isBusy) return;
        ClientSession session = ClientSession.Instance;
        if (session == null || string.IsNullOrEmpty(session.AccessToken))
        {
            session?.ClearAuthentication();
            menuController?.OnLoggedOut();
            return;
        }

        if (!AuthHttp.TryGetUrl(apiBaseUrl, "/api/auth/logout", out string url))
        {
            // Local logout must remain possible even with invalid configuration.
            session.ClearAuthentication();
            menuController?.OnLoggedOut();
            return;
        }

        logoutPending = true;
        SetBusy(true);
        SetStatus("로그아웃 중...");
        activeRoutine = StartCoroutine(Logout(url, session.AccessToken));
    }

    private IEnumerator Logout(string url, string token)
    {
        bool serverLogoutSucceeded = false;
        try
        {
            activeRequest = AuthHttp.CreateJsonRequest(
                url, UnityWebRequest.kHttpVerbPOST, token: token);
            yield return activeRequest.SendWebRequest();
            serverLogoutSucceeded =
                activeRequest.result == UnityWebRequest.Result.Success ||
                activeRequest.responseCode == 401;
        }
        finally
        {
            ReleaseRequest();
            activeRoutine = null;
            logoutPending = false;

            ClientSession session = ClientSession.Instance;
            if (session != null && session.AccessToken == token)
            {
                session.ClearAuthentication();
            }

            SetBusy(false);
        }

        if (!serverLogoutSucceeded)
        {
            Debug.LogWarning(
                "서버 로그아웃 요청을 완료하지 못했습니다. " +
                "서버 세션은 만료 시각까지 유지될 수 있습니다.", this);
        }

        menuController?.OnLoggedOut();
    }

    private void OnDisable()
    {
        Coroutine routine = activeRoutine;
        activeRoutine = null;
        if (routine != null) StopCoroutine(routine);

        if (activeRequest != null)
        {
            activeRequest.Abort();
            ReleaseRequest();
        }

        // Also covers interruption while the logout coroutine is waiting.
        if (logoutPending)
        {
            logoutPending = false;
            ClientSession.Instance?.ClearAuthentication();
        }

        SetBusy(false);
    }

    private void ApplyIdentityToUi(ClientSession session)
    {
        if (displayNameText != null) displayNameText.text = session.DisplayName;
        if (accountIdText != null) accountIdText.text = session.AccountId;
    }

    private void ReleaseRequest()
    {
        UnityWebRequest request = activeRequest;
        activeRequest = null;
        request?.Dispose();
    }

    private void SetBusy(bool busy)
    {
        isBusy = busy;
        if (logoutButton != null) logoutButton.interactable = !busy;
        if (refreshButton != null) refreshButton.interactable = !busy;
    }

    private void SetStatus(string message)
    {
        if (statusText != null) statusText.text = message;
    }
}

