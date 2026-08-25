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
	| { status: "save-paused" }
	| { status: "save-blocked" };

export type BoardspaceExternalSourceOutcome<EditorState> =
	| {
			status: "reloaded";
			loadOutcome: BoardspaceDocumentLoadOutcome<EditorState>;
	  }
	| { status: "conflict-pending" }
	| { status: "unchanged" };

export type BoardspaceConflictResolutionOutcome<EditorState> =
	| { status: "local-selected" }
	| {
			status: "external-loaded";
			loadOutcome: BoardspaceDocumentLoadOutcome<EditorState>;
	  }
	| { status: "no-conflict" };

export interface BoardspaceDocumentAdapter<EditorState> {
	loadSource(source: string): BoardspaceDocumentLoadOutcome<EditorState>;
	serializeEditorState(editorState: EditorState | undefined): string;
}

export interface BoardspaceDocumentScheduler {
	schedule(callback: () => void, delay: number): number;
	cancel(handle: number): void;
}

export type BoardspaceSaveRequestOutcome =
	| { status: "saved" }
	| { status: "conflict"; externalSource: string };

interface BoardspaceDocumentLifecycleOptions<EditorState> {
	documentAdapter: BoardspaceDocumentAdapter<EditorState>;
	requestSave(source: string, expectedSource: string): Promise<BoardspaceSaveRequestOutcome | void>;
	scheduler: BoardspaceDocumentScheduler;
	saveDelay?: number;
	onConflict?(): void;
	onSaveError?(error: unknown): void;
}

export class BoardspaceDocumentLifecycle<EditorState> {
	private readonly documentAdapter: BoardspaceDocumentAdapter<EditorState>;
	private readonly onConflict: () => void;
	private readonly onSaveError: (error: unknown) => void;
	private readonly requestSave: (
		source: string,
		expectedSource: string,
	) => Promise<BoardspaceSaveRequestOutcome | void>;
	private readonly saveDelay: number;
	private readonly scheduler: BoardspaceDocumentScheduler;
	private conflictSource: string | undefined;
	private dirty = false;
	private editorState: EditorState | undefined;
	private loadOutcome: BoardspaceDocumentLoadOutcome<EditorState> | undefined;
	private revision = 0;
	private saveHandle: number | undefined;
	private sourceBeingSaved: string | undefined;
	private savePromise: Promise<void> = Promise.resolve();
	private source = "";

	constructor(options: BoardspaceDocumentLifecycleOptions<EditorState>) {
		this.documentAdapter = options.documentAdapter;
		this.onConflict = options.onConflict ?? (() => undefined);
		this.onSaveError = options.onSaveError ?? (() => undefined);
		this.requestSave = options.requestSave;
		this.saveDelay = options.saveDelay ?? 750;
		this.scheduler = options.scheduler;
	}

	loadSource(source: string): BoardspaceDocumentLoadOutcome<EditorState> {
		this.conflictSource = undefined;
		return this.replaceWithSource(source);
	}

	receiveExternalSource(source: string): BoardspaceExternalSourceOutcome<EditorState> {
		if (source === this.source || source === this.sourceBeingSaved) {
			return { status: "unchanged" };
		}

		if (this.dirty) {
			this.cancelScheduledSave();
			this.conflictSource = source;
			return { status: "conflict-pending" };
		}

		return {
			status: "reloaded",
			loadOutcome: this.replaceWithSource(source),
		};
	}

	getConflict() {
		if (this.conflictSource === undefined) {
			return undefined;
		}

		return {
			localState: this.editorState,
			externalSource: this.conflictSource,
		};
	}

	resolveConflict(choice: "local" | "external"): BoardspaceConflictResolutionOutcome<EditorState> {
		const externalSource = this.conflictSource;
		if (externalSource === undefined) {
			return { status: "no-conflict" };
		}

		this.conflictSource = undefined;
		if (choice === "external") {
			return {
				status: "external-loaded",
				loadOutcome: this.replaceWithSource(externalSource),
			};
		}

		// The user explicitly approved replacing this external revision with the
		// retained local state, so it becomes the optimistic-write baseline.
		this.source = externalSource;
		this.queueSave();
		return { status: "local-selected" };
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
		if (this.sourceBeingSaved !== undefined) {
			return this.sourceBeingSaved;
		}

		if (this.conflictSource !== undefined) {
			throw new Error("Choose local or external Boardspace changes before saving.");
		}

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
		if (this.conflictSource !== undefined) {
			return { status: "save-paused" };
		}

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

	private replaceWithSource(source: string) {
		this.cancelScheduledSave();
		const outcome = this.documentAdapter.loadSource(source);
		this.source = source;
		this.loadOutcome = outcome;
		this.editorState = outcome.editorState;
		this.dirty = false;
		this.revision += 1;
		return outcome;
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
		if (!this.canPersistPendingSave()) {
			return;
		}

		const savingRevision = this.revision;
		this.savePromise = this.savePromise
			.then(async () => {
				if (!this.canPersistPendingSave()) {
					return;
				}

				const expectedSource = this.source;
				const serializedSource = this.documentAdapter.serializeEditorState(this.editorState);
				this.sourceBeingSaved = serializedSource;
				try {
					const outcome = await this.requestSave(serializedSource, expectedSource);
					if (outcome?.status === "conflict") {
						this.conflictSource = outcome.externalSource;
						this.onConflict();
						return;
					}
					this.source = serializedSource;
					if (this.revision === savingRevision) {
						this.dirty = false;
					}
				} finally {
					if (this.sourceBeingSaved === serializedSource) {
						this.sourceBeingSaved = undefined;
					}
				}
			})
			.catch((error: unknown) => {
				this.onSaveError(error);
			});

		await this.savePromise;
	}

	private canPersistPendingSave() {
		return this.dirty &&
			this.conflictSource === undefined &&
			this.loadOutcome?.status === "editable";
	}
}
