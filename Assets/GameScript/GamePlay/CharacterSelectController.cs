using TMPro;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.UI;

public class CharacterSelectController : MonoBehaviour
{
    [Header("Character Data")]
    [SerializeField]
    private CharacterDefinition[] characters;

    [Header("UI")]
    [SerializeField]
    private TMP_Text selectedCharacterText;

    [SerializeField]
    private Button confirmButton;

    [Header("Scene")]
    [SerializeField]
    private string gameSceneName = "GameScene";

    private CharacterDefinition selectedCharacter;

    private void OnEnable()
    {
        selectedCharacter = null;

        if (selectedCharacterText != null)
        {
            selectedCharacterText.text =
                "캐릭터를 선택하세요.";
        }

        if (confirmButton != null)
        {
            confirmButton.interactable = false;
        }
    }

    public void SelectCharacter(int characterId)
    {
        selectedCharacter = FindCharacter(
            characterId);

        if (selectedCharacter == null)
        {
            Debug.LogError(
                $"CharacterId {characterId}를 찾을 수 없습니다.",
                this);

            return;
        }

        if (selectedCharacterText != null)
        {
            selectedCharacterText.text =
                $"{selectedCharacter.DisplayName}\n" +
                $"HP: {selectedCharacter.BaseMaxHealth}\n" +
                $"이동 속도: {selectedCharacter.BaseMoveSpeed}\n" +
                $"공격력 배율: {selectedCharacter.DamageMultiplier}\n" +
                $"공격 속도: {selectedCharacter.AttackSpeedBonus}\n" +
                $"시작 무기: " +
                $"{selectedCharacter.StartingProjectile.DisplayName}";
        }

        if (confirmButton != null)
        {
            confirmButton.interactable = true;
        }
    }

    public void ConfirmCharacter()
    {
        if (selectedCharacter == null)
        {
            return;
        }

        if (ClientSession.Instance == null)
        {
            Debug.LogError(
                "ClientSession이 존재하지 않습니다.",
                this);

            return;
        }

        ClientSession.Instance.SetSelectedCharacter(
            selectedCharacter.CharacterId);

        SceneManager.LoadScene(
            gameSceneName);
    }

    private CharacterDefinition FindCharacter(
        int characterId)
    {
        foreach (CharacterDefinition character
                 in characters)
        {
            if (character != null &&
                character.CharacterId ==
                characterId)
            {
                return character;
            }
        }

        return null;
    }
}
