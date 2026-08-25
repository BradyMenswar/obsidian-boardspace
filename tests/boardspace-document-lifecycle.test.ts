import test from "node:test";
import assert from "node:assert/strict";
import {
	BoardspaceDocumentLifecycle,
	BoardspaceDocumentScheduler,
} from "../src/files/boardspace-document-lifecycle";
import {
	createLegacyBoardspaceDocumentAdapter,
	serializeBoardspaceFile,
} from "../src/files/boardspace-file";
import { BoardspaceSnapshot } from "../src/types/board";

const snapshot = {
	document: {
		store: {},
		schema: {},
	},
	session: {
		version: 0,
		currentPageId: "page:page",
		exportBackground: true,
		isFocusMode: false,
		isDebugMode: false,
		isToolLocked: false,
		isGridMode: true,
		pageStates: [],
	},
} as unknown as BoardspaceSnapshot;

class ManualScheduler implements BoardspaceDocumentScheduler {
	private callback: (() => void) | undefined;
	lastDelay: number | undefined;

	schedule(callback: () => void, delay: number) {
		this.callback = callback;
		this.lastDelay = delay;
		return 1;
	}

	cancel() {
		this.callback = undefined;
		this.lastDelay = undefined;
	}

	runScheduledSave() {
		const callback = this.callback;
		this.callback = undefined;
		callback?.();
	}
}

test("accepts substitutable document adaptation at the lifecycle seam", () => {
	const lifecycle = new BoardspaceDocumentLifecycle({
		documentAdapter: {
			loadSource: (source: string) => ({
				status: "editable" as const,
				sourceStatus: "loaded" as const,
				editorState: { text: source.toUpperCase() },
			}),
			serializeEditorState: (editorState) => editorState?.text ?? "empty",
		},
		requestSave: async () => undefined,
		scheduler: new ManualScheduler(),
	});

	assert.deepEqual(lifecycle.loadSource("adapt me"), {
		status: "editable",
		sourceStatus: "loaded",
		editorState: { text: "ADAPT ME" },
	});
	assert.equal(lifecycle.getViewData(), "ADAPT ME");
});

test("reports explicit outcomes for loaded, empty, invalid, and unsupported source", () => {
	const lifecycle = new BoardspaceDocumentLifecycle({
		documentAdapter: createLegacyBoardspaceDocumentAdapter(),
		requestSave: async () => undefined,
		scheduler: new ManualScheduler(),
	});

	assert.deepEqual(lifecycle.loadSource(serializeBoardspaceFile(snapshot)), {
		status: "editable",
		sourceStatus: "loaded",
		editorState: snapshot,
	});
	assert.deepEqual(lifecycle.loadSource(serializeBoardspaceFile(undefined)), {
		status: "editable",
		sourceStatus: "empty",
		editorState: undefined,
	});
	assert.deepEqual(
		lifecycle.loadSource(`---\ntype: boardspace\nboard-version: 1\n---\n\n\`\`\`boardspace\n{bad json\n\`\`\``),
		{
			status: "editable",
			sourceStatus: "invalid",
			editorState: undefined,
		},
	);
	assert.deepEqual(lifecycle.loadSource("# ordinary Markdown"), {
		status: "read-only",
		sourceStatus: "unsupported",
		editorState: undefined,
		diagnostics: [
			{
				code: "unsupported-legacy-source",
				message: "This file is not a supported legacy Boardspace document.",
			},
		],
	});
});

test("schedules and flushes an editable document save", async () => {
	const scheduler = new ManualScheduler();
	let saveCount = 0;
	const lifecycle = new BoardspaceDocumentLifecycle({
		documentAdapter: createLegacyBoardspaceDocumentAdapter(),
		requestSave: async () => {
			saveCount += 1;
		},
		scheduler,
	});
	lifecycle.loadSource(serializeBoardspaceFile(undefined));

	assert.deepEqual(lifecycle.updateEditorState(snapshot), {
		status: "save-scheduled",
	});
	assert.deepEqual(lifecycle.getLoadOutcome(), {
		status: "editable",
		sourceStatus: "loaded",
		editorState: snapshot,
	});
	assert.equal(scheduler.lastDelay, 750);
	assert.deepEqual(
		createLegacyBoardspaceDocumentAdapter().loadSource(lifecycle.getViewData()),
		{
			status: "editable",
			sourceStatus: "loaded",
			editorState: snapshot,
		},
	);

	scheduler.runScheduledSave();
	await lifecycle.flushPendingSave();

	assert.equal(saveCount, 1);
	assert.equal(lifecycle.isDirty(), false);
});

