using UnityEngine;

[DisallowMultipleComponent]
[RequireComponent(typeof(SpriteRenderer))]
public sealed class PlayerOutline :
    MonoBehaviour
{
    [Header("Material")]
    [SerializeField]
    private Material silhouetteMaterial;

    [Header("Colors")]
    [SerializeField]
    private Color localPlayerColor =
        new Color(0.1f, 1f, 0.2f, 1f);

    [SerializeField]
    private Color remotePlayerColor =
        new Color(1f, 0.15f, 0.15f, 1f);

    [Header("Outline")]
    [SerializeField, Min(1)]
    private int thicknessPixels = 1;

    private static readonly Vector2[] Directions =
    {
        Vector2.up,
        Vector2.down,
        Vector2.left,
        Vector2.right,
        new Vector2(1f, 1f),
        new Vector2(1f, -1f),
        new Vector2(-1f, 1f),
        new Vector2(-1f, -1f)
    };

    private SpriteRenderer sourceRenderer;
    private SpriteRenderer[] outlineRenderers;

    private Color currentColor;

    private void Awake()
    {
        sourceRenderer =
            GetComponent<SpriteRenderer>();

        CreateOutlineRenderers();

        currentColor = remotePlayerColor;
    }

    public void Configure(bool isLocalPlayer)
    {
        currentColor =
            isLocalPlayer
                ? localPlayerColor
                : remotePlayerColor;
    }

    private void CreateOutlineRenderers()
    {
        outlineRenderers =
            new SpriteRenderer[
                Directions.Length];

        for (
            int index = 0;
            index < Directions.Length;
            index++)
        {
            GameObject outlineObject =
                new GameObject(
                    $"Outline_{index}");

            outlineObject.transform.SetParent(
                transform,
                false);

            outlineObject.layer =
                gameObject.layer;

            SpriteRenderer outlineRenderer =
                outlineObject.AddComponent<
                    SpriteRenderer>();

            outlineRenderer.sharedMaterial =
                silhouetteMaterial;

            outlineRenderers[index] =
                outlineRenderer;
        }
    }

    private void LateUpdate()
    {
        if (
            sourceRenderer == null ||
            outlineRenderers == null)
        {
            return;
        }

        Sprite currentSprite =
            sourceRenderer.sprite;

        float pixelsPerUnit =
            currentSprite != null
                ? currentSprite.pixelsPerUnit
                : 16f;

        float worldOffset =
            thicknessPixels /
            Mathf.Max(1f, pixelsPerUnit);

        for (
            int index = 0;
            index < outlineRenderers.Length;
            index++)
        {
            SpriteRenderer outline =
                outlineRenderers[index];

            outline.enabled =
                sourceRenderer.enabled &&
                currentSprite != null;

            outline.sprite = currentSprite;
            outline.color = currentColor;

            outline.flipX =
                sourceRenderer.flipX;

            outline.flipY =
                sourceRenderer.flipY;

            outline.sortingLayerID =
                sourceRenderer.sortingLayerID;

            outline.sortingOrder =
                sourceRenderer.sortingOrder - 1;

            outline.spriteSortPoint =
                sourceRenderer.spriteSortPoint;

            Vector2 direction =
                Directions[index].normalized;

            outline.transform.localPosition =
                direction * worldOffset;

            outline.transform.localRotation =
                Quaternion.identity;

            outline.transform.localScale =
                Vector3.one;
        }
    }
}