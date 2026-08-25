import type { Editor, TLShape, TLShapeId } from "tldraw";
import { BOARDSPACE_PREFERRED_SIZE_META_KEY } from "../files/boardspace-editor-meta";
import { isColumnAllowedShape } from "./board-column-card-kinds";

interface PreferredSize {
	width: number;
	height: number;
}

export function registerBoardColumnPersistence(
	editor: Editor,
	// Browser confirmation is required before tldraw starts its atomic delete operation.
	// eslint-disable-next-line no-alert
	confirmDelete: (message: string) => boolean = (message) => window.confirm(message),
) {
	const removePreferredSizeHandler = editor.sideEffects.registerBeforeChangeHandler(
		"shape",
		(previous, next) => normalizePreferredRootSize(editor, previous, next),
	);
	const previousDeleteShapes = editor.deleteShapes;
	editor.deleteShapes = ((shapesOrIds: TLShape[] | TLShapeId[]) => {
		const shapes = shapesOrIds
			.map((shapeOrId) => typeof shapeOrId === "string" ? editor.getShape(shapeOrId) : shapeOrId)
			.filter((shape): shape is TLShape => Boolean(shape));
		const deletesNonEmptyColumn = shapes.some((shape) =>
			shape.type === "board-column" && editor.getSortedChildIdsForParent(shape.id).length > 0,
		);
		if (deletesNonEmptyColumn && !confirmDelete("Delete this column and all cards inside it?")) {
			return editor;
		}
		return previousDeleteShapes.call(editor, shapesOrIds as TLShape[]);
	}) as Editor["deleteShapes"];

	return () => {
		removePreferredSizeHandler?.();
		editor.deleteShapes = previousDeleteShapes;
	};
}

function normalizePreferredRootSize(editor: Editor, previous: TLShape, next: TLShape): TLShape {
	if (!isColumnAllowedShape(next)) return next;
	const previousParent = editor.getShape(previous.parentId);
	const nextParent = editor.getShape(next.parentId);
	const wasInColumn = previousParent?.type === "board-column";
	const willBeInColumn = nextParent?.type === "board-column";

	if (!wasInColumn && willBeInColumn) {
		const preferredSize = getShapePreferredSize(previous);
		return {
			...next,
			meta: {
				...next.meta,
				[BOARDSPACE_PREFERRED_SIZE_META_KEY]: { width: preferredSize.width, height: preferredSize.height },
			},
		};
	}
	if (wasInColumn && !willBeInColumn) {
		const preferredSize = readPreferredSize(previous.meta[BOARDSPACE_PREFERRED_SIZE_META_KEY]);
		if (!preferredSize) return next;
		const remainingMeta = { ...next.meta };
		delete remainingMeta[BOARDSPACE_PREFERRED_SIZE_META_KEY];
		return {
			...next,
			meta: remainingMeta,
			props: {
				...next.props,
				w: preferredSize.width,
				h: preferredSize.height,
				...(next.type === "board-note" ? { minH: preferredSize.height } : {}),
			},
		} as TLShape;
	}
	return next;
}

function getShapePreferredSize(shape: TLShape): PreferredSize {
	return {
		width: "w" in shape.props && typeof shape.props.w === "number" ? shape.props.w : 1,
		height: shape.type === "board-note" ? shape.props.minH : "h" in shape.props && typeof shape.props.h === "number" ? shape.props.h : 1,
	};
}

function readPreferredSize(value: unknown): PreferredSize | undefined {
	if (typeof value !== "object" || value === null) return undefined;
	const size = value as Partial<PreferredSize>;
	return typeof size.width === "number" && size.width > 0 && typeof size.height === "number" && size.height > 0
		? { width: size.width, height: size.height }
		: undefined;
}