test("blocks edits and preserves source for read-only documents", async () => {
	const source = "# ordinary Markdown\n";
	const scheduler = new ManualScheduler();
	let saveCount = 0;
	const lifecycle = new BoardspaceDocumentLifecycle({
		documentAdapter: createLegacyBoardspaceDocumentAdapter(),
		requestSave: async () => {
			saveCount += 1;
		},
		scheduler,
	});
	lifecycle.loadSource(source);

	assert.deepEqual(lifecycle.updateEditorState(snapshot), {
		status: "save-blocked",
	});
	assert.equal(lifecycle.getViewData(), source);
	assert.equal(lifecycle.isDirty(), false);
	assert.equal(scheduler.lastDelay, undefined);

	await lifecycle.flushPendingSave();
	assert.equal(saveCount, 0);
});

test("reloads external source while clean and pauses saving for a dirty conflict", async () => {
	const scheduler = new ManualScheduler();
	const saves: string[] = [];
	const lifecycle = new BoardspaceDocumentLifecycle({
		documentAdapter: {
			loadSource: (source: string) => ({
				status: "editable" as const,
				sourceStatus: "loaded" as const,
				editorState: { text: source },
			}),
			serializeEditorState: (state) => state?.text ?? "",
		},
		requestSave: async () => {
			saves.push(lifecycle.getViewData());
		},
		scheduler,
	});

	lifecycle.loadSource("original");
	assert.deepEqual(lifecycle.receiveExternalSource("external-clean"), {
		status: "reloaded",
		loadOutcome: {
			status: "editable",
			sourceStatus: "loaded",
			editorState: { text: "external-clean" },
		},
	});
	lifecycle.updateEditorState({ text: "local" });
	assert.deepEqual(lifecycle.receiveExternalSource("external-dirty"), {
		status: "conflict-pending",
	});
	assert.deepEqual(lifecycle.getConflict(), {
		localState: { text: "local" },
		externalSource: "external-dirty",
	});
	assert.throws(
		() => lifecycle.getViewData(),
		/Choose local or external Boardspace changes before saving/,
	);

	await lifecycle.flushPendingSave();
	assert.deepEqual(saves, []);
	assert.equal(lifecycle.isDirty(), true);
});

test("resolves a dirty conflict only after an explicit local or external choice", async () => {
	const scheduler = new ManualScheduler();
	const saves: string[] = [];
	const expectedSources: string[] = [];
	const lifecycle = new BoardspaceDocumentLifecycle<{ text: string }>({
		documentAdapter: {
			loadSource: (source: string) => ({
				status: "editable" as const,
				sourceStatus: "loaded" as const,
				editorState: { text: source },
			}),
			serializeEditorState: (state) => state?.text ?? "",
		},
		requestSave: async (_source, expectedSource) => {
			saves.push(lifecycle.getViewData());
			expectedSources.push(expectedSource);
		},
		scheduler,
	});

	lifecycle.loadSource("original");
	lifecycle.updateEditorState({ text: "local" });
	lifecycle.receiveExternalSource("external");
	assert.deepEqual(lifecycle.resolveConflict("external"), {
		status: "external-loaded",
		loadOutcome: {
			status: "editable",
			sourceStatus: "loaded",
			editorState: { text: "external" },
		},
	});
	assert.equal(lifecycle.isDirty(), false);
	assert.deepEqual(saves, []);

	lifecycle.updateEditorState({ text: "local-2" });
	lifecycle.receiveExternalSource("external-2");
	assert.deepEqual(lifecycle.resolveConflict("local"), { status: "local-selected" });
	assert.equal(scheduler.lastDelay, 750);
	await lifecycle.flushPendingSave();
	assert.deepEqual(saves, ["local-2"]);
	assert.deepEqual(expectedSources, ["external-2"]);
});

