import {
	DefaultFillStyle,
	DefaultSizeStyle,
	StateNode,
	Vec,
	createShapeId,
	maybeSnapToGrid,
} from "tldraw";
import {
	BOARDSPACE_DEFAULT_CUSTOM_COLOR,
	BOARDSPACE_TRANSPARENT_TOP_BAR_COLOR,
	BoardNoteTopBarColorStyle,
	BoardNoteTopBarCustomColorStyle,
	BoardspaceColorStyle,
	BoardspaceCustomColorStyle,
} from "./board-note-shape";
import {
	BOARD_LINK_STANDALONE_HEIGHT,
	BOARD_LINK_STANDALONE_WIDTH,
	BoardLinkIconStyle,
	BoardLinkShape,
} from "./board-link-shape";

export class BoardLinkTool extends StateNode {
	static override id = "board-link";
	static override initial = "idle";

	shapeType = "board-link";

	override onEnter() {
		this.editor.setCursor({ type: "cross", rotation: 0 });
		this.editor.setStyleForNextShapes(DefaultFillStyle, "semi");
	}

	override onPointerDown() {
		const shape = createBoardLinkShapeAtPoint(
			this.editor,
			this.editor.inputs.getOriginPagePoint().clone(),
		);

		if (!shape) {
			this.editor.setCurrentTool("select");
			return;
		}

		this.editor.select(shape.id);
		this.editor.setCurrentTool("select");
	}

	override onCancel() {
		this.editor.setCurrentTool("select");
	}
}

export function createBoardLinkShapeAtPoint(
	editor: BoardLinkTool["editor"],
	center: Vec,
) {
	const id = createShapeId();

	editor.createShape({
		id,
		type: "board-link",
		x: center.x - BOARD_LINK_STANDALONE_WIDTH / 2,
		y: center.y - BOARD_LINK_STANDALONE_HEIGHT / 2,
		props: {
			boardCount: 0,
			cardCount: 0,
			color: editor.getStyleForNextShape(BoardspaceColorStyle) ?? "grey",
			customColor:
				editor.getStyleForNextShape(BoardspaceCustomColorStyle) ??
				BOARDSPACE_DEFAULT_CUSTOM_COLOR,
			dash: "solid",
			filePath: "",
			fill:
				editor.getCurrentToolId() === "board-link"
					? editor.getStyleForNextShape(DefaultFillStyle)
					: "semi",
			h: BOARD_LINK_STANDALONE_HEIGHT,
			icon: editor.getStyleForNextShape(BoardLinkIconStyle),
			size: editor.getStyleForNextShape(DefaultSizeStyle),
			title: "Untitled board",
			topBarColor:
				editor.getStyleForNextShape(BoardNoteTopBarColorStyle) ??
				BOARDSPACE_TRANSPARENT_TOP_BAR_COLOR,
			topBarCustomColor:
				editor.getStyleForNextShape(BoardNoteTopBarCustomColorStyle) ??
				"#f8fafc",
			w: BOARD_LINK_STANDALONE_WIDTH,
		},
	});

	const shape = editor.getShape(id);
	if (!shape || shape.type !== "board-link") {
		return;
	}

	const snappedPoint = maybeSnapToGrid(new Vec(shape.x, shape.y), editor);

	editor.updateShapes([
		{
			id,
			type: "board-link",
			x: snappedPoint.x,
			y: snappedPoint.y,
		},
	]);

	const nextShape = editor.getShape(id);
	return nextShape && nextShape.type === "board-link"
		? (nextShape as BoardLinkShape)
		: undefined;
}
