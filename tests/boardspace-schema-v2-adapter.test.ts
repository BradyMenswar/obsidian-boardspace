import test from "node:test";
import assert from "node:assert/strict";
import {
	createSchemaV2BoardspaceDocumentAdapter,
	createSnapshotEditorState,
} from "../src/files/boardspace-document-adapter";
import {
	BoardspaceDocumentV2,
	createEmptyBoardspaceDocument,
	parseBoardspaceDocument,
	serializeBoardspaceDocument,
} from "../src/files/boardspace-document";
import type { BoardspaceSnapshot } from "../src/types/board";

const emptySource = serializeBoardspaceDocument(createEmptyBoardspaceDocument());

const populatedDocument: BoardspaceDocumentV2 = {
	schemaVersion: 2,
	frontmatterLines: [],
	textCardOrder: ["text-1"],
	items: {
		"text-1": {
			id: "text-1",
			kind: "text",
			markdown: "# Heading\n\nRaw **Markdown**",
			placement: { type: "root", order: 0, position: { x: 40, y: 60 } },
			preferredSize: { width: 320, height: 96 },
			style: {
				color: "blue",
				customColor: "#6b7280",
				dash: "solid",
				fill: "semi",
				opacity: 1,
				size: "m",
				topBarColor: "transparent",
				topBarCustomColor: "#6b7280",
			},
		},
	},
};
const populatedSource = serializeBoardspaceDocument(populatedDocument);

const multiCardDocument: BoardspaceDocumentV2 = {
	...populatedDocument,
	textCardOrder: ["text-2", "text-1"],
	items: {
		...populatedDocument.items,
		"text-2": {
			...populatedDocument.items["text-1"]!,
			id: "text-2",
			markdown: "Second card\n\n- original",
			placement: { type: "root", order: 1, position: { x: 140, y: 160 } },
		},
	},
};
const multiCardSource = serializeBoardspaceDocument(multiCardDocument);

const emptyEditorSnapshot = {
	document: {
		store: {
			"document:document": { id: "document:document", typeName: "document" },
			"page:page": { id: "page:page", typeName: "page" },
		},
		schema: {},
	},
	session: {
		currentPageId: "page:page",
		isFocusMode: true,
		isGridMode: false,
		pageStates: [{ selectedShapeIds: ["shape:transient-selection"] }],
	},
} as unknown as BoardspaceSnapshot;

test("adapts an empty schema-v2 document without persisting editor-session state", () => {
	const adapter = createSchemaV2BoardspaceDocumentAdapter();

	assert.deepEqual(adapter.loadSource(emptySource), {
		status: "editable",
		sourceStatus: "empty",
		editorState: undefined,
	});
	const editorState = createSnapshotEditorState(emptyEditorSnapshot);
	assert.equal(adapter.serializeEditorState(editorState), emptySource);
	assert.doesNotMatch(adapter.serializeEditorState(editorState), /currentPageId|selectedShapeIds|isFocusMode/);
});

test("round-trips one raw-Markdown text card through the complete editor representation", () => {
	const adapter = createSchemaV2BoardspaceDocumentAdapter();
	const loaded = adapter.loadSource(populatedSource);

	assert.equal(loaded.status, "editable");
	if (loaded.status !== "editable") return;
	assert.equal(loaded.sourceStatus, "loaded");
	assert.deepEqual(loaded.editorState, {
		kind: "canonical",
		textCards: [
			{
				id: "text-1",
				markdown: "# Heading\n\nRaw **Markdown**",
				order: 0,
				preferredSize: { width: 320, height: 96 },
				position: { x: 40, y: 60 },
				style: populatedDocument.items["text-1"]?.style,
			},
		],
	});
	assert.equal(adapter.serializeEditorState(loaded.editorState), populatedSource);
});

test("preserves multi-card source order and untouched Markdown when canvas order and another card change", () => {
	const adapter = createSchemaV2BoardspaceDocumentAdapter();
	const loaded = adapter.loadSource(multiCardSource);
	assert.equal(loaded.status, "editable");
	if (loaded.status !== "editable") return;
	assert.equal(loaded.editorState?.kind, "canonical");
	if (loaded.editorState?.kind !== "canonical") return;
	assert.deepEqual(loaded.editorState.textCards.map((card) => card.id), ["text-2", "text-1"]);

	const snapshot = structuredClone(emptyEditorSnapshot) as unknown as BoardspaceSnapshot;
	addSnapshotTextCard(snapshot, "text-1", "a1", "# Heading\n\nRaw **Markdown**", 400);
	addSnapshotTextCard(snapshot, "text-2", "a2", "Second card edited", 200);

	const saved = adapter.serializeEditorState(createSnapshotEditorState(snapshot));
	const untouchedRegion = "<!-- boardspace-text-card:start text-1 -->\n# Heading\n\nRaw **Markdown**\n<!-- boardspace-text-card:end text-1 -->";
	assert.ok(saved.indexOf("start text-2") < saved.indexOf("start text-1"));
	assert.ok(saved.includes(untouchedRegion));
	assert.ok(saved.indexOf('"text-1":') < saved.indexOf('"text-2":'));

	const reopened = parseBoardspaceDocument(saved);
	assert.equal(reopened.status, "editable");
	if (reopened.status !== "editable") return;
	assert.deepEqual(reopened.document.textCardOrder, ["text-2", "text-1"]);
	assert.equal(reopened.document.items["text-1"]?.placement.order, 0);
	assert.equal(reopened.document.items["text-1"]?.placement.position.x, 400);
	assert.equal(reopened.document.items["text-2"]?.markdown, "Second card edited");
	assert.equal(adapter.serializeEditorState(createSnapshotEditorState(snapshot)), saved);
});

