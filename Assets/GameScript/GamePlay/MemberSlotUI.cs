using TMPro;
using UnityEngine;

public class MemberSlotUI : MonoBehaviour
{
    [SerializeField]
    private TMP_Text nicknameText;

    [SerializeField]
    private TMP_Text readyStateText;

    [SerializeField]
    private TMP_Text hostBadgeText;

    public void ShowEmpty()
    {
        nicknameText.text =
            "PLAYER WAITING...";

        readyStateText.text =
            string.Empty;

        hostBadgeText.text =
            string.Empty;
    }

    public void ShowMember(
        string nickname,
        bool isReady,
        bool isHost)
    {
        nicknameText.text =
            nickname;

        readyStateText.text =
            isReady
                ? "READY"
                : "NOT READY";

        hostBadgeText.text =
            isHost
                ? "HOST"
                : string.Empty;
    }
}
