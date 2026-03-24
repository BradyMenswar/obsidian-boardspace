import { TLShapeId } from "@tldraw/editor";
import { useSyncExternalStore } from "react";

export interface BoardTodoTaskTransferDragState {
	indicatorIndex: number | null;
	indicatorY: number | null;
	sourceShapeId: TLShapeId | null;
	targetShapeId: TLShapeId | null;
}

const DEFAULT_BOARD_TODO_TASK_TRANSFER_DRAG_STATE: BoardTodoTaskTransferDragState = {
	indicatorIndex: null,
	indicatorY: null,
	sourceShapeId: null,
	targetShapeId: null,
};

let boardTodoTaskTransferDragState = DEFAULT_BOARD_TODO_TASK_TRANSFER_DRAG_STATE;
const listeners = new Set<() => void>();

export function useBoardTodoTaskTransferDragState() {
	return useSyncExternalStore(
		subscribeToBoardTodoTaskTransferDragState,
		getBoardTodoTaskTransferDragState,
		getBoardTodoTaskTransferDragState,
	);
}

export function getBoardTodoTaskTransferDragState() {
	return boardTodoTaskTransferDragState;
}

export function startBoardTodoTaskTransferDrag(sourceShapeId: TLShapeId) {
	setBoardTodoTaskTransferDragState({
		indicatorIndex: null,
		indicatorY: null,
		sourceShapeId,
		targetShapeId: null,
	});
}

export function updateBoardTodoTaskTransferDrag(
	partial: Partial<BoardTodoTaskTransferDragState>,
) {
	setBoardTodoTaskTransferDragState({
		...boardTodoTaskTransferDragState,
		...partial,
	});
}

export function clearBoardTodoTaskTransferDrag(sourceShapeId?: TLShapeId) {
	if (
		sourceShapeId &&
		boardTodoTaskTransferDragState.sourceShapeId &&
		boardTodoTaskTransferDragState.sourceShapeId !== sourceShapeId
	) {
		return;
	}

	setBoardTodoTaskTransferDragState(
		DEFAULT_BOARD_TODO_TASK_TRANSFER_DRAG_STATE,
	);
}

function subscribeToBoardTodoTaskTransferDragState(listener: () => void) {
	listeners.add(listener);

	return () => {
		listeners.delete(listener);
	};
}

function setBoardTodoTaskTransferDragState(
	nextState: BoardTodoTaskTransferDragState,
) {
	const current = boardTodoTaskTransferDragState;

	if (
		current.indicatorIndex === nextState.indicatorIndex &&
		current.indicatorY === nextState.indicatorY &&
		current.sourceShapeId === nextState.sourceShapeId &&
		current.targetShapeId === nextState.targetShapeId
	) {
		return;
	}

	boardTodoTaskTransferDragState = nextState;
	for (const listener of listeners) {
		listener();
	}
}
