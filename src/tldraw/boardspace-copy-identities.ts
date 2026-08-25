import {
	BOARDSPACE_CANVAS_ITEM_ID_META_KEY,
	getBoardspaceCanvasItemMeta,
} from "../files/boardspace-editor-meta";
import { BOARDSPACE_ARROW_TARGET_META_KEY } from "../files/boardspace-arrow-adapter";
import { Editor, TLShape, TLShapePartial } from "tldraw";
import { createBoardTableNestedIdentity } from "./board-table-shape";
import { createBoardTodoTask } from "./board-todo-shape";

const CANVAS_ITEM_TYPES = new Set([
	"arrow",
	"board-column",
	"board-link",
	"board-note",
	"board-swatch",
	"board-table",
	"board-todo",
	"draw",
	"image",
	"video",
]);

export function registerBoardspaceCopyIdentityNormalization(editor: Editor) {
	let isNormalizing = false;

	const normalize = () => {
		if (isNormalizing) return;
		const shapes = editor.getCurrentPageShapes().filter(isCanvasItemShape);
		const copiedShapes = shapes.filter((shape) => {
			const originId = shape.meta[BOARDSPACE_CANVAS_ITEM_ID_META_KEY];
			return typeof originId === "string" && originId !== itemId(shape);
		});
		const copiedIdsByOrigin = new Map<string, string>();
		for (const shape of copiedShapes) {
			const originId = shape.meta[BOARDSPACE_CANVAS_ITEM_ID_META_KEY];
			if (typeof originId === "string") copiedIdsByOrigin.set(originId, itemId(shape));
		}
		const shapeUpdates: TLShapePartial[] = shapes.flatMap((shape) => {
			const copied = copiedShapes.includes(shape);
			const meta = getBoardspaceCanvasItemMeta(itemId(shape), shape.meta);
			if (copied && shape.type === "board-todo") {
				return [{ id: shape.id, type: shape.type, meta, props: {
					tasks: shape.props.tasks.map((task) => createBoardTodoTask(task.text, task.checked)),
				} }];
			}
			if (copied && shape.type === "board-table") {
				const columnIds = new Map(shape.props.columns.map((column) => [
					column.id,
					createBoardTableNestedIdentity("table-column"),
				]));
				return [{ id: shape.id, type: shape.type, meta, props: {
					columns: shape.props.columns.map((column) => ({ ...column, id: columnIds.get(column.id)! })),
					rows: shape.props.rows.map((row) => ({
						...row,
						id: createBoardTableNestedIdentity("table-row"),
						cells: row.cells.map((cell) => ({ ...cell, columnId: columnIds.get(cell.columnId) ?? cell.columnId })),
					})),
				} }];
			}
			return shape.meta[BOARDSPACE_CANVAS_ITEM_ID_META_KEY] === itemId(shape)
				? []
				: [{ id: shape.id, type: shape.type, meta }];
		});
		const bindingUpdates = copiedShapes
			.filter((shape) => shape.type === "arrow")
			.flatMap((arrow) => editor.getBindingsFromShape(arrow, "arrow"))
			.flatMap((binding) => {
				const oldTargetId = binding.meta[BOARDSPACE_ARROW_TARGET_META_KEY];
				const newTargetId = typeof oldTargetId === "string" ? copiedIdsByOrigin.get(oldTargetId) : undefined;
				return newTargetId
					? [{ id: binding.id, type: binding.type, meta: { ...binding.meta, [BOARDSPACE_ARROW_TARGET_META_KEY]: newTargetId } }]
					: [];
			});
		if (shapeUpdates.length === 0 && bindingUpdates.length === 0) return;

		isNormalizing = true;
		try {
			editor.run(() => {
				if (shapeUpdates.length > 0) editor.updateShapes(shapeUpdates);
				if (bindingUpdates.length > 0) editor.updateBindings(bindingUpdates);
			}, { history: "ignore" });
		} finally {
			isNormalizing = false;
		}
	};

	const remove = editor.sideEffects.registerOperationCompleteHandler(normalize);
	normalize();
	return remove;
}

function isCanvasItemShape(shape: TLShape) {
	return CANVAS_ITEM_TYPES.has(shape.type) && shape.meta.boardspaceMediaCaption !== true;
}

function itemId(shape: TLShape) {
	return shape.id.slice("shape:".length);
}
