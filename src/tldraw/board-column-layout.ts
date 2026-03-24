import {
	Editor,
	TLParentId,
	TLShape,
	TLShapeId,
	TLShapePartial,
	ZERO_INDEX_KEY,
	getIndexAbove,
} from "@tldraw/editor";
import {
	BOARD_COLUMN_BODY_GAP,
	BOARD_COLUMN_CHILD_GAP,
	BOARD_COLUMN_MIN_HEIGHT,
	BOARD_COLUMN_PADDING,
	getBoardColumnBodyTop,
	BOARD_COLUMN_SHELL_PADDING_BOTTOM,
} from "./board-column-config";
import { BoardNoteShape, getBoardNoteMeasuredHeight } from "./board-note-shape";
import { BoardTodoShape, getBoardTodoMeasuredHeight } from "./board-todo-shape";
import { TLDefaultSizeStyle } from "@tldraw/tlschema";

const COLUMN_ALLOWED_SHAPE_TYPES = new Set<TLShape["type"]>([
	"board-note",
	"board-todo",
]);

type BoardColumnCounterKind = "board" | "card";

export function isColumnAllowedShapeType(type: TLShape["type"]) {
	return COLUMN_ALLOWED_SHAPE_TYPES.has(type);
}

export function isColumnAllowedShape(shape: TLShape) {
	return isColumnAllowedShapeType(shape.type);
}

export function getBoardColumnChildKinds(shapes: TLShape[]) {
	const counts: Record<BoardColumnCounterKind, number> = {
		board: 0,
		card: 0,
	};

	for (const shape of shapes) {
		const kind = getBoardColumnCounterKind(shape);
		if (!kind) {
			continue;
		}

		counts[kind] += 1;
	}

	return counts;
}

export function formatBoardColumnCounts(shapes: TLShape[]) {
	const counts = getBoardColumnChildKinds(shapes);
	const parts: string[] = [];

	if (counts.board > 0) {
		parts.push(`${counts.board} ${counts.board === 1 ? "board" : "boards"}`);
	}

	if (counts.card > 0) {
		parts.push(`${counts.card} ${counts.card === 1 ? "card" : "cards"}`);
	}

	if (parts.length === 0) {
		return "0 cards";
	}

	return parts.join(", ");
}

export function getBoardColumnInnerWidth(width: number) {
	return Math.max(160, width - BOARD_COLUMN_PADDING * 2);
}

export function getBoardColumnLayoutResult(
	editor: Editor,
	parentId: TLShapeId,
	width: number,
	size: TLDefaultSizeStyle,
	minHeight = BOARD_COLUMN_MIN_HEIGHT,
	childShapes = getBoardColumnChildren(editor, parentId),
) {
	const innerWidth = getBoardColumnInnerWidth(width);
	let nextY = getBoardColumnBodyTop(size);
	const updates: TLShapePartial[] = [];

	for (const shape of childShapes) {
		if (shape.type === "board-note") {
			const nextShape = getNormalizedBoardNoteShape(editor, shape, innerWidth, nextY);
			updates.push(nextShape.update);
			nextY += nextShape.height;
			nextY += BOARD_COLUMN_CHILD_GAP;
			continue;
		}

		if (shape.type === "board-todo") {
			const nextShape = getNormalizedBoardTodoShape(editor, shape, innerWidth, nextY);
			updates.push(nextShape.update);
			nextY += nextShape.height;
			nextY += BOARD_COLUMN_CHILD_GAP;
		}
	}

	const contentHeight =
		childShapes.length === 0
			? minHeight
			: Math.max(
					minHeight,
					nextY - BOARD_COLUMN_CHILD_GAP + BOARD_COLUMN_SHELL_PADDING_BOTTOM,
			  );

	return {
		columnHeight: contentHeight,
		updates,
	};
}

export function getBoardColumnChildren(editor: Editor, parentId: TLParentId) {
	return editor
		.getSortedChildIdsForParent(parentId)
		.map((childId) => editor.getShape(childId))
		.filter((shape): shape is TLShape => Boolean(shape))
		.filter(isColumnAllowedShape);
}

export function getBoardColumnVisualOrder(editor: Editor, parentId: TLParentId) {
	const children = getBoardColumnChildren(editor, parentId);

	return [...children].sort((a, b) => {
		if (Math.abs(a.y - b.y) >= 1) {
			return a.y - b.y;
		}

		return a.index < b.index ? -1 : a.index > b.index ? 1 : 0;
	});
}

