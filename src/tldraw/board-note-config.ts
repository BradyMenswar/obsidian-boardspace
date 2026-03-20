export const BOARD_NOTE_DEFAULT_WIDTH = 320;
export const BOARD_NOTE_MIN_WIDTH = 240;
export const BOARD_NOTE_MIN_HEIGHT = 56;
export const BOARD_NOTE_WIDTH_SNAP_THRESHOLD = 24;

export function snapBoardNoteWidth(width: number) {
	if (Math.abs(width - BOARD_NOTE_DEFAULT_WIDTH) <= BOARD_NOTE_WIDTH_SNAP_THRESHOLD) {
		return BOARD_NOTE_DEFAULT_WIDTH;
	}

	return width;
}
