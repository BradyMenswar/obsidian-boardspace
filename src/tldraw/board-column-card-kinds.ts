import type { TLShape } from "tldraw";

const COLUMN_CARD_TYPES = new Set<TLShape["type"]>([
	"board-note",
	"board-link",
	"board-swatch",
	"board-table",
	"board-todo",
	"image",
	"video",
]);

export function isColumnAllowedShapeType(type: TLShape["type"]) {
	return COLUMN_CARD_TYPES.has(type);
}

export function isColumnAllowedShape(shape: TLShape) {
	return isColumnAllowedShapeType(shape.type);
}
