export type BoardspaceEditableSourceStatus = "loaded" | "empty" | "invalid";

export interface BoardspaceLoadDiagnostic {
	code: string;
	message: string;
}

export type BoardspaceDocumentLoadOutcome<EditorState> =
	| {
			status: "editable";
			sourceStatus: BoardspaceEditableSourceStatus;
			editorState: EditorState | undefined;
	  }
	| {
			status: "read-only";
			sourceStatus: "unsupported" | "invalid";
			editorState: undefined;
			diagnostics: BoardspaceLoadDiagnostic[];
	  };

export type BoardspaceDocumentUpdateOutcome =
	| { status: "save-scheduled" }
	| { status: "save-blocked" };

export interface BoardspaceDocumentAdapter<EditorState> {
	loadSource(source: string): BoardspaceDocumentLoadOutcome<EditorState>;
	serializeEditorState(editorState: EditorState | undefined): string;
}

export interface BoardspaceDocumentScheduler {
	schedule(callback: () => void, delay: number): number;
	cancel(handle: number): void;
}

interface BoardspaceDocumentLifecycleOptions<EditorState> {
	documentAdapter: BoardspaceDocumentAdapter<EditorState>;
	requestSave(): Promise<void>;
	scheduler: BoardspaceDocumentScheduler;
	saveDelay?: number;
	onSaveError?(error: unknown): void;
}

export class BoardspaceDocumentLifecycle<EditorState> {
	private readonly documentAdapter: BoardspaceDocumentAdapter<EditorState>;
	private readonly onSaveError: (error: unknown) => void;
	private readonly requestSave: () => Promise<void>;
	private readonly saveDelay: number;
	private readonly scheduler: BoardspaceDocumentScheduler;
	private dirty = false;
	private editorState: EditorState | undefined;
	private loadOutcome: BoardspaceDocumentLoadOutcome<EditorState> | undefined;
	private revision = 0;
	private saveHandle: number | undefined;
	private savePromise: Promise<void> = Promise.resolve();
	private source = "";

	constructor(options: BoardspaceDocumentLifecycleOptions<EditorState>) {
		this.documentAdapter = options.documentAdapter;
		this.onSaveError = options.onSaveError ?? (() => undefined);
		this.requestSave = options.requestSave;
		this.saveDelay = options.saveDelay ?? 150;
		this.scheduler = options.scheduler;
	}

	loadSource(source: string): BoardspaceDocumentLoadOutcome<EditorState> {
		this.cancelScheduledSave();
		const outcome = this.documentAdapter.loadSource(source);
		this.source = source;
		this.loadOutcome = outcome;
		this.editorState = outcome.editorState;
		this.dirty = false;
		this.revision += 1;
		return outcome;
	}

	clearEditorState() {
		this.editorState = undefined;
		if (this.loadOutcome?.status === "editable") {
			this.loadOutcome = {
				status: "editable",
				sourceStatus: "empty",
				editorState: undefined,
			};
		}
	}

	getLoadOutcome() {
		return this.loadOutcome;
	}

	getViewData() {
		if (this.loadOutcome?.status !== "editable") {
			return this.source;
		}

		return this.documentAdapter.serializeEditorState(this.editorState);
	}

	updateEditorState(editorState: EditorState): BoardspaceDocumentUpdateOutcome {
		if (this.loadOutcome?.status !== "editable") {
			return { status: "save-blocked" };
		}

		this.editorState = editorState;
		this.loadOutcome = {
			status: "editable",
			sourceStatus: "loaded",
			editorState,
		};
		this.dirty = true;
		this.revision += 1;
		this.queueSave();
		return { status: "save-scheduled" };
	}

	isDirty() {
		return this.dirty;
	}

	async flushPendingSave() {
		if (this.saveHandle !== undefined) {
			this.cancelScheduledSave();
			await this.persistPendingSave();
			return;
		}

		await this.savePromise;
	}

	private queueSave() {
		this.cancelScheduledSave();
		this.saveHandle = this.scheduler.schedule(() => {
			this.saveHandle = undefined;
			void this.persistPendingSave();
		}, this.saveDelay);
	}

	private cancelScheduledSave() {
		if (this.saveHandle === undefined) {
			return;
		}

		this.scheduler.cancel(this.saveHandle);
		this.saveHandle = undefined;
	}

	private async persistPendingSave() {
		if (!this.dirty || this.loadOutcome?.status !== "editable") {
			return;
		}

		const savingRevision = this.revision;
		this.savePromise = this.savePromise
			.then(async () => {
				await this.requestSave();
				if (this.revision === savingRevision) {
					this.dirty = false;
				}
			})
			.catch((error: unknown) => {
				this.onSaveError(error);
			});

		await this.savePromise;
	}
}
