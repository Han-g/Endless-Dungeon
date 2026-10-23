using System;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

// Attach to the root RoomListItem prefab. Server subscription belongs to a list controller.
public sealed class RoomListItemUI : MonoBehaviour
{
    [SerializeField] private TMP_Text roomNameText;
    [SerializeField] private TMP_Text occupancyText;
    [SerializeField] private TMP_Text stateText;
    [SerializeField] private Button joinButton;

    private string roomId;
    private Action<string> requestJoin;
    private bool canJoin;

    public void SetData(
        string id, string title, int players, int capacity,
        string stateLabel, bool joinable, Action<string> onJoinRequested)
    {
        roomId = id;
        requestJoin = onJoinRequested;
        canJoin = joinable && !string.IsNullOrEmpty(id) && onJoinRequested != null;

        if (roomNameText != null)
        {
            roomNameText.richText = false;
            roomNameText.text = string.IsNullOrWhiteSpace(title) ? id : title;
        }
        if (occupancyText != null) occupancyText.text = $"{players} / {capacity}";
        if (stateText != null) stateText.text = stateLabel;
        if (joinButton != null) joinButton.interactable = canJoin;
    }

    // Connect JoinButton -> Button -> On Click() to this method once in the prefab.
    public void OnJoinClicked()
    {
        if (!canJoin || joinButton == null || !joinButton.interactable) return;
        requestJoin?.Invoke(roomId);
    }

    public void SetJoinEnabled(bool enabled)
    {
        if (joinButton != null) joinButton.interactable = enabled && canJoin;
    }
}
