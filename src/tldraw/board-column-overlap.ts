import { Editor, TLShape } from "tldraw";
import {
	BOARD_COLUMN_PADDING,
	BOARD_COLUMN_SHELL_PADDING_BOTTOM,
	getBoardColumnBodyTop,
} from "./board-column-config";

type BoardColumnLike = Extract<TLShape, { type: "board-column" }>;

export function doesShapeOverlapBoardColumnBody(
	editor: Editor,
	column: BoardColumnLike,
	shape: TLShape,
	visibleHeight = column.props.h,
) {
	const columnBounds = editor.getShapePageBounds(column.id);
	const shapeBounds = editor.getShapePageBounds(shape.id);

	if (!columnBounds || !shapeBounds) {
		return false;
	}

	const bodyTop = getBoardColumnBodyTop(column.props.size);
	const bodyBounds = columnBounds.clone();
	bodyBounds.x += BOARD_COLUMN_PADDING;
	bodyBounds.y += bodyTop;
	bodyBounds.w = Math.max(0, bodyBounds.w - BOARD_COLUMN_PADDING * 2);
	bodyBounds.h = Math.max(
		0,
		visibleHeight - bodyTop - BOARD_COLUMN_SHELL_PADDING_BOTTOM,
	);

	bodyBounds.y -= BOARD_COLUMN_PADDING;
	bodyBounds.h += BOARD_COLUMN_PADDING * 2;

	return bodyBounds.collides(shapeBounds);
}
