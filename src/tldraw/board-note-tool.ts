import {
	DefaultFillStyle,
	DefaultSizeStyle,
	StateNode,
	createShapeId,
	maybeSnapToGrid,
	startEditingShapeWithRichText,
	toRichText,
	Vec,
} from "tldraw";
import {
	BOARD_NOTE_MIN_HEIGHT,
	BOARD_NOTE_DEFAULT_WIDTH,
} from "./board-note-config";
import {
	BoardNoteTopBarColorStyle,
	BoardNoteTopBarCustomColorStyle,
	BoardspaceColorStyle,
	BoardspaceCustomColorStyle,
	BoardNoteShape,
} from "./board-note-shape";

export class BoardNoteTool extends StateNode {
	static override id = "note";
	static override initial = "idle";

	shapeType = "board-note";

	override onEnter() {
		this.editor.setCursor({ type: "cross", rotation: 0 });
		this.editor.setStyleForNextShapes(DefaultFillStyle, "semi");
	}

	override onPointerDown() {
		const shape = createBoardNoteShapeAtPoint(
			this.editor,
			this.editor.inputs.getOriginPagePoint().clone(),
		);

		if (!shape) {
			this.editor.setCurrentTool("select");
			return;
		}

		focusBoardNoteForTyping(this.editor, shape.id, true);
	}

	override onCancel() {
		this.editor.setCurrentTool("select");
	}
}

export function createBoardNoteShapeAtPoint(
	editor: BoardNoteTool["editor"],
	center: Vec,
) {
	const id = createShapeId();

	editor.createShape({
		id,
		type: "board-note",
		x: center.x - BOARD_NOTE_DEFAULT_WIDTH / 2,
		y: center.y - BOARD_NOTE_MIN_HEIGHT / 2,
		props: {
			color: editor.getStyleForNextShape(BoardspaceColorStyle),
			customColor: editor.getStyleForNextShape(BoardspaceCustomColorStyle),
			fill:
				editor.getCurrentToolId() === "note"
					? editor.getStyleForNextShape(DefaultFillStyle)
					: "semi",
			h: BOARD_NOTE_MIN_HEIGHT,
			minH: BOARD_NOTE_MIN_HEIGHT,
			richText: toRichText(""),
			size: editor.getStyleForNextShape(DefaultSizeStyle),
			topBarColor: editor.getStyleForNextShape(BoardNoteTopBarColorStyle),
			topBarCustomColor: editor.getStyleForNextShape(
				BoardNoteTopBarCustomColorStyle,
			),
			w: BOARD_NOTE_DEFAULT_WIDTH,
		},
	});

	const shape = editor.getShape(id);
	if (!shape || shape.type !== "board-note") {
		return;
	}

	const snappedPoint = maybeSnapToGrid(new Vec(shape.x, shape.y), editor);

	editor.updateShapes([
		{
			id,
			type: "board-note",
			x: snappedPoint.x,
			y: snappedPoint.y,
		},
	]);

	const nextShape = editor.getShape(id);
	return nextShape && nextShape.type === "board-note" ? nextShape : undefined;
}

export function focusBoardNoteForTyping(
	editor: BoardNoteTool["editor"],
	shapeId: BoardNoteShape["id"],
	switchToSelectTool = false,
) {
	editor.select(shapeId);

	if (switchToSelectTool) {
		editor.setCurrentTool("select");
	}

	requestAnimationFrame(() => {
		if (!editor.getShape(shapeId)) {
			return;
		}

		editor.select(shapeId);
		startEditingShapeWithRichText(editor, shapeId, { selectAll: true });
	});
}
