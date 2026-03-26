import { LABEL_FONT_SIZES, TLDefaultSizeStyle } from "tldraw";

export const BOARD_COLUMN_DEFAULT_WIDTH = 360;
export const BOARD_COLUMN_DEFAULT_HEIGHT = 240;
export const BOARD_COLUMN_MIN_WIDTH = 280;
export const BOARD_COLUMN_MIN_HEIGHT = 180;
export const BOARD_COLUMN_PADDING = 10;
export const BOARD_COLUMN_BODY_GAP = 10;
export const BOARD_COLUMN_CHILD_GAP = 8;
export const BOARD_COLUMN_SHELL_PADDING_TOP = 20;
export const BOARD_COLUMN_SHELL_PADDING_BOTTOM = 16;
export const BOARD_COLUMN_HEADER_MIN_HEIGHT = 58;
export const BOARD_COLUMN_HEADER_TEXT_GAP = 4;

export function getBoardColumnHeaderHeight(size: TLDefaultSizeStyle) {
	const titleHeight = LABEL_FONT_SIZES[size] * 1.3;
	const countHeight = Math.max(11, LABEL_FONT_SIZES[size] - 2) * 1.2;

	return Math.max(
		BOARD_COLUMN_HEADER_MIN_HEIGHT,
		Math.ceil(titleHeight + BOARD_COLUMN_HEADER_TEXT_GAP + countHeight),
	);
}

export function getBoardColumnBodyTop(size: TLDefaultSizeStyle) {
	return BOARD_COLUMN_SHELL_PADDING_TOP + getBoardColumnHeaderHeight(size) + BOARD_COLUMN_BODY_GAP;
}

export function getBoardColumnCollapsedHeight(size: TLDefaultSizeStyle) {
	return BOARD_COLUMN_SHELL_PADDING_TOP + getBoardColumnHeaderHeight(size) + BOARD_COLUMN_SHELL_PADDING_BOTTOM;
}
