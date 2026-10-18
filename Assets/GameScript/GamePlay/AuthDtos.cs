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
            return "서버에 연결하지 못했습니다. 서버 주소와 실행 상태를 확인하세요.";
        if (statusCode == 401)
            return "로그인 정보가 올바르지 않거나 세션이 만료되었습니다.";
        if (statusCode == 429)
            return "요청이 너무 많습니다. 잠시 후 다시 시도하세요.";
        if (statusCode >= 500)
            return "서버 또는 데이터베이스를 사용할 수 없습니다. 잠시 후 다시 시도하세요.";

        return "요청을 처리하지 못했습니다.";
    }
}

