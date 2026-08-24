import test from "node:test";
import assert from "node:assert/strict";
import {
	createSchemaV2BoardspaceDocumentAdapter,
	createSnapshotEditorState,
} from "../src/files/boardspace-document-adapter";
import {
	BoardspaceDocumentV2,
	BoardspaceTableCard,
	BoardspaceTextCard,
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

const todoDocument: BoardspaceDocumentV2 = {
	schemaVersion: 2,
	frontmatterLines: [],
	textCardOrder: [],
	items: {
		"todo-1": {
			id: "todo-1",
			kind: "todo",
			title: "Release checklist",
			tasks: [
				{ id: "task-1", text: "Ship **without Markdown**", checked: false },
				{ id: "task-2", text: "Tell the team", checked: true },
			],
			placement: { type: "root", order: 0, position: { x: 80, y: 120 } },
			preferredSize: { width: 360, height: 148 },
			style: {
				color: "light-green",
				customColor: "#22c55e",
				dash: "dashed",
				fill: "solid",
				opacity: 0.8,
				size: "l",
				topBarColor: "green",
				topBarCustomColor: "#16a34a",
			},
		},
	},
};
const todoSource = serializeBoardspaceDocument(todoDocument);

const tableCard: BoardspaceTableCard = {
	id: "table-1",
	kind: "table",
	title: "Release matrix",
	columns: [
		{ id: "column-owner", title: "Owner" },
		{ id: "column-status", title: "Status" },
	],
	rows: [
		{
			id: "row-one",
			cells: [
				{ columnId: "column-owner", value: "Ada **plain**" },
				{ columnId: "column-status", value: "Ready" },
			],
		},
	],
	placement: { type: "root", order: 0, position: { x: 160, y: 220 } },
	preferredSize: { width: 540, height: 240 },
	style: {
		color: "light-violet",
		customColor: "#a78bfa",
		dash: "dotted",
		fill: "solid",
		opacity: 0.85,
		size: "l",
		topBarColor: "violet",
		topBarCustomColor: "#8b5cf6",
	},
};
const tableDocument: BoardspaceDocumentV2 = {
	schemaVersion: 2,
	frontmatterLines: [],
	textCardOrder: [],
	items: { "table-1": tableCard },
};
const tableSource = serializeBoardspaceDocument(tableDocument);

const multiCardDocument: BoardspaceDocumentV2 = {
	...populatedDocument,
	textCardOrder: ["text-2", "text-1"],
	items: {
		...populatedDocument.items,
		"text-2": {
			...(populatedDocument.items["text-1"] as BoardspaceTextCard),
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
		todoCards: [],
		tableCards: [],
	});
	assert.equal(adapter.serializeEditorState(loaded.editorState), populatedSource);
});

test("round-trips a to-do card and stable task identities through the complete editor representation", () => {
	const adapter = createSchemaV2BoardspaceDocumentAdapter();
	const loaded = adapter.loadSource(todoSource);

	assert.equal(loaded.status, "editable");
	if (loaded.status !== "editable") return;
	assert.deepEqual(loaded.editorState, {
		kind: "canonical",
		textCards: [],
		todoCards: [
			{
				id: "todo-1",
				order: 0,
				position: { x: 80, y: 120 },
				preferredSize: { width: 360, height: 148 },
				style: todoDocument.items["todo-1"]?.style,
				tasks: [
					{ id: "task-1", text: "Ship **without Markdown**", checked: false },
					{ id: "task-2", text: "Tell the team", checked: true },
				],
				title: "Release checklist",
			},
		],
		tableCards: [],
	});
	assert.equal(adapter.serializeEditorState(loaded.editorState), todoSource);
});

