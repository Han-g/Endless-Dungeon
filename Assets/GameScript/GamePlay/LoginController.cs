using System;
using System.Collections;
using TMPro;
using UnityEngine;
using UnityEngine.Networking;
using UnityEngine.UI;

public class LoginController : MonoBehaviour
{
    [Header("HTTP API (same port as Colyseus)")]
    [SerializeField] private string apiBaseUrl = "http://localhost:2567";

    [Header("Existing login UI")]
    [SerializeField] private TMP_InputField loginIdInput;
    [SerializeField] private TMP_InputField passwordInput;
    [SerializeField] private Button loginButton;
    [SerializeField] private TMP_Text statusText;
    [SerializeField] private GameSecneController menuController;

    private Coroutine activeRoutine;
    private UnityWebRequest activeRequest;
    private bool isBusy;

    private void Awake()
    {
        if (passwordInput != null)
        {
            passwordInput.contentType = TMP_InputField.ContentType.Password;
            passwordInput.ForceLabelUpdate();
        }
    }

    private void OnEnable()
    {
        SetBusy(false);
        var session = ClientSession.Instance;
        if (session != null && session.LoginNoticePending)
        {
            SetStatus("Your session ended. Please sign in again.");
            session.AcknowledgeLoginNotice();
        }
        else
        {
            SetStatus(string.Empty);
        }
    }

    private void OnDisable()
    {
        CancelRequest();
        if (passwordInput != null)
        {
            passwordInput.text = string.Empty;
        }
    }

    // Connect LoginButton.onClick to this method only.
    public void OnLoginClicked()
    {
        if (isBusy) return;

        if (loginIdInput == null || passwordInput == null ||
            loginButton == null || menuController == null ||
            ClientSession.Instance == null)
        {
            SetStatus("Check the login UI and ClientSession setup.");
            return;
        }

        string loginId = loginIdInput.text.Trim();
        string password = passwordInput.text; // Do not trim the password.

        if (loginId.Length == 0 || password.Length == 0)
        {
            SetStatus("Enter your login ID and password.");
            return;
        }

        if (!AuthHttp.TryGetUrl(apiBaseUrl, "/api/auth/login", out string loginUrl) ||
            !AuthHttp.TryGetUrl(apiBaseUrl, "/api/auth/me", out string meUrl))
        {
            SetStatus("Use an HTTP or HTTPS API URL.");
            return;
        }

        SetBusy(true);
        SetStatus("Login...");
        activeRoutine = StartCoroutine(Login(loginUrl, meUrl, loginId, password));
    }

    private IEnumerator Login(
        string loginUrl, string meUrl, string loginId, string password)
    {
        string json = JsonUtility.ToJson(new LoginRequestDto
        {
            loginId = loginId,
            password = password
        });

        activeRequest = AuthHttp.CreateJsonRequest(
            loginUrl, UnityWebRequest.kHttpVerbPOST, json);
        yield return activeRequest.SendWebRequest();

        bool succeeded = activeRequest.result == UnityWebRequest.Result.Success;
        long statusCode = activeRequest.responseCode;
        string body = activeRequest.downloadHandler.text;
        ReleaseRequest();

        if (!succeeded)
        {
            FinishWithError(AuthHttp.ErrorMessage(statusCode, body));
            yield break;
        }

        if (!AuthHttp.TryReadJson(body, out LoginResponseDto login) ||
            string.IsNullOrWhiteSpace(login.accessToken) ||
            login.expiresAt <= DateTimeOffset.UtcNow.ToUnixTimeSeconds())
        {
            FinishWithError("Invalid login response.");
            yield break;
        }

        SetStatus("Loading account...");
        activeRequest = AuthHttp.CreateJsonRequest(
            meUrl, UnityWebRequest.kHttpVerbGET, token: login.accessToken);
        yield return activeRequest.SendWebRequest();

        succeeded = activeRequest.result == UnityWebRequest.Result.Success;
        statusCode = activeRequest.responseCode;
        body = activeRequest.downloadHandler.text;
        ReleaseRequest();

        if (!succeeded)
        {
            FinishWithError(AuthHttp.ErrorMessage(statusCode, body));
            yield break;
        }

        if (!AuthHttp.TryReadJson(body, out AccountResponseDto account) ||
            ClientSession.Instance == null ||
            !ClientSession.Instance.SetAuthenticated(
                login.accessToken, login.expiresAt, account.user))
        {
            FinishWithError("Failed to load account data.");
            yield break;
        }

        passwordInput.text = string.Empty;
        activeRoutine = null;
        SetBusy(false);
        SetStatus(string.Empty);

        // Disable LoginPanel only after both requests and local account application.
        menuController.OnLoginSucceeded();
    }

    private void FinishWithError(string message)
    {
        activeRoutine = null;
        SetBusy(false);
        SetStatus(message);
    }

    private void ReleaseRequest()
    {
        UnityWebRequest request = activeRequest;
        activeRequest = null;
        request?.Dispose();
    }

    private void CancelRequest()
    {
        Coroutine routine = activeRoutine;
        activeRoutine = null;
        if (routine != null)
        {
            StopCoroutine(routine);
        }

        if (activeRequest != null)
        {
            activeRequest.Abort();
            ReleaseRequest();
        }

        SetBusy(false);
    }

    private void SetBusy(bool busy)
    {
        isBusy = busy;
        if (loginButton != null) loginButton.interactable = !busy;
        if (loginIdInput != null) loginIdInput.interactable = !busy;
        if (passwordInput != null) passwordInput.interactable = !busy;
    }

    private void SetStatus(string message)
    {
        if (statusText != null) statusText.text = message;
    }
}

