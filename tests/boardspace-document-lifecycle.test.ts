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
	assert.equal(scheduler.lastDelay, 150);
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