test("round-trips a table card and stable row and column identities through the complete editor representation", () => {
	const adapter = createSchemaV2BoardspaceDocumentAdapter();
	const loaded = adapter.loadSource(tableSource);

	assert.equal(loaded.status, "editable");
	if (loaded.status !== "editable") return;
	assert.deepEqual(loaded.editorState, {
		kind: "canonical",
		textCards: [],
		todoCards: [],
		tableCards: [{
			id: "table-1",
			order: 0,
			position: { x: 160, y: 220 },
			preferredSize: { width: 540, height: 240 },
			style: tableCard.style,
			title: "Release matrix",
			columns: [
				{ id: "column-owner", title: "Owner" },
				{ id: "column-status", title: "Status" },
			],
			rows: [{
				id: "row-one",
				cells: [
					{ columnId: "column-owner", value: "Ada **plain**" },
					{ columnId: "column-status", value: "Ready" },
				],
			}],
		}],
	});
	assert.equal(adapter.serializeEditorState(loaded.editorState), tableSource);
});

test("preserves table row and column identities across edits and reorder in an editor snapshot", () => {
	const adapter = createSchemaV2BoardspaceDocumentAdapter();
	adapter.loadSource(tableSource);
	const snapshot = structuredClone(emptyEditorSnapshot) as unknown as BoardspaceSnapshot;
	addSnapshotTableCard(snapshot, "table-1", [...tableCard.columns].reverse(), [{
		id: "row-one",
		cells: [
			{ columnId: "column-status", value: "Shipped" },
			{ columnId: "column-owner", value: "Ada" },
		],
	}]);

	const saved = adapter.serializeEditorState(createSnapshotEditorState(snapshot));
	const reopened = parseBoardspaceDocument(saved);
	assert.equal(reopened.status, "editable");
	if (reopened.status !== "editable") return;
	const table = reopened.document.items["table-1"];
	assert.equal(table?.kind, "table");
	if (table?.kind !== "table") return;
	assert.deepEqual(table.columns.map((column) => column.id), ["column-status", "column-owner"]);
	assert.deepEqual(table.rows, [{
		id: "row-one",
		cells: [
			{ columnId: "column-status", value: "Shipped" },
			{ columnId: "column-owner", value: "Ada" },
		],
	}]);
});

test("duplicating a table card renews the copied card's row and column identities", () => {
	const adapter = createSchemaV2BoardspaceDocumentAdapter();
	const loaded = adapter.loadSource(tableSource);
	assert.equal(loaded.status, "editable");
	if (loaded.status !== "editable" || loaded.editorState?.kind !== "canonical") return;
	const original = loaded.editorState.tableCards[0];
	assert.ok(original);
	const duplicate = structuredClone(original);
	duplicate.id = "table-copy";
	duplicate.order = 1;
	loaded.editorState.tableCards.push(duplicate);

	const firstSaved = adapter.serializeEditorState(loaded.editorState);
	const firstReopened = parseBoardspaceDocument(firstSaved);
	assert.equal(firstReopened.status, "editable");
	if (firstReopened.status !== "editable") return;
	const copy = firstReopened.document.items["table-copy"];
	assert.equal(copy?.kind, "table");
	if (copy?.kind !== "table") return;
	assert.notDeepEqual(copy.columns.map((column) => column.id), tableCard.columns.map((column) => column.id));
	assert.notDeepEqual(copy.rows.map((row) => row.id), tableCard.rows.map((row) => row.id));
	assert.deepEqual(copy.rows[0]?.cells.map((cell) => cell.columnId), copy.columns.map((column) => column.id));
	assert.equal(adapter.serializeEditorState(loaded.editorState), firstSaved);
});

test("invalid table references and duplicate nested identities block the complete save", () => {
	const adapter = createSchemaV2BoardspaceDocumentAdapter();
	adapter.loadSource(tableSource);
	const invalidReference = structuredClone(emptyEditorSnapshot) as unknown as BoardspaceSnapshot;
	addSnapshotTableCard(invalidReference, "table-1", tableCard.columns, [{
		id: "row-one",
		cells: [
			{ columnId: "missing", value: "Ada" },
			{ columnId: "column-status", value: "Ready" },
		],
	}]);
	assert.throws(
		() => adapter.serializeEditorState(createSnapshotEditorState(invalidReference)),
		/references missing column missing.*complete save was blocked/i,
	);

	const duplicateIdentity = structuredClone(emptyEditorSnapshot) as unknown as BoardspaceSnapshot;
	addSnapshotTableCard(duplicateIdentity, "table-1", [
		{ id: "column-owner", title: "Owner" },
		{ id: "column-owner", title: "Status" },
	], [{
		id: "row-one",
		cells: [
			{ columnId: "column-owner", value: "Ada" },
			{ columnId: "column-owner", value: "Ready" },
		],
	}]);
	assert.throws(
		() => adapter.serializeEditorState(createSnapshotEditorState(duplicateIdentity)),
		/identity column-owner appears more than once.*complete save was blocked/i,
	);
});