export function getBoardColumnReorderUpdates(
	editor: Editor,
	parentId: TLParentId,
	childShapes = getBoardColumnVisualOrder(editor, parentId),
) {
	const currentOrder = getBoardColumnChildren(editor, parentId);

	if (
		currentOrder.length === childShapes.length &&
		currentOrder.every((shape, index) => shape.id === childShapes[index]?.id)
	) {
		return [] as TLShapePartial[];
	}

	let nextIndex = ZERO_INDEX_KEY;

	return childShapes.map((shape) => {
		nextIndex = getIndexAbove(nextIndex);
		return {
			id: shape.id,
			type: shape.type,
			index: nextIndex,
		} satisfies TLShapePartial;
	});
}

export function getBoardColumnInsertionIndicatorY(
	editor: Editor,
	parentId: TLParentId,
	draggedShapeId: TLShapeId,
	size: TLDefaultSizeStyle,
) {
	const draggedShape = editor.getShape(draggedShapeId);
	if (!draggedShape || !isBoardColumnCardShape(draggedShape)) {
		return null;
	}

	const siblings = getBoardColumnChildren(editor, parentId)
		.filter(isBoardColumnCardShape)
		.filter((shape) => shape.id !== draggedShapeId)
		.sort((a, b) => {
			if (Math.abs(a.y - b.y) >= 1) {
				return a.y - b.y;
			}

			return a.index < b.index ? -1 : a.index > b.index ? 1 : 0;
		});

	if (siblings.length === 0) {
		return getBoardColumnBodyTop(size) + BOARD_COLUMN_CHILD_GAP / 2;
	}

	const draggedCenterY = draggedShape.y + getBoardColumnCardHeight(draggedShape) / 2;

	for (const sibling of siblings) {
		const siblingCenterY = sibling.y + getBoardColumnCardHeight(sibling) / 2;
		if (draggedCenterY < siblingCenterY) {
			return Math.max(
				getBoardColumnBodyTop(size),
				sibling.y - BOARD_COLUMN_CHILD_GAP / 2,
			);
		}
	}

	const lastSibling = siblings[siblings.length - 1];
	if (!lastSibling) {
		return getBoardColumnBodyTop(size) + BOARD_COLUMN_CHILD_GAP / 2;
	}

	return lastSibling.y + getBoardColumnCardHeight(lastSibling) + BOARD_COLUMN_CHILD_GAP / 2;
}

export function getAffectedBoardColumnIdsForShapeChange(
	editor: Editor,
	from: TLShape | null | undefined,
	to: TLShape | null | undefined,
) {
	const affected = new Set<TLShapeId>();

	for (const shape of [from, to]) {
		if (!shape) {
			continue;
		}

		if (shape.type === "board-column") {
			affected.add(shape.id);
		}

		const parent = editor.getShape(shape.parentId);
		if (parent?.type === "board-column") {
			affected.add(parent.id);
		}
	}

	return affected;
}

function getBoardColumnCounterKind(shape: TLShape): BoardColumnCounterKind | undefined {
	if (shape.type === "board-note" || shape.type === "board-todo") {
		return "card";
	}

	return undefined;
}

function getNormalizedBoardNoteShape(
	editor: Editor,
	shape: BoardNoteShape,
	width: number,
	y: number,
): { height: number; update: TLShapePartial<BoardNoteShape> } {
	const measuredHeight = Math.max(
		shape.props.minH,
		getBoardNoteMeasuredHeight(editor, {
			...shape,
			props: {
				...shape.props,
				w: width,
			},
		}),
	);

	return {
		height: measuredHeight,
		update: {
			id: shape.id,
			type: shape.type,
			x: BOARD_COLUMN_PADDING,
			y,
			props: {
				h: measuredHeight,
				w: width,
			},
		},
	};
}

function getNormalizedBoardTodoShape(
	editor: Editor,
	shape: BoardTodoShape,
	width: number,
	y: number,
): { height: number; update: TLShapePartial<BoardTodoShape> } {
	const measuredHeight = getBoardTodoMeasuredHeight(editor, {
		...shape,
		props: {
			...shape.props,
			w: width,
		},
	});

	return {
		height: measuredHeight,
		update: {
			id: shape.id,
			type: shape.type,
			x: BOARD_COLUMN_PADDING,
			y,
			props: {
				h: measuredHeight,
				w: width,
			},
		},
	};
}

function isBoardColumnCardShape(
	shape: TLShape,
): shape is BoardNoteShape | BoardTodoShape {
	return shape.type === "board-note" || shape.type === "board-todo";
}

function getBoardColumnCardHeight(shape: BoardNoteShape | BoardTodoShape) {
	return shape.props.h;
}