test("validates the complete state before writing and reports every validation blocker", async () => {
	const scheduler = new ManualScheduler();
	let saveCount = 0;
	let reportedError: unknown;
	const blockers = new Error("Card a is unsupported. Card b has a duplicate identity.");
	const lifecycle = new BoardspaceDocumentLifecycle<{ text: string }>({
		documentAdapter: {
			loadSource: () => ({
				status: "editable" as const,
				sourceStatus: "empty" as const,
				editorState: undefined,
			}),
			serializeEditorState: () => {
				throw blockers;
			},
		},
		requestSave: async () => {
			saveCount += 1;
		},
		scheduler,
		onSaveError: (error) => {
			reportedError = error;
		},
	});
	lifecycle.loadSource("original");
	lifecycle.updateEditorState({ text: "working state" });

	await lifecycle.flushPendingSave();

	assert.equal(saveCount, 0);
	assert.equal(reportedError, blockers);
	assert.equal(lifecycle.isDirty(), true);
	assert.deepEqual(lifecycle.getLoadOutcome()?.editorState, { text: "working state" });
});

test("serializes overlapping save requests and never writes an older state after a newer state", async () => {
	const scheduler = new ManualScheduler();
	const writes: string[] = [];
	let releaseFirstSave: (() => void) | undefined;
	const firstSave = new Promise<void>((resolve) => {
		releaseFirstSave = resolve;
	});
	const lifecycle = new BoardspaceDocumentLifecycle({
		documentAdapter: {
			loadSource: (source: string) => ({
				status: "editable" as const,
				sourceStatus: "loaded" as const,
				editorState: { text: source },
			}),
			serializeEditorState: (state) => state?.text ?? "",
		},
		requestSave: async () => {
			writes.push(lifecycle.getViewData());
			if (writes.length === 1) await firstSave;
		},
		scheduler,
	});
	lifecycle.loadSource("original");
	lifecycle.updateEditorState({ text: "first" });
	scheduler.runScheduledSave();
	await new Promise((resolve) => setTimeout(resolve, 0));
	lifecycle.updateEditorState({ text: "newer" });
	const flush = lifecycle.flushPendingSave();
	releaseFirstSave?.();
	await flush;

	assert.deepEqual(writes, ["first", "newer"]);
	assert.equal(lifecycle.isDirty(), false);
});

test("an external change discovered atomically during a save is not overwritten", async () => {
	const scheduler = new ManualScheduler();
	const writes: string[] = [];
	const lifecycle = new BoardspaceDocumentLifecycle({
		documentAdapter: {
			loadSource: (source: string) => ({
				status: "editable" as const,
				sourceStatus: "loaded" as const,
				editorState: { text: source },
			}),
			serializeEditorState: (state) => state?.text ?? "",
		},
		requestSave: async (source, expectedSource) => {
			assert.equal(source, "local");
			assert.equal(expectedSource, "original");
			return { status: "conflict", externalSource: "external" };
		},
		scheduler,
	});
	lifecycle.loadSource("original");
	lifecycle.updateEditorState({ text: "local" });

	await lifecycle.flushPendingSave();

	assert.deepEqual(writes, []);
	assert.deepEqual(lifecycle.getConflict(), {
		localState: { text: "local" },
		externalSource: "external",
	});
	assert.equal(lifecycle.isDirty(), true);
});

test("keeps failed saves dirty and reports the failure", async () => {
	const scheduler = new ManualScheduler();
	const failure = new Error("vault unavailable");
	let reportedError: unknown;
	const lifecycle = new BoardspaceDocumentLifecycle({
		documentAdapter: createLegacyBoardspaceDocumentAdapter(),
		requestSave: async () => {
			throw failure;
		},
		scheduler,
		onSaveError: (error) => {
			reportedError = error;
		},
	});
	lifecycle.loadSource(serializeBoardspaceFile(undefined));
	lifecycle.updateEditorState(snapshot);

	await lifecycle.flushPendingSave();

	assert.equal(reportedError, failure);
	assert.equal(lifecycle.isDirty(), true);
});