test("preserves task identities across edits and reorder in an editor snapshot", () => {
	const adapter = createSchemaV2BoardspaceDocumentAdapter();
	adapter.loadSource(todoSource);
	const snapshot = structuredClone(emptyEditorSnapshot) as unknown as BoardspaceSnapshot;
	addSnapshotTodoCard(snapshot, "todo-1", [
		{ id: "task-2", text: "Tell everyone", checked: true },
		{ id: "task-1", text: "Ship **without Markdown**", checked: true },
	]);

	const saved = adapter.serializeEditorState(createSnapshotEditorState(snapshot));
	const reopened = parseBoardspaceDocument(saved);
	assert.equal(reopened.status, "editable");
	if (reopened.status !== "editable") return;
	const todo = reopened.document.items["todo-1"];
	assert.equal(todo?.kind, "todo");
	if (todo?.kind !== "todo") return;
	assert.deepEqual(todo.tasks, [
		{ id: "task-2", text: "Tell everyone", checked: true },
		{ id: "task-1", text: "Ship **without Markdown**", checked: true },
	]);
});

test("duplicate task identities block the complete save with an actionable error", () => {
	const adapter = createSchemaV2BoardspaceDocumentAdapter();
	adapter.loadSource(todoSource);
	const snapshot = structuredClone(emptyEditorSnapshot) as unknown as BoardspaceSnapshot;
	addSnapshotTodoCard(snapshot, "todo-1", [
		{ id: "task-1", text: "First", checked: false },
		{ id: "task-1", text: "Duplicate", checked: false },
	]);

	assert.throws(
		() => adapter.serializeEditorState(createSnapshotEditorState(snapshot)),
		/Duplicate to-do task identity task-1 blocks the complete save/,
	);
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
	const reopenedText2 = reopened.document.items["text-2"];
	assert.equal(reopenedText2?.kind, "text");
	assert.equal(reopenedText2?.kind === "text" ? reopenedText2.markdown : undefined, "Second card edited");
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
	const reopenedText = reopened.document.items["text-created"];
	assert.equal(reopenedText?.kind, "text");
	assert.equal(
		reopenedText?.kind === "text" ? reopenedText.markdown : undefined,
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

function addSnapshotTableCard(
	snapshot: BoardspaceSnapshot,
	id: string,
	columns: Array<{ id: string; title: string }>,
	rows: Array<{ id: string; cells: Array<{ columnId: string; value: string }> }>,
) {
	(snapshot.document.store as Record<string, unknown>)[`shape:${id}`] = {
		id: `shape:${id}`,
		typeName: "shape",
		type: "board-table",
		parentId: "page:page",
		index: "a1",
		opacity: 0.85,
		x: 160,
		y: 220,
		props: {
			color: "light-violet",
			columns,
			customColor: "#a78bfa",
			dash: "dotted",
			fill: "solid",
			h: 240,
			rows,
			size: "l",
			title: "Release matrix",
			topBarColor: "violet",
			topBarCustomColor: "#8b5cf6",
			w: 540,
		},
	};
}

function addSnapshotTodoCard(
	snapshot: BoardspaceSnapshot,
	id: string,
	tasks: Array<{ id: string; text: string; checked: boolean }>,
) {
	(snapshot.document.store as Record<string, unknown>)[`shape:${id}`] = {
		id: `shape:${id}`,
		typeName: "shape",
		type: "board-todo",
		parentId: "page:page",
		index: "a1",
		opacity: 0.8,
		x: 80,
		y: 120,
		props: {
			color: "light-green",
			customColor: "#22c55e",
			dash: "dashed",
			fill: "solid",
			h: 148,
			size: "l",
			tasks,
			title: "Release checklist",
			topBarColor: "green",
			topBarCustomColor: "#16a34a",
			w: 360,
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
