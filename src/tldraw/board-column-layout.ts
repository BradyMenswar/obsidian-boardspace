import {
	Editor,
	TLDefaultSizeStyle,
	TLParentId,
	TLShape,
	TLShapeId,
	TLShapePartial,
	ZERO_INDEX_KEY,
	getIndexAbove,
} from "tldraw";
import {
	BOARD_COLUMN_BODY_GAP,
	BOARD_COLUMN_CHILD_GAP,
	BOARD_COLUMN_MIN_HEIGHT,
	BOARD_COLUMN_PADDING,
	getBoardColumnBodyTop,
	BOARD_COLUMN_SHELL_PADDING_BOTTOM,
} from "./board-column-config";
import { BOARD_NOTE_MIN_HEIGHT } from "./board-note-config";
import {
	BOARD_LINK_COLUMN_HEIGHT,
	BoardLinkShape,
} from "./board-link-shape";
import { BoardNoteShape, getBoardNoteMeasuredHeight } from "./board-note-shape";
import { BoardSwatchShape } from "./board-swatch-shape";
import { BoardTodoShape, getBoardTodoMeasuredHeight } from "./board-todo-shape";
import {
	BoardspaceMediaShape,
	getBoardspaceMediaCaptionHeight,
	getBoardspaceMediaCaptionShape,
	getBoardspaceMediaCardHeight,
	isBoardspaceMediaCaptionShape,
	isBoardspaceMediaShape,
} from "./boardspace-media-caption";
const COLUMN_ALLOWED_SHAPE_TYPES = new Set<TLShape["type"]>([
	"board-note",
	"board-link",
	"board-swatch",
	"board-todo",
	"image",
	"video",
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
			continue;
		}

		if (shape.type === "board-link") {
			const nextShape = getNormalizedBoardLinkShape(shape, innerWidth, nextY);
			updates.push(nextShape.update);
			nextY += nextShape.height;
			nextY += BOARD_COLUMN_CHILD_GAP;
			continue;
		}

		if (shape.type === "board-swatch") {
			const nextShape = getNormalizedBoardSwatchShape(shape, innerWidth, nextY);
			updates.push(nextShape.update);
			nextY += nextShape.height;
			nextY += BOARD_COLUMN_CHILD_GAP;
			continue;
		}

		if (isBoardspaceMediaShape(shape)) {
			const nextShape = getNormalizedBoardMediaShape(editor, shape, innerWidth, nextY);
			updates.push(...nextShape.updates);
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

	const draggedCenterY =
		draggedShape.y + getBoardColumnCardHeight(draggedShape, editor) / 2;

	for (const sibling of siblings) {
		const siblingCenterY =
			sibling.y + getBoardColumnCardHeight(sibling, editor) / 2;
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

	return (
		lastSibling.y +
		getBoardColumnCardHeight(lastSibling, editor) +
		BOARD_COLUMN_CHILD_GAP / 2
	);
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
			continue;
		}

		if (isBoardspaceMediaCaptionShape(shape) && isBoardspaceMediaShape(parent)) {
			const column = editor.getShape(parent.parentId);
			if (column?.type === "board-column") {
				affected.add(column.id);
			}
			continue;
		}

		if (isBoardspaceMediaShape(shape)) {
			const column = editor.getShape(shape.parentId);
			if (column?.type === "board-column") {
				affected.add(column.id);
			}
		}
	}

	return affected;
}

function getBoardColumnCounterKind(shape: TLShape): BoardColumnCounterKind | undefined {
	if (shape.type === "board-link") {
		return "board";
	}

	if (
		shape.type === "board-note" ||
		shape.type === "board-swatch" ||
		shape.type === "board-todo"
	) {
		return "card";
	}

	if (isBoardspaceMediaShape(shape)) {
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

function getNormalizedBoardSwatchShape(
	shape: BoardSwatchShape,
	width: number,
	y: number,
): { height: number; update: TLShapePartial<BoardSwatchShape> } {
	return {
		height: shape.props.h,
		update: {
			id: shape.id,
			type: shape.type,
			x: BOARD_COLUMN_PADDING,
			y,
			props: {
				h: shape.props.h,
				w: width,
			},
		},
	};
}

function isBoardColumnCardShape(
	shape: TLShape,
) : shape is BoardLinkShape | BoardNoteShape | BoardSwatchShape | BoardTodoShape | BoardspaceMediaShape {
	return (
		shape.type === "board-link" ||
		shape.type === "board-note" ||
		shape.type === "board-swatch" ||
		shape.type === "board-todo" ||
		isBoardspaceMediaShape(shape)
	);
}

function getBoardColumnCardHeight(
	shape: BoardLinkShape | BoardNoteShape | BoardSwatchShape | BoardTodoShape | BoardspaceMediaShape,
	editor?: Editor,
) {
	if (isBoardspaceMediaShape(shape)) {
		return editor ? getBoardspaceMediaCardHeight(editor, shape) : shape.props.h;
	}

	return shape.props.h;
}

function getNormalizedBoardLinkShape(
	shape: BoardLinkShape,
	width: number,
	y: number,
): { height: number; update: TLShapePartial<BoardLinkShape> } {
	return {
		height: BOARD_LINK_COLUMN_HEIGHT,
		update: {
			id: shape.id,
			type: shape.type,
			x: BOARD_COLUMN_PADDING,
			y,
			props: {
				h: BOARD_LINK_COLUMN_HEIGHT,
				w: width,
			},
		},
	};
}

function getNormalizedBoardMediaShape(
	editor: Editor,
	shape: BoardspaceMediaShape,
	width: number,
	y: number,
): { height: number; updates: TLShapePartial[] } {
	const mediaHeight =
		shape.props.w > 0 ? (width / shape.props.w) * shape.props.h : shape.props.h;
	const captionShape = getBoardspaceMediaCaptionShape(editor, shape.id);
	const updates: TLShapePartial[] = [
		{
			id: shape.id,
			type: shape.type,
			x: BOARD_COLUMN_PADDING,
			y,
			props: {
				h: mediaHeight,
				w: width,
			},
		},
	];

	if (!captionShape) {
		return {
			height: mediaHeight,
			updates,
		};
	}

	const captionHeight = getBoardspaceMediaCaptionHeight(
		editor,
		{
			...shape,
			props: {
				...shape.props,
				h: mediaHeight,
				w: width,
			},
		} as BoardspaceMediaShape,
		captionShape,
	);

	updates.push({
		id: captionShape.id,
		type: captionShape.type,
		x: 0,
		y: mediaHeight,
		props: {
			h: captionHeight,
			minH: BOARD_NOTE_MIN_HEIGHT,
			w: width,
		},
	});

	return {
		height: mediaHeight + captionHeight,
		updates,
	};
}
