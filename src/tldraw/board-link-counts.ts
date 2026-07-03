import { TLEditorSnapshot } from "tldraw";

export interface BoardLinkCounts {
	boardCount: number;
	cardCount: number;
}

const BOARD_LINK_CARD_TYPES = new Set([
	"board-note",
	"board-swatch",
	"board-todo",
	"image",
	"video",
]);

const BOARD_LINK_MEDIA_TYPES = new Set(["image", "video"]);

interface SnapshotShapeRecord {
	id: string;
	parentId?: string;
	type: string;
	typeName?: string;
}

export function getBoardLinkCountsFromSnapshot(
	snapshot: TLEditorSnapshot | undefined,
): BoardLinkCounts {
	const shapes = getSnapshotShapeRecords(snapshot);
	const shapesById = new Map(shapes.map((shape) => [shape.id, shape]));
	let boardCount = 0;
	let cardCount = 0;

	for (const shape of shapes) {
		if (shape.type === "board-link") {
			boardCount += 1;
			continue;
		}

		if (!BOARD_LINK_CARD_TYPES.has(shape.type)) {
			continue;
		}

		const parent = shape.parentId ? shapesById.get(shape.parentId) : undefined;
		if (parent && BOARD_LINK_MEDIA_TYPES.has(parent.type)) {
			continue;
		}

		cardCount += 1;
	}

	return { boardCount, cardCount };
}

export function formatBoardLinkCounts({
	boardCount,
	cardCount,
}: BoardLinkCounts) {
	const parts: string[] = [];

	if (boardCount > 0) {
		parts.push(`${boardCount} ${boardCount === 1 ? "board" : "boards"}`);
	}

	if (cardCount > 0) {
		parts.push(`${cardCount} ${cardCount === 1 ? "card" : "cards"}`);
	}

	return parts.length > 0 ? parts.join(", ") : "0 cards";
}

function getSnapshotShapeRecords(
	snapshot: TLEditorSnapshot | undefined,
): SnapshotShapeRecord[] {
	if (!snapshot?.document || typeof snapshot.document !== "object") {
		return [];
	}

	const store = (snapshot.document as { store?: unknown }).store;
	if (!store || typeof store !== "object") {
		return [];
	}

	return Object.values(store)
		.filter(isSnapshotShapeRecord);
}

function isSnapshotShapeRecord(value: unknown): value is SnapshotShapeRecord {
	if (!value || typeof value !== "object") {
		return false;
	}

	const record = value as Partial<SnapshotShapeRecord>;
	return (
		record.typeName === "shape" &&
		typeof record.id === "string" &&
		typeof record.type === "string"
	);
}
