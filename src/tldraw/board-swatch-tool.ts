import {
	StateNode,
	Vec,
	createShapeId,
	maybeSnapToGrid,
} from "tldraw";
import {
	BOARD_SWATCH_DEFAULT_HEIGHT,
	BOARD_SWATCH_DEFAULT_WIDTH,
} from "./board-swatch-config";
import {
	BoardSwatchColorValueStyle,
	BoardSwatchLabelModeStyle,
} from "./board-swatch-shape";

export class BoardSwatchTool extends StateNode {
	static override id = "swatch";
	static override initial = "idle";

	shapeType = "board-swatch";

	override onEnter() {
		this.editor.setCursor({ type: "cross", rotation: 0 });
	}

	override onPointerDown() {
		const shape = createBoardSwatchShapeAtPoint(
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

export function createBoardSwatchShapeAtPoint(
	editor: BoardSwatchTool["editor"],
	center: Vec,
) {
	const id = createShapeId();

	editor.createShape({
		id,
		type: "board-swatch",
		x: center.x - BOARD_SWATCH_DEFAULT_WIDTH / 2,
		y: center.y - BOARD_SWATCH_DEFAULT_HEIGHT / 2,
		props: {
			colorValue: editor.getStyleForNextShape(BoardSwatchColorValueStyle),
			h: BOARD_SWATCH_DEFAULT_HEIGHT,
			labelMode: editor.getStyleForNextShape(BoardSwatchLabelModeStyle),
			w: BOARD_SWATCH_DEFAULT_WIDTH,
		},
	});

	const shape = editor.getShape(id);
	if (!shape || shape.type !== "board-swatch") {
		return;
	}

	const snappedPoint = maybeSnapToGrid(new Vec(shape.x, shape.y), editor);
	editor.updateShapes([
		{
			id,
			type: "board-swatch",
			x: snappedPoint.x,
			y: snappedPoint.y,
		},
	]);

	const nextShape = editor.getShape(id);
	return nextShape && nextShape.type === "board-swatch" ? nextShape : undefined;
}
