import {
	DefaultColorStyle,
	DefaultFillStyle,
	DefaultSizeStyle,
	StateNode,
	Vec,
	createShapeId,
	maybeSnapToGrid,
} from "tldraw";
import {
	BOARD_TODO_DEFAULT_WIDTH,
	getBoardTodoAutoHeight,
} from "./board-todo-config";
import {
	BoardTodoShape,
	createBoardTodoTask,
} from "./board-todo-shape";

export class BoardTodoTool extends StateNode {
	static override id = "todo";
	static override initial = "idle";

	shapeType = "board-todo";

	override onEnter() {
		this.editor.setCursor({ type: "cross", rotation: 0 });
		this.editor.setStyleForNextShapes(DefaultFillStyle, "semi");
	}

	override onPointerDown() {
		const shape = createBoardTodoShapeAtPoint(
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

export function createBoardTodoShapeAtPoint(
	editor: BoardTodoTool["editor"],
	center: Vec,
) {
	const id = createShapeId();
	const size = editor.getStyleForNextShape(DefaultSizeStyle);
	const height = getBoardTodoAutoHeight(1, size, false);

	editor.createShape({
		id,
		type: "board-todo",
		x: center.x - BOARD_TODO_DEFAULT_WIDTH / 2,
		y: center.y - height / 2,
		props: {
			color: editor.getStyleForNextShape(DefaultColorStyle),
			fill:
				editor.getCurrentToolId() === "todo"
					? editor.getStyleForNextShape(DefaultFillStyle)
					: "semi",
			h: height,
			size,
			tasks: [createBoardTodoTask()],
			title: "",
			topBarColor: editor.getStyleForNextShape(DefaultColorStyle),
			topBarEnabled: false,
			w: BOARD_TODO_DEFAULT_WIDTH,
		},
	});

	const shape = editor.getShape(id);
	if (!shape || shape.type !== "board-todo") {
		return;
	}

	const snappedPoint = maybeSnapToGrid(new Vec(shape.x, shape.y), editor);
	editor.updateShapes([
		{
			id,
			type: "board-todo",
			x: snappedPoint.x,
			y: snappedPoint.y,
		},
	]);

	const nextShape = editor.getShape(id);
	return nextShape && nextShape.type === "board-todo" ? nextShape : undefined;
}
