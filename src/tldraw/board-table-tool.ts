import { StateNode, Vec, createShapeId, maybeSnapToGrid } from "tldraw";

export class BoardTableTool extends StateNode {
	static override id = "table";
	static override initial = "idle";

	override onEnter() {
		this.editor.setCursor({ type: "cross", rotation: 0 });
	}

	override onPointerDown() {
		const center = this.editor.inputs.getOriginPagePoint().clone();
		const id = createShapeId();
		this.editor.createShape({
			id,
			type: "board-table",
			x: center.x - 240,
			y: center.y - 110,
		});
		const shape = this.editor.getShape(id);
		if (shape?.type === "board-table") {
			const snapped = maybeSnapToGrid(new Vec(shape.x, shape.y), this.editor);
			this.editor.updateShape({ id, type: shape.type, x: snapped.x, y: snapped.y });
			this.editor.select(id);
		}
		this.editor.setCurrentTool("select");
	}

	override onCancel() {
		this.editor.setCurrentTool("select");
	}
}