test("appends new cards to source order independently of their canvas stacking order", () => {
	const adapter = createSchemaV2BoardspaceDocumentAdapter();
	adapter.loadSource(multiCardSource);
	const snapshot = structuredClone(emptyEditorSnapshot) as unknown as BoardspaceSnapshot;
	addSnapshotTextCard(snapshot, "text-3", "a0", "New card", 0);
	addSnapshotTextCard(snapshot, "text-1", "a1", "# Heading\n\nRaw **Markdown**", 40);
	addSnapshotTextCard(snapshot, "text-2", "a2", "Second card\n\n- original", 140);

	const saved = adapter.serializeEditorState(createSnapshotEditorState(snapshot));
	const reopened = parseBoardspaceDocument(saved);
	assert.equal(reopened.status, "editable");
	if (reopened.status !== "editable") return;
	assert.deepEqual(reopened.document.textCardOrder, ["text-2", "text-1", "text-3"]);
	assert.equal(reopened.document.items["text-3"]?.placement.order, 0);
});

test("creating, editing, closing, and reopening preserves text-card Markdown and identity", () => {
	const adapter = createSchemaV2BoardspaceDocumentAdapter();
	adapter.loadSource(emptySource);
	const snapshot = structuredClone(emptyEditorSnapshot) as unknown as BoardspaceSnapshot;
	(snapshot.document.store as Record<string, unknown>)["shape:text-created"] = {
		id: "shape:text-created",
		typeName: "shape",
		type: "board-note",
		parentId: "page:page",
		index: "a1",
		opacity: 1,
		x: 24,
		y: 48,
		props: {
			color: "blue",
			customColor: "#6b7280",
			dash: "solid",
			fill: "semi",
			h: 96,
			markdown: "A [[link]] and **bold text**",
			minH: 96,
			size: "m",
			topBarColor: "transparent",
			topBarCustomColor: "#6b7280",
			w: 320,
		},
	};

	const saved = adapter.serializeEditorState(createSnapshotEditorState(snapshot));
	assert.doesNotMatch(saved, /richText|currentPageId|selectedShapeIds/);
	const reopened = parseBoardspaceDocument(saved);
	assert.equal(reopened.status, "editable");
	if (reopened.status !== "editable") return;
	assert.equal(reopened.document.items["text-created"]?.id, "text-created");
	assert.equal(
		reopened.document.items["text-created"]?.markdown,
		"A [[link]] and **bold text**",
	);
});

test("unsupported editor content blocks the complete text-card save", () => {
	const adapter = createSchemaV2BoardspaceDocumentAdapter();
	adapter.loadSource(populatedSource);
	const unsupportedSnapshot = structuredClone(emptyEditorSnapshot) as unknown as BoardspaceSnapshot;
	(unsupportedSnapshot.document.store as Record<string, unknown>)["shape:arrow"] = {
		id: "shape:arrow",
		typeName: "shape",
		type: "arrow",
	};

	assert.throws(
		() => adapter.serializeEditorState(createSnapshotEditorState(unsupportedSnapshot)),
		/Unsupported editor record shape:arrow \(arrow\) blocks the complete save/,
	);
});

test("extra editor pages block saving instead of being silently omitted", () => {
	const adapter = createSchemaV2BoardspaceDocumentAdapter();
	adapter.loadSource(emptySource);
	const snapshot = structuredClone(emptyEditorSnapshot) as unknown as BoardspaceSnapshot;
	(snapshot.document.store as Record<string, unknown>)["page:unsupported"] = {
		id: "page:unsupported",
		typeName: "page",
	};

	assert.throws(
		() => adapter.serializeEditorState(createSnapshotEditorState(snapshot)),
		/one editor page/,
	);
});

test("returns exact read-only diagnostics and preserves invalid source", () => {
	const source = emptySource.replace("{\n  \"items\"", "{bad\n  \"items\"");
	const adapter = createSchemaV2BoardspaceDocumentAdapter();

	assert.deepEqual(adapter.loadSource(source), {
		status: "read-only",
		sourceStatus: "invalid",
		editorState: undefined,
		diagnostics: [
			{
				code: "structured-json-malformed",
				message: "The Boardspace structured data is not valid JSON.",
			},
		],
	});
	assert.equal(adapter.serializeEditorState(undefined), source);
});

function addSnapshotTextCard(
	snapshot: BoardspaceSnapshot,
	id: string,
	index: string,
	markdown: string,
	x: number,
) {
	(snapshot.document.store as Record<string, unknown>)[`shape:${id}`] = {
		id: `shape:${id}`,
		typeName: "shape",
		type: "board-note",
		parentId: "page:page",
		index,
		opacity: 1,
		x,
		y: 48,
		props: {
			color: "blue",
			customColor: "#6b7280",
			dash: "solid",
			fill: "semi",
			h: 96,
			markdown,
			minH: 96,
			size: "m",
			topBarColor: "transparent",
			topBarCustomColor: "#6b7280",
			w: 320,
		},
	};
}

test("recognizes schema v1 as unsupported", () => {
	const source = emptySource.replace("board-version: 2", "board-version: 1");

	assert.deepEqual(createSchemaV2BoardspaceDocumentAdapter().loadSource(source), {
		status: "read-only",
		sourceStatus: "unsupported",
		editorState: undefined,
		diagnostics: [
			{
				code: "unsupported-schema-version",
				message: "Boardspace schema version 1 is unsupported.",
			},
		],
	});
});
