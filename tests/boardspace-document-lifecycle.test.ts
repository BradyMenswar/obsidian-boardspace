import test from "node:test";
import assert from "node:assert/strict";
import {
	BoardspaceDocumentLifecycle,
	BoardspaceDocumentScheduler,
} from "../src/files/boardspace-document-lifecycle";
import { createSchemaV2BoardspaceDocumentAdapter } from "../src/files/boardspace-document-adapter";
import { createEmptyBoardspaceSource } from "../src/files/boardspace-document";

const textAdapter = {
	loadSource: (source: string) => ({
		status: "editable" as const,
		sourceStatus: "loaded" as const,
		editorState: { text: source },
	}),
	serializeEditorState: (state: { text: string } | undefined) => state?.text ?? "",
};

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

test("opens schema v2 as editable and keeps schema v1 and invalid source read-only", () => {
	const lifecycle = new BoardspaceDocumentLifecycle({
		documentAdapter: createSchemaV2BoardspaceDocumentAdapter(),
		requestSave: async () => undefined,
		scheduler: new ManualScheduler(),
	});
	const emptySource = createEmptyBoardspaceSource();

	assert.deepEqual(lifecycle.loadSource(emptySource), {
		status: "editable",
		sourceStatus: "empty",
		editorState: undefined,
	});
	const legacySource = emptySource.replace("board-version: 2", "board-version: 1");
	const legacyOutcome = lifecycle.loadSource(legacySource);
	assert.equal(legacyOutcome.status, "read-only");
	assert.equal(legacyOutcome.sourceStatus, "unsupported");
	assert.equal(lifecycle.getViewData(), legacySource);

	const invalidSource = "# ordinary Markdown";
	const invalidOutcome = lifecycle.loadSource(invalidSource);
	assert.equal(invalidOutcome.status, "read-only");
	assert.equal(invalidOutcome.sourceStatus, "invalid");
	assert.equal(lifecycle.getViewData(), invalidSource);
});

test("schedules and flushes an editable document save", async () => {
	const scheduler = new ManualScheduler();
	let saveCount = 0;
	const lifecycle = new BoardspaceDocumentLifecycle({
		documentAdapter: textAdapter,
		requestSave: async () => {
			saveCount += 1;
		},
		scheduler,
	});
	lifecycle.loadSource("original");

	assert.deepEqual(lifecycle.updateEditorState({ text: "changed" }), {
		status: "save-scheduled",
	});
	assert.deepEqual(lifecycle.getLoadOutcome(), {
		status: "editable",
		sourceStatus: "loaded",
		editorState: { text: "changed" },
	});
	assert.equal(scheduler.lastDelay, 750);
	assert.equal(lifecycle.getViewData(), "changed");

	scheduler.runScheduledSave();
	await lifecycle.flushPendingSave();

	assert.equal(saveCount, 1);
	assert.equal(lifecycle.isDirty(), false);
});

test("blocks edits and preserves source for read-only documents", async () => {
	const source = createEmptyBoardspaceSource().replace("board-version: 2", "board-version: 1");
	const scheduler = new ManualScheduler();
	let saveCount = 0;
	const lifecycle = new BoardspaceDocumentLifecycle({
		documentAdapter: createSchemaV2BoardspaceDocumentAdapter(),
		requestSave: async () => {
			saveCount += 1;
		},
		scheduler,
	});
	lifecycle.loadSource(source);

	assert.deepEqual(lifecycle.updateEditorState({
		kind: "canonical",
		textCards: [],
		todoCards: [],
		tableCards: [],
		swatchCards: [],
		mediaCards: [],
		boardLinkCards: [],
	}), { status: "save-blocked" });
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
		documentAdapter: textAdapter,
		requestSave: async () => {
			throw failure;
		},
		scheduler,
		onSaveError: (error) => {
			reportedError = error;
		},
	});
	lifecycle.loadSource("original");
	lifecycle.updateEditorState({ text: "changed" });

	await lifecycle.flushPendingSave();

	assert.equal(reportedError, failure);
	assert.equal(lifecycle.isDirty(), true);
});
