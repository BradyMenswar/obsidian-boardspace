import {
	BaseBoxShapeTool,
	TLShape,
	TLShapeId,
} from "tldraw";

export class BoardColumnTool extends BaseBoxShapeTool {
	static override id = "column";
	static override initial = "idle";

	override shapeType = "board-column" as const;

	override onCreate(shape: TLShape | null): void {
		if (!shape) {
			return;
		}

		const bounds = this.editor.getShapePageBounds(shape);
		if (!bounds) {
			return;
		}

		const shapesToAddToColumn: TLShapeId[] = [];
		const ancestorIds = this.editor.getShapeAncestors(shape).map((ancestor) => ancestor.id);

		for (const siblingShapeId of this.editor.getSortedChildIdsForParent(shape.parentId)) {
			const siblingShape = this.editor.getShape(siblingShapeId);
			if (!siblingShape) {
				continue;
			}

			if (siblingShape.id === shape.id || siblingShape.isLocked) {
				continue;
			}

			const siblingBounds = this.editor.getShapePageBounds(siblingShape);
			if (!siblingBounds || !bounds.contains(siblingBounds)) {
				continue;
			}

			if (!canEnclose(siblingShape, ancestorIds, shape)) {
				continue;
			}

			shapesToAddToColumn.push(siblingShape.id);
		}

		if (shapesToAddToColumn.length > 0) {
			this.editor.reparentShapes(shapesToAddToColumn, shape.id);
		}

		if (this.editor.getInstanceState().isToolLocked) {
			this.editor.setCurrentTool("column");
			return;
		}

		this.editor.setCurrentTool("select.idle");
	}
}

function canEnclose(shape: TLShape, ancestorIds: TLShapeId[], column: TLShape) {
	if (ancestorIds.includes(shape.id)) {
		return false;
	}

	return shape.parentId === column.parentId;
}

