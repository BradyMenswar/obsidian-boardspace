import type { Editor } from "tldraw";

export type BoardspaceTextChangeKind = "typing" | "deleting" | "command";

export interface BoardspaceDocumentHistoryEditor {
	markHistoryStoppingPoint(name: string): string;
	undo(): unknown;
	redo(): unknown;
}

export interface BoardspaceHistoryScheduler {
	schedule(callback: () => void, delay: number): number;
	cancel(handle: number): void;
}

const TEXT_HISTORY_PAUSE_MS = 500;

/** Coordinates text-card edits with the editor's document-level history. */
export class BoardspaceDocumentHistory {
	private activeTextGroup: { cardId: string; kind: BoardspaceTextChangeKind } | null = null;
	private pauseHandle: number | undefined;

	constructor(
		private readonly editor: BoardspaceDocumentHistoryEditor,
		private readonly scheduler: BoardspaceHistoryScheduler,
	) {}

	recordTextChange(
		cardId: string,
		kind: BoardspaceTextChangeKind,
		apply: () => void,
	) {
		const continuesActiveGroup =
			kind !== "command" &&
			this.activeTextGroup?.cardId === cardId &&
			this.activeTextGroup.kind === kind;

		if (!continuesActiveGroup) {
			this.cancelPause();
			this.editor.markHistoryStoppingPoint("edit text card");
			this.activeTextGroup = { cardId, kind };
		}

		apply();

		if (kind === "command") {
			this.finishTextGroup();
			return;
		}

		this.cancelPause();
		this.pauseHandle = this.scheduler.schedule(
			() => {
				this.pauseHandle = undefined;
				this.finishTextGroup();
			},
			TEXT_HISTORY_PAUSE_MS,
		);
	}

	finishTextGroup() {
		if (!this.activeTextGroup) {
			return;
		}

		this.cancelPause();
		this.activeTextGroup = null;
		this.editor.markHistoryStoppingPoint("finish text card edit");
	}

	undo() {
		this.finishTextGroup();
		this.editor.undo();
	}

	redo() {
		this.finishTextGroup();
		this.editor.redo();
	}

	dispose() {
		this.cancelPause();
		this.activeTextGroup = null;
	}

	private cancelPause() {
		if (this.pauseHandle === undefined) {
			return;
		}

		this.scheduler.cancel(this.pauseHandle);
		this.pauseHandle = undefined;
	}
}

const histories = new WeakMap<Editor, BoardspaceDocumentHistory>();

export function registerBoardspaceDocumentHistory(editor: Editor) {
	const history = new BoardspaceDocumentHistory(editor, {
		schedule: (callback, delay) => window.setTimeout(callback, delay),
		cancel: (handle) => window.clearTimeout(handle),
	});
	histories.set(editor, history);

	return () => {
		history.dispose();
		if (histories.get(editor) === history) {
			histories.delete(editor);
		}
	};
}

export function getBoardspaceDocumentHistory(editor: Editor) {
	const history = histories.get(editor);
	if (!history) {
		throw new Error("Boardspace document history is not registered for this editor.");
	}
	return history;
}
