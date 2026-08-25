export const BOARDSPACE_CANVAS_ITEM_ID_META_KEY = "boardspaceCanvasItemId";
export const BOARDSPACE_PREFERRED_SIZE_META_KEY = "boardspacePreferredSize";

export function getBoardspaceCanvasItemMeta(
	id: string,
	meta: Record<string, unknown> = {},
) {
	return { ...meta, [BOARDSPACE_CANVAS_ITEM_ID_META_KEY]: id };
}

export function isBoardspaceEditorMeta(
	value: unknown,
	additionalKeys: string[] = [],
) {
	if (value === undefined) return true;
	if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
	const meta = value as Record<string, unknown>;
	const allowedKeys = new Set([BOARDSPACE_CANVAS_ITEM_ID_META_KEY, ...additionalKeys]);
	return Object.keys(meta).every((key) => allowedKeys.has(key)) &&
		(meta[BOARDSPACE_CANVAS_ITEM_ID_META_KEY] === undefined || typeof meta[BOARDSPACE_CANVAS_ITEM_ID_META_KEY] === "string");
}
