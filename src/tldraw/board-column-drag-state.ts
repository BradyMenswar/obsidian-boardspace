import { TLShapeId } from "@tldraw/editor";
import { IndexKey } from "@tldraw/utils";
import { useSyncExternalStore } from "react";

export interface BoardColumnDragState {
	draggedShapeId: TLShapeId | null;
	indicatorY: number | null;
	placeholderHeight: number | null;
	placeholderY: number | null;
	sourceColumnId: TLShapeId | null;
	sourceIndex: IndexKey | null;
	targetColumnId: TLShapeId | null;
}

const DEFAULT_BOARD_COLUMN_DRAG_STATE: BoardColumnDragState = {
	draggedShapeId: null,
	indicatorY: null,
	placeholderHeight: null,
	placeholderY: null,
	sourceColumnId: null,
	sourceIndex: null,
	targetColumnId: null,
};

let boardColumnDragState: BoardColumnDragState = DEFAULT_BOARD_COLUMN_DRAG_STATE;
const listeners = new Set<() => void>();

export function useBoardColumnDragState() {
	return useSyncExternalStore(
		subscribeToBoardColumnDragState,
		getBoardColumnDragState,
		getBoardColumnDragState,
	);
}

export function getBoardColumnDragState() {
	return boardColumnDragState;
}

export function startBoardColumnDrag(
	draggedShapeId: TLShapeId,
	sourceColumnId: TLShapeId | null,
	sourceIndex: IndexKey | null,
	placeholderY: number | null,
	placeholderHeight: number | null,
) {
	setBoardColumnDragState({
		draggedShapeId,
		indicatorY: null,
		placeholderHeight,
		placeholderY,
		sourceColumnId,
		sourceIndex,
		targetColumnId: sourceColumnId,
	});
}

export function updateBoardColumnDrag(
	partial: Partial<BoardColumnDragState>,
) {
	setBoardColumnDragState({
		...boardColumnDragState,
		...partial,
	});
}

export function clearBoardColumnDrag(draggedShapeId?: TLShapeId) {
	if (
		draggedShapeId &&
		boardColumnDragState.draggedShapeId &&
		boardColumnDragState.draggedShapeId !== draggedShapeId
	) {
		return;
	}

	setBoardColumnDragState(DEFAULT_BOARD_COLUMN_DRAG_STATE);
}

function subscribeToBoardColumnDragState(listener: () => void) {
	listeners.add(listener);

	return () => {
		listeners.delete(listener);
	};
}

function setBoardColumnDragState(nextState: BoardColumnDragState) {
	const current = boardColumnDragState;

	if (
		current.draggedShapeId === nextState.draggedShapeId &&
		current.indicatorY === nextState.indicatorY &&
		current.placeholderHeight === nextState.placeholderHeight &&
		current.placeholderY === nextState.placeholderY &&
		current.sourceColumnId === nextState.sourceColumnId &&
		current.sourceIndex === nextState.sourceIndex &&
		current.targetColumnId === nextState.targetColumnId
	) {
		return;
	}

	boardColumnDragState = nextState;
	for (const listener of listeners) {
		listener();
	}
}
