using TMPro;
using UnityEngine;
using UnityEngine.UI;

// A replacement view component for the existing four waiting-room slots.
public sealed class RoomMemberSlotUI : MonoBehaviour
{
    [SerializeField] private TMP_Text nicknameText;
    [SerializeField] private TMP_Text characterNameText;
    [SerializeField] private TMP_Text statusText;
    [SerializeField] private TMP_Text hostBadgeText;
    [SerializeField] private Image portraitImage;
    [SerializeField] private TMP_Text statsText;

    public void ShowMember(
    string nickname,
    string characterName,
    Sprite portrait,
    bool isHost,
    bool isLocal,
    bool isReady,
    int baseHp,
    float baseSpeed)
    {
        SetText(
            nicknameText,
            string.IsNullOrWhiteSpace(nickname)
                ? "Player"
                : nickname);

        SetText(
            characterNameText,
            characterName);

        string ready =
            isReady ? "READY" : "WAITING";

        SetText(
            statusText,
            isLocal ? $"My Character · {ready}" : ready);

        SetText(
            hostBadgeText,
            isHost ? "Host" : string.Empty);

        SetText(
            statsText,
            baseHp > 0 && baseSpeed > 0f
                ? $"HP {baseHp} · Speed {baseSpeed:0.##}"
                : string.Empty);

        SetPortrait(portrait);
    }

    public void ShowEmpty()
    {
        SetText(nicknameText, "Waiting for players...");
        SetText(characterNameText, string.Empty);
        SetText(statusText, string.Empty);
        SetText(hostBadgeText, string.Empty);
        SetText(statsText, string.Empty);
        SetPortrait(null);
    }

    private void SetPortrait(Sprite portrait)
    {
        if (portraitImage == null) return;
        portraitImage.sprite = portrait;
        portraitImage.preserveAspect = true;
        portraitImage.enabled = portrait != null;
    }

    private static void SetText(TMP_Text target, string value)
    {
        if (target == null) return;
        target.richText = false;
        target.text = value ?? string.Empty;
    }
}
