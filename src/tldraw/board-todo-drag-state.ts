import type { TLShapeId } from "tldraw";
import { useSyncExternalStore } from "react";

export interface BoardTodoDragState {
	draggedShapeId: TLShapeId | null;
	indicatorIndex: number | null;
	indicatorY: number | null;
	targetShapeId: TLShapeId | null;
}

const DEFAULT_BOARD_TODO_DRAG_STATE: BoardTodoDragState = {
	draggedShapeId: null,
	indicatorIndex: null,
	indicatorY: null,
	targetShapeId: null,
};

let boardTodoDragState: BoardTodoDragState = DEFAULT_BOARD_TODO_DRAG_STATE;
const listeners = new Set<() => void>();

export function useBoardTodoDragState() {
	return useSyncExternalStore(
		subscribeToBoardTodoDragState,
		getBoardTodoDragState,
		getBoardTodoDragState,
	);
}

export function getBoardTodoDragState() {
	return boardTodoDragState;
}

export function startBoardTodoDrag(draggedShapeId: TLShapeId) {
	setBoardTodoDragState({
		draggedShapeId,
		indicatorIndex: null,
		indicatorY: null,
		targetShapeId: null,
	});
}

export function updateBoardTodoDrag(partial: Partial<BoardTodoDragState>) {
	setBoardTodoDragState({
		...boardTodoDragState,
		...partial,
	});
}

export function clearBoardTodoDrag(draggedShapeId?: TLShapeId) {
	if (
		draggedShapeId &&
		boardTodoDragState.draggedShapeId &&
		boardTodoDragState.draggedShapeId !== draggedShapeId
	) {
		return;
	}

	setBoardTodoDragState(DEFAULT_BOARD_TODO_DRAG_STATE);
}

function subscribeToBoardTodoDragState(listener: () => void) {
	listeners.add(listener);

	return () => {
		listeners.delete(listener);
	};
}

function setBoardTodoDragState(nextState: BoardTodoDragState) {
	const current = boardTodoDragState;

	if (
		current.draggedShapeId === nextState.draggedShapeId &&
		current.indicatorIndex === nextState.indicatorIndex &&
		current.indicatorY === nextState.indicatorY &&
		current.targetShapeId === nextState.targetShapeId
	) {
		return;
	}

	boardTodoDragState = nextState;
	for (const listener of listeners) {
		listener();
	}
}
