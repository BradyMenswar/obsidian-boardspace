import { TLDefaultSizeStyle } from "@tldraw/tlschema";
import { LABEL_FONT_SIZES } from "tldraw";

export const BOARD_TODO_DEFAULT_WIDTH = 320;
export const BOARD_TODO_MIN_WIDTH = 220;
export const BOARD_TODO_MIN_HEIGHT = 68;
export const BOARD_TODO_TOP_BAR_HEIGHT = 4;
const BOARD_TODO_BASE_HORIZONTAL_PADDING = 14;
const BOARD_TODO_BASE_VERTICAL_PADDING = 14;
const BOARD_TODO_BASE_ROW_HEIGHT = 28;
const BOARD_TODO_BASE_ROW_GAP = 6;
const BOARD_TODO_BASE_CHECKBOX_SIZE = 16;
const BOARD_TODO_BASE_DRAG_HANDLE_WIDTH = 14;

export function getBoardTodoHorizontalPadding(size: TLDefaultSizeStyle) {
	return Math.max(
		BOARD_TODO_BASE_HORIZONTAL_PADDING,
		Math.ceil(LABEL_FONT_SIZES[size] * 0.9),
	);
}

export function getBoardTodoVerticalPadding(size: TLDefaultSizeStyle) {
	return Math.max(
		BOARD_TODO_BASE_VERTICAL_PADDING,
		Math.ceil(LABEL_FONT_SIZES[size] * 0.9),
	);
}

export function getBoardTodoRowHeight(size: TLDefaultSizeStyle) {
	return Math.max(
		BOARD_TODO_BASE_ROW_HEIGHT,
		Math.ceil(LABEL_FONT_SIZES[size] * 1.9),
	);
}

export function getBoardTodoRowGap(size: TLDefaultSizeStyle) {
	return Math.max(
		BOARD_TODO_BASE_ROW_GAP,
		Math.ceil(LABEL_FONT_SIZES[size] * 0.35),
	);
}

export function getBoardTodoCheckboxSize(size: TLDefaultSizeStyle) {
	return Math.max(
		BOARD_TODO_BASE_CHECKBOX_SIZE,
		Math.ceil(LABEL_FONT_SIZES[size] * 1.1),
	);
}

export function getBoardTodoDragHandleWidth(size: TLDefaultSizeStyle) {
	return Math.max(
		BOARD_TODO_BASE_DRAG_HANDLE_WIDTH,
		Math.ceil(LABEL_FONT_SIZES[size] * 0.9),
	);
}

export function getBoardTodoAutoHeight(
	taskCount: number,
	size: TLDefaultSizeStyle,
	hasTitle: boolean,
) {
	const normalizedTaskCount = Math.max(1, taskCount);
	const rowHeight = getBoardTodoRowHeight(size);
	const rowGap = getBoardTodoRowGap(size);
	const verticalPadding = getBoardTodoVerticalPadding(size);
	const taskHeight =
		normalizedTaskCount * rowHeight +
		Math.max(0, normalizedTaskCount - 1) * rowGap;
	const headerHeight = hasTitle ? Math.ceil(LABEL_FONT_SIZES[size] * 1.3) + rowGap : 0;

	return Math.max(
		BOARD_TODO_MIN_HEIGHT,
		BOARD_TODO_TOP_BAR_HEIGHT +
			verticalPadding +
			headerHeight +
			taskHeight +
			verticalPadding,
	);
}
