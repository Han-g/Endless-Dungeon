using System;
using System.Text;
using UnityEngine;
using UnityEngine.Networking;

[Serializable]
public class LoginRequestDto
{
    public string loginId;
    public string password;
}

[Serializable]
public class AccountProfileDto
{
    public string accountId;
    public string displayName;
    public int selectedCharacterId;

    public bool IsValid =>
        !string.IsNullOrWhiteSpace(accountId) &&
        !string.IsNullOrWhiteSpace(displayName) &&
        selectedCharacterId >= 1 && selectedCharacterId <= 4;
}

[Serializable]
public class LoginResponseDto
{
    public string accessToken;
    public long expiresAt; // Unix seconds, UTC
    public AccountProfileDto user;
}

[Serializable]
public class AccountResponseDto
{
    public AccountProfileDto user;
}

[Serializable]
public class AuthErrorDto
{
    public string error;
    public string message;
}

public static class AuthHttp
{
    public static bool TryGetUrl(string baseUrl, string path, out string url)
    {
        url = null;
        if (!Uri.TryCreate(baseUrl, UriKind.Absolute, out Uri uri) ||
            (uri.Scheme != Uri.UriSchemeHttp &&
             uri.Scheme != Uri.UriSchemeHttps) ||
            !string.IsNullOrEmpty(uri.UserInfo) ||
            !string.IsNullOrEmpty(uri.Query) ||
            !string.IsNullOrEmpty(uri.Fragment))
        {
            return false;
        }

        url = baseUrl.TrimEnd('/') + path;
        return true;
    }

    public static UnityWebRequest CreateJsonRequest(
        string url, string method, string json = null, string token = null)
    {
        var request = new UnityWebRequest(url, method)
        {
            downloadHandler = new DownloadHandlerBuffer(),
            timeout = 15,
            redirectLimit = 0
        };

        if (json != null)
        {
            request.uploadHandler =
                new UploadHandlerRaw(Encoding.UTF8.GetBytes(json));
            request.SetRequestHeader("Content-Type", "application/json");
        }

        request.SetRequestHeader("Accept", "application/json");
        if (!string.IsNullOrEmpty(token))
        {
            request.SetRequestHeader("Authorization", "Bearer " + token);
        }

        return request;
    }

    public static bool TryReadJson<T>(string json, out T value) where T : class
    {
        value = null;
        try
        {
            value = JsonUtility.FromJson<T>(json);
            return value != null;
        }
        catch (ArgumentException)
        {
            return false;
        }
    }

    public static string ErrorMessage(long statusCode, string body)
    {
        if (TryReadJson(body, out AuthErrorDto error) &&
            !string.IsNullOrWhiteSpace(error.message))
        {
            return error.message;
        }

        if (statusCode == 0)
            return "Failed to connect to the server.";
        if (statusCode == 401)
            return "Invalid credentials or expired session.";
        if (statusCode == 429)
            return "Too many requests. Please try again later.";
        if (statusCode >= 500)
            return "Service unavailable. Please try again later.";

        return "Unable to process the request.";
    }
}

