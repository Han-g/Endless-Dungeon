using System;
using UnityEngine;

public class ClientSession : MonoBehaviour
{
    public static ClientSession Instance { get; private set; }

    public string UserId { get; private set; } = string.Empty;
    public string AccountId => UserId;
    public string DisplayName { get; private set; } = string.Empty;
    public string AccessToken { get; private set; } = string.Empty;
    public long ExpiresAt { get; private set; }
    public string RoomId { get; private set; } = string.Empty;
    public bool IsHost { get; private set; }
    public int SelectedCharacterId { get; private set; } = 1;

    public bool IsAuthenticated =>
        !string.IsNullOrEmpty(AccessToken) &&
        !string.IsNullOrEmpty(UserId) &&
        ExpiresAt > DateTimeOffset.UtcNow.ToUnixTimeSeconds();

    private void Awake()
    {
        if (Instance != null && Instance != this)
        {
            Destroy(gameObject);
            return;
        }

        Instance = this;
        DontDestroyOnLoad(gameObject);
    }

    private void OnDestroy()
    {
        if (Instance == this)
        {
            Instance = null;
        }
    }

    public bool SetAuthenticated(
        string accessToken, long expiresAt, AccountProfileDto profile)
    {
        if (string.IsNullOrWhiteSpace(accessToken) ||
            expiresAt <= DateTimeOffset.UtcNow.ToUnixTimeSeconds() ||
            profile == null || !profile.IsValid)
        {
            return false;
        }

        ClearRoom();
        AccessToken = accessToken;
        ExpiresAt = expiresAt;
        UserId = profile.accountId;
        DisplayName = profile.displayName;
        SelectedCharacterId = profile.selectedCharacterId;
        return true;
    }

    public bool ApplyAccountProfile(AccountProfileDto profile)
    {
        if (!IsAuthenticated || profile == null || !profile.IsValid ||
            profile.accountId != UserId)
        {
            return false;
        }

        DisplayName = profile.displayName;
        SelectedCharacterId = profile.selectedCharacterId;
        return true;
    }

    public void ClearAuthentication()
    {
        AccessToken = string.Empty;
        ExpiresAt = 0;
        UserId = string.Empty;
        DisplayName = string.Empty;
        SelectedCharacterId = 1;
        ClearRoom();
    }

    public void SetSelectedCharacter(int characterId)
    {
        if (characterId >= 1 && characterId <= 4)
        {
            SelectedCharacterId = characterId;
        }
    }

    public void SetRoom(string roomId, bool isHost)
    {
        RoomId = roomId ?? string.Empty;
        IsHost = isHost;
    }

    public void ClearRoom()
    {
        RoomId = string.Empty;
        IsHost = false;
    }
}

