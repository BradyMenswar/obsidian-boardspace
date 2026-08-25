import test from "node:test";
import assert from "node:assert/strict";
import {
	createSchemaV2BoardspaceDocumentAdapter,
	createSnapshotEditorState,
	editorStateReferencesBoardLinkTarget,
	editorStateReferencesMediaAttachment,
	getArrowVisualTargetId,
	updateBoardLinkTargetPath,
	updateMediaAttachmentPath,
} from "../src/files/boardspace-document-adapter";
import {
	BoardspaceArrow,
	BoardspaceBoardLinkCard,
	BoardspaceColumn,
	BoardspaceColorSwatchCard,
	BoardspaceDocumentV2,
	BoardspaceMediaCard,
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

const columnDocument: BoardspaceDocumentV2 = {
	...populatedDocument,
	items: {
		"column-1": {
			id: "column-1",
			kind: "column",
			title: "Now",
			collapsed: true,
			placement: { type: "root", order: 0, position: { x: 20, y: 30 } },
			width: 380,
			style: { ...(populatedDocument.items["text-1"] as BoardspaceTextCard).style },
		},
		"text-1": {
			...(populatedDocument.items["text-1"] as BoardspaceTextCard),
			placement: { type: "column", columnId: "column-1", order: 0 },
		},
	},
};
const columnSource = serializeBoardspaceDocument(columnDocument);

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

const swatchCard: BoardspaceColorSwatchCard = {
	id: "swatch-1",
	kind: "color-swatch",
	color: "#3b82f6",
	label: "hex",
	placement: { type: "root", order: 1, position: { x: 260, y: 180 } },
	preferredSize: { width: 280, height: 160 },
	style: { opacity: 0.7 },
};
const swatchDocument: BoardspaceDocumentV2 = {
	schemaVersion: 2,
	frontmatterLines: [],
	textCardOrder: [],
	items: { "swatch-1": swatchCard },
};
const swatchSource = serializeBoardspaceDocument(swatchDocument);

const mediaCard: BoardspaceMediaCard = {
	id: "media-1",
	kind: "media",
	attachmentPath: "Attachments/photo.png",
	caption: "A plain **caption**",
	metadata: {
		type: "image",
		name: "photo.png",
		mimeType: "image/png",
		width: 1200,
		height: 800,
		isAnimated: false,
		fileSize: 34567,
		pixelRatio: 2,
		altText: "A photo",
	},
	placement: { type: "root", order: 0, position: { x: 220, y: 180 } },
	preferredSize: { width: 450, height: 300 },
	style: { opacity: 0.9 },
};
const mediaDocument: BoardspaceDocumentV2 = {
	schemaVersion: 2,
	frontmatterLines: [],
	textCardOrder: [],
	items: { "media-1": mediaCard },
};
const mediaSource = serializeBoardspaceDocument(mediaDocument);

const boardLinkCard: BoardspaceBoardLinkCard = {
	id: "board-link-1",
	kind: "board-link",
	targetPath: "Projects/Board B.md",
	title: "Board **B**",
	icon: "bookmark",
	placement: { type: "root", order: 0, position: { x: 300, y: 180 } },
	preferredSize: { width: 210, height: 168 },
	style: {
		color: "grey",
		customColor: "#6b7280",
		dash: "solid",
		fill: "semi",
		opacity: 0.75,
		size: "m",
		topBarColor: "transparent",
		topBarCustomColor: "#f8fafc",
	},
};
const boardLinkSource = serializeBoardspaceDocument({
	schemaVersion: 2,
	frontmatterLines: [],
	textCardOrder: [],
	items: { "board-link-1": boardLinkCard },
});

const arrow: BoardspaceArrow = {
	id: "arrow-1",
	kind: "arrow",
	placement: { type: "root", order: 1, position: { x: 0, y: 0 } },
	geometry: "curved",
	bend: 48,
	start: { type: "free", point: { x: 80, y: 100 } },
	end: { type: "item", itemId: "text-1", point: { x: 360, y: 108 } },
	arrowheadStart: "dot",
	arrowheadEnd: "triangle",
	dash: "dashed",
	color: "blue",
	size: "l",
	label: "Plain **label**",
};
const arrowDocument: BoardspaceDocumentV2 = {
	...populatedDocument,
	items: { ...populatedDocument.items, "arrow-1": arrow },
};
const arrowSource = serializeBoardspaceDocument(arrowDocument);

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

test("round-trips straight and curved root arrows with free and item-bound endpoints", () => {
	const adapter = createSchemaV2BoardspaceDocumentAdapter();
	const loaded = adapter.loadSource(arrowSource);

	assert.equal(loaded.status, "editable");
	if (loaded.status !== "editable" || loaded.editorState?.kind !== "canonical") return;
	assert.deepEqual(loaded.editorState.arrows, [arrow]);
	assert.equal(adapter.serializeEditorState(loaded.editorState), arrowSource);

	const straightState = structuredClone(loaded.editorState);
	assert.ok(straightState.arrows);
	straightState.arrows[0] = {
		...straightState.arrows[0]!,
		geometry: "straight",
		bend: 0,
		start: { type: "free", point: { x: -20, y: 12 } },
	};
	const straightSaved = adapter.serializeEditorState(straightState);
	const straightReopened = parseBoardspaceDocument(straightSaved);
	assert.equal(straightReopened.status, "editable");
	if (straightReopened.status === "editable") {
		assert.deepEqual(straightReopened.document.items["arrow-1"], straightState.arrows[0]);
	}
});

test("invalid arrow targets and unsupported arrow styles block complete loading and saving", () => {
	const missingTarget = arrowSource.replace('"itemId": "text-1"', '"itemId": "missing"');
	const invalidLoad = createSchemaV2BoardspaceDocumentAdapter().loadSource(missingTarget);
	assert.equal(invalidLoad.status, "read-only");
	if (invalidLoad.status === "read-only") {
		assert.equal(invalidLoad.diagnostics[0]?.code, "arrow-target-invalid");
		assert.match(invalidLoad.diagnostics[0]?.message ?? "", /arrow arrow-1.*missing canvas item missing/i);
	}
	const unsupportedStyle = createSchemaV2BoardspaceDocumentAdapter().loadSource(
		arrowSource.replace('"dash": "dashed"', '"dash": "zigzag"'),
	);
	assert.equal(unsupportedStyle.status, "read-only");
	if (unsupportedStyle.status === "read-only") {
		assert.equal(unsupportedStyle.diagnostics[0]?.code, "arrow-style-unsupported");
		assert.match(unsupportedStyle.diagnostics[0]?.message ?? "", /arrow arrow-1.*dash/i);
	}

	const adapter = createSchemaV2BoardspaceDocumentAdapter();
	adapter.loadSource(emptySource);
	const snapshot = structuredClone(emptyEditorSnapshot) as unknown as BoardspaceSnapshot;
	addSnapshotArrow(snapshot, { dash: "solid", kind: "elbow" });
	assert.throws(
		() => adapter.serializeEditorState(createSnapshotEditorState(snapshot)),
		/arrow arrow-1 uses unsupported elbow geometry.*complete save was blocked/i,
	);
});

test("persists an editor arrow binding as a canonical canvas-item endpoint", () => {
	const adapter = createSchemaV2BoardspaceDocumentAdapter();
	adapter.loadSource(emptySource);
	const snapshot = structuredClone(emptyEditorSnapshot) as unknown as BoardspaceSnapshot;
	addSnapshotTextCard(snapshot, "text-1", "a0", "Target", 40);
	addSnapshotArrow(snapshot);
	addSnapshotArrowBinding(snapshot, "end", "text-1");

	const saved = adapter.serializeEditorState(createSnapshotEditorState(snapshot));
	const reopened = parseBoardspaceDocument(saved);
	assert.equal(reopened.status, "editable");
	if (reopened.status !== "editable") return;
	const savedArrow = reopened.document.items["arrow-1"];
	assert.equal(savedArrow?.kind, "arrow");
	if (savedArrow?.kind !== "arrow") return;
	assert.deepEqual(savedArrow.end, { type: "item", itemId: "text-1", point: { x: 360, y: 108 } });
	assert.equal(savedArrow.placement.order, 1);
});

test("converts a tldraw-reparented arrow back to a root canvas item", () => {
	const adapter = createSchemaV2BoardspaceDocumentAdapter();
	adapter.loadSource(emptySource);
	const snapshot = structuredClone(emptyEditorSnapshot) as unknown as BoardspaceSnapshot;
	addSnapshotColumn(snapshot);
	addSnapshotTextCard(snapshot, "text-1", "a0", "Target", 10);
	const text = (snapshot.document.store as unknown as Record<string, Record<string, unknown>>)["shape:text-1"]!;
	text.parentId = "shape:column-1";
	addSnapshotArrow(snapshot);
	const rawArrow = (snapshot.document.store as unknown as Record<string, Record<string, unknown>>)["shape:arrow-1"]!;
	rawArrow.parentId = "shape:column-1";
	rawArrow.x = 60;
	rawArrow.y = 70;
	addSnapshotArrowBinding(snapshot, "end", "text-1");

	const reopened = parseBoardspaceDocument(adapter.serializeEditorState(createSnapshotEditorState(snapshot)));
	assert.equal(reopened.status, "editable");
	if (reopened.status !== "editable") return;
	const savedArrow = reopened.document.items["arrow-1"];
	assert.equal(savedArrow?.kind, "arrow");
	if (savedArrow?.kind !== "arrow") return;
	assert.deepEqual(savedArrow.placement, { type: "root", order: 1, position: { x: 80, y: 100 } });
});

test("deleting a bound item leaves a free arrow endpoint at its last resolved canvas point", () => {
	const adapter = createSchemaV2BoardspaceDocumentAdapter();
	adapter.loadSource(arrowSource);
	const snapshot = structuredClone(emptyEditorSnapshot) as unknown as BoardspaceSnapshot;
	addSnapshotArrow(snapshot);

	const saved = adapter.serializeEditorState(createSnapshotEditorState(snapshot));
	const reopened = parseBoardspaceDocument(saved);
	assert.equal(reopened.status, "editable");
	if (reopened.status !== "editable") return;
	const savedArrow = reopened.document.items["arrow-1"];
	assert.equal(savedArrow?.kind, "arrow");
	if (savedArrow?.kind !== "arrow") return;
	assert.deepEqual(savedArrow.end, { type: "free", point: { x: 360, y: 108 } });
});

test("keeps a collapsed-column card binding canonical while resolving it to the column boundary", () => {
	const collapsedArrow: BoardspaceArrow = {
		...arrow,
		end: { type: "item", itemId: "text-1", point: { x: 400, y: 72 } },
	};
	const source = serializeBoardspaceDocument({
		...columnDocument,
		items: { ...columnDocument.items, "arrow-1": collapsedArrow },
	});
	const loaded = createSchemaV2BoardspaceDocumentAdapter().loadSource(source);
	assert.equal(loaded.status, "editable");
	if (loaded.status !== "editable" || loaded.editorState?.kind !== "canonical") return;
	assert.deepEqual(loaded.editorState.arrows?.[0]?.end, collapsedArrow.end);
	assert.equal(getArrowVisualTargetId(loaded.editorState, collapsedArrow.end as Extract<typeof collapsedArrow.end, { type: "item" }>), "column-1");
});

test("round-trips a column and derives contained-card geometry while retaining preferred size", () => {
	const adapter = createSchemaV2BoardspaceDocumentAdapter();
	const loaded = adapter.loadSource(columnSource);

	assert.equal(loaded.status, "editable");
	if (loaded.status !== "editable" || loaded.editorState?.kind !== "canonical") return;
	assert.deepEqual(loaded.editorState.columns, [{
		id: "column-1",
		title: "Now",
		collapsed: true,
		order: 0,
		position: { x: 20, y: 30 },
		width: 380,
		style: (columnDocument.items["column-1"] as BoardspaceColumn).style,
	}]);
	assert.deepEqual(loaded.editorState.textCards[0], {
		id: "text-1",
		markdown: "# Heading\n\nRaw **Markdown**",
		columnId: "column-1",
		order: 0,
		position: { x: 0, y: 0 },
		preferredSize: { width: 320, height: 96 },
		style: (populatedDocument.items["text-1"] as BoardspaceTextCard).style,
	});
	assert.equal(adapter.serializeEditorState(loaded.editorState), columnSource);
	assert.doesNotMatch(columnSource, /"position"[^}]*"columnId"|renderedWidth|measuredHeight|cardCount/);
});

test("persists a snapshot column without derived geometry and keeps a contained card's preferred size", () => {
	const adapter = createSchemaV2BoardspaceDocumentAdapter();
	adapter.loadSource(emptySource);
	const snapshot = structuredClone(emptyEditorSnapshot) as unknown as BoardspaceSnapshot;
	addSnapshotColumn(snapshot);
	addSnapshotTextCard(snapshot, "text-1", "a1", "Inside", 10);
	const textShape = (snapshot.document.store as Record<string, unknown>)["shape:text-1"] as Record<string, unknown>;
	textShape.parentId = "shape:column-1";
	textShape.x = 10;
	textShape.y = 120;
	const textProps = textShape.props as Record<string, unknown>;
	textProps.w = 360;
	textProps.h = 180;
	textShape.meta = { boardspacePreferredSize: { width: 320, height: 96 } };

	const saved = adapter.serializeEditorState(createSnapshotEditorState(snapshot));
	const reopened = parseBoardspaceDocument(saved);
	assert.equal(reopened.status, "editable");
	if (reopened.status !== "editable") return;
	assert.deepEqual(reopened.document.items["text-1"]?.placement, { type: "column", columnId: "column-1", order: 0 });
	assert.deepEqual((reopened.document.items["text-1"] as BoardspaceTextCard).preferredSize, { width: 320, height: 96 });
	assert.doesNotMatch(saved, /"h": 180|"w": 360|"minH"|measuredHeight|renderedWidth/);
});

test("allows every supported card kind in one total column order", () => {
	const cards = [
		columnDocument.items["text-1"] as BoardspaceTextCard,
		todoDocument.items["todo-1"]!,
		tableCard,
		swatchCard,
		mediaCard,
		boardLinkCard,
	].map((card, order) => ({ ...card, placement: { type: "column" as const, columnId: "column-1", order } }));
	const document: BoardspaceDocumentV2 = {
		...columnDocument,
		items: {
			"column-1": columnDocument.items["column-1"]!,
			...Object.fromEntries(cards.map((card) => [card.id, card])),
		},
	};
	const source = serializeBoardspaceDocument(document);
	const loaded = createSchemaV2BoardspaceDocumentAdapter().loadSource(source);
	assert.equal(loaded.status, "editable");
	if (loaded.status !== "editable" || loaded.editorState?.kind !== "canonical") return;
	assert.deepEqual([
		...loaded.editorState.textCards,
		...loaded.editorState.todoCards,
		...loaded.editorState.tableCards,
		...loaded.editorState.swatchCards,
		...loaded.editorState.mediaCards,
		...loaded.editorState.boardLinkCards,
	].map((card) => card.columnId), Array(6).fill("column-1"));
});

test("rejects missing column parents and non-total sibling order", () => {
	const missingParent = columnSource.replace('"columnId": "column-1"', '"columnId": "missing"');
	const missingResult = parseBoardspaceDocument(missingParent);
	assert.equal(missingResult.status, "read-only");
	if (missingResult.status === "read-only") assert.equal(missingResult.diagnostics[0]?.code, "column-placement-invalid");

	assert.throws(() => serializeBoardspaceDocument({
		...columnDocument,
		items: {
			...columnDocument.items,
			"text-2": {
				...(columnDocument.items["text-1"] as BoardspaceTextCard),
				id: "text-2",
				markdown: "Second",
			},
		},
		textCardOrder: ["text-1", "text-2"],
	}), /total order without ties/);
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
				style: (populatedDocument.items["text-1"] as BoardspaceTextCard).style,
			},
		],
		todoCards: [],
		tableCards: [],
		swatchCards: [],
		mediaCards: [],
		boardLinkCards: [],
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
				style: todoDocument.items["todo-1"]?.kind === "todo" ? todoDocument.items["todo-1"].style : undefined,
				tasks: [
					{ id: "task-1", text: "Ship **without Markdown**", checked: false },
					{ id: "task-2", text: "Tell the team", checked: true },
				],
				title: "Release checklist",
			},
		],
		tableCards: [],
		swatchCards: [],
		mediaCards: [],
		boardLinkCards: [],
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
		swatchCards: [],
		mediaCards: [],
		boardLinkCards: [],
	});
	assert.equal(adapter.serializeEditorState(loaded.editorState), tableSource);
});

test("round-trips a media card and owned plain-text caption through the complete editor representation", () => {
	const adapter = createSchemaV2BoardspaceDocumentAdapter();
	const loaded = adapter.loadSource(mediaSource);

	assert.equal(loaded.status, "editable");
	if (loaded.status !== "editable") return;
	assert.deepEqual(loaded.editorState, {
		kind: "canonical",
		textCards: [],
		todoCards: [],
		tableCards: [],
		swatchCards: [],
		mediaCards: [{
			id: "media-1",
			attachmentPath: "Attachments/photo.png",
			caption: "A plain **caption**",
			metadata: mediaCard.metadata,
			order: 0,
			position: { x: 220, y: 180 },
			preferredSize: { width: 450, height: 300 },
			style: { opacity: 0.9 },
		}],
		boardLinkCards: [],
	});
	assert.equal(adapter.serializeEditorState(loaded.editorState), mediaSource);
});

test("round-trips a board link without persisting derived counts or an editor page", () => {
	const adapter = createSchemaV2BoardspaceDocumentAdapter();
	const loaded = adapter.loadSource(boardLinkSource);

	assert.equal(loaded.status, "editable");
	if (loaded.status !== "editable") return;
	assert.deepEqual(loaded.editorState, {
		kind: "canonical",
		textCards: [],
		todoCards: [],
		tableCards: [],
		swatchCards: [],
		mediaCards: [],
		boardLinkCards: [{
			id: "board-link-1",
			targetPath: "Projects/Board B.md",
			title: "Board **B**",
			icon: "bookmark",
			order: 0,
			position: { x: 300, y: 180 },
			preferredSize: { width: 210, height: 168 },
			style: boardLinkCard.style,
		}],
	});
	const saved = adapter.serializeEditorState(loaded.editorState);
	assert.equal(saved, boardLinkSource);
	assert.doesNotMatch(saved, /boardCount|cardCount|typeName|page:/);
});

test("persists a board link from the complete editor representation while recomputing derived counts", () => {
	const adapter = createSchemaV2BoardspaceDocumentAdapter();
	adapter.loadSource(emptySource);
	const snapshot = structuredClone(emptyEditorSnapshot) as unknown as BoardspaceSnapshot;
	addSnapshotBoardLink(snapshot, "board-link-1", "Projects/Board B.md", 99, 42);

	const saved = adapter.serializeEditorState(createSnapshotEditorState(snapshot));
	const reopened = parseBoardspaceDocument(saved);
	assert.equal(reopened.status, "editable");
	if (reopened.status !== "editable") return;
	assert.deepEqual(reopened.document.items["board-link-1"], boardLinkCard);
	assert.doesNotMatch(saved, /boardCount|cardCount/);
	assert.match(saved, /## Board links\n- \[\[Projects\/Board B\]\]/);
});

test("updates board-link target paths on rename and retains the last path when a target disappears", () => {
	const loaded = createSchemaV2BoardspaceDocumentAdapter().loadSource(boardLinkSource);
	assert.equal(loaded.status, "editable");
	if (loaded.status !== "editable" || !loaded.editorState) return;

	const renamed = updateBoardLinkTargetPath(loaded.editorState, "Projects/Board B.md", "Archive/Board B.md");
	assert.equal(renamed.changed, true);
	assert.equal(editorStateReferencesBoardLinkTarget(renamed.state, "Archive/Board B.md"), true);
	assert.equal(renamed.state.kind, "canonical");
	if (renamed.state.kind !== "canonical") return;
	assert.equal(renamed.state.boardLinkCards[0]?.targetPath, "Archive/Board B.md");

	const snapshot = structuredClone(emptyEditorSnapshot) as unknown as BoardspaceSnapshot;
	addSnapshotBoardLink(snapshot, "board-link-1", "Projects/Board B.md", 1, 2);
	const renamedSnapshot = updateBoardLinkTargetPath(createSnapshotEditorState(snapshot), "Projects/Board B.md", "Archive/Board B.md");
	assert.equal(renamedSnapshot.changed, true);
	assert.equal(editorStateReferencesBoardLinkTarget(renamedSnapshot.state, "Archive/Board B.md"), true);

	// Delete events leave the canonical target untouched so the editor can show
	// the visibly broken link at its last known path.
	assert.equal(renamed.state.boardLinkCards[0]?.targetPath, "Archive/Board B.md");
});

test("persists image asset metadata and an optional caption as one media card", () => {
	const adapter = createSchemaV2BoardspaceDocumentAdapter();
	adapter.loadSource(emptySource);
	const snapshot = structuredClone(emptyEditorSnapshot) as unknown as BoardspaceSnapshot;
	addSnapshotMediaCard(snapshot, true);

	const saved = adapter.serializeEditorState(createSnapshotEditorState(snapshot));
	const reopened = parseBoardspaceDocument(saved);
	assert.equal(reopened.status, "editable");
	if (reopened.status !== "editable") return;
	assert.deepEqual(reopened.document.items["media-1"], mediaCard);
	assert.equal(Object.keys(reopened.document.items).length, 1);
	assert.match(saved, /- !\[\[Attachments\/photo\.png\]\]/);
});

test("updates media attachment paths on rename and retains the last path when an attachment disappears", () => {
	const loaded = createSchemaV2BoardspaceDocumentAdapter().loadSource(mediaSource);
	assert.equal(loaded.status, "editable");
	if (loaded.status !== "editable" || !loaded.editorState) return;

	const renamed = updateMediaAttachmentPath(loaded.editorState, "Attachments/photo.png", "Archive/photo.png");
	assert.equal(renamed.changed, true);
	assert.equal(renamed.state.kind, "canonical");
	if (renamed.state.kind !== "canonical") return;
	assert.equal(renamed.state.mediaCards[0]?.attachmentPath, "Archive/photo.png");
	assert.deepEqual(renamed.state.mediaCards[0]?.metadata, mediaCard.metadata);
	assert.equal(editorStateReferencesMediaAttachment(renamed.state, "Archive/photo.png"), true);

	const snapshot = structuredClone(emptyEditorSnapshot) as unknown as BoardspaceSnapshot;
	addSnapshotMediaCard(snapshot, false);
	const renamedSnapshot = updateMediaAttachmentPath(
		createSnapshotEditorState(snapshot),
		"Attachments/photo.png",
		"Archive/photo.png",
	);
	assert.equal(renamedSnapshot.changed, true);
	assert.equal(editorStateReferencesMediaAttachment(renamedSnapshot.state, "Archive/photo.png"), true);
	const snapshotAdapter = createSchemaV2BoardspaceDocumentAdapter();
	snapshotAdapter.loadSource(emptySource);
	const snapshotDocument = parseBoardspaceDocument(snapshotAdapter.serializeEditorState(renamedSnapshot.state));
	assert.equal(snapshotDocument.status, "editable");
	if (snapshotDocument.status !== "editable") return;
	assert.equal((snapshotDocument.document.items["media-1"] as BoardspaceMediaCard).attachmentPath, "Archive/photo.png");

	// Delete events intentionally leave state unchanged, retaining recovery data
	// while the asset resolver displays the missing attachment as broken.
	assert.equal(renamed.state.mediaCards[0]?.attachmentPath, "Archive/photo.png");
});

test("deleting a media card removes only its canonical reference", () => {
	const adapter = createSchemaV2BoardspaceDocumentAdapter();
	adapter.loadSource(mediaSource);
	const snapshot = structuredClone(emptyEditorSnapshot) as unknown as BoardspaceSnapshot;

	const saved = adapter.serializeEditorState(createSnapshotEditorState(snapshot));
	const reopened = parseBoardspaceDocument(saved);
	assert.equal(reopened.status, "editable");
	if (reopened.status !== "editable") return;
	assert.deepEqual(reopened.document.items, {});
	assert.doesNotMatch(saved, /Attachments\/photo\.png/);
});

test("round-trips a color swatch using Boardspace-owned color, label, placement, size, and style values", () => {
	const adapter = createSchemaV2BoardspaceDocumentAdapter();
	const loaded = adapter.loadSource(swatchSource);

	assert.equal(loaded.status, "editable");
	if (loaded.status !== "editable") return;
	assert.deepEqual(loaded.editorState, {
		kind: "canonical",
		textCards: [],
		todoCards: [],
		tableCards: [],
		swatchCards: [{
			id: "swatch-1",
			color: "#3b82f6",
			label: "hex",
			order: 1,
			position: { x: 260, y: 180 },
			preferredSize: { width: 280, height: 160 },
			style: { opacity: 0.7 },
		}],
		mediaCards: [],
		boardLinkCards: [],
	});
	const saved = adapter.serializeEditorState(loaded.editorState);
	assert.equal(saved, swatchSource);
	assert.match(saved, /"label": "hex"/);
	assert.doesNotMatch(saved, /colorValue|labelMode|richText|typeName|board-swatch/);
});

test("persists a color swatch from the complete editor representation with total stacking order", () => {
	const adapter = createSchemaV2BoardspaceDocumentAdapter();
	adapter.loadSource(emptySource);
	const snapshot = structuredClone(emptyEditorSnapshot) as unknown as BoardspaceSnapshot;
	addSnapshotTextCard(snapshot, "text-behind", "a1", "Behind", 40);
	addSnapshotSwatchCard(snapshot, "swatch-front", "a2", "#14b8a6", "rgb");

	const saved = adapter.serializeEditorState(createSnapshotEditorState(snapshot));
	const reopened = parseBoardspaceDocument(saved);
	assert.equal(reopened.status, "editable");
	if (reopened.status !== "editable") return;
	assert.deepEqual(reopened.document.items["swatch-front"], {
		id: "swatch-front",
		kind: "color-swatch",
		color: "#14b8a6",
		label: "rgb",
		placement: { type: "root", order: 1, position: { x: 300, y: 200 } },
		preferredSize: { width: 240, height: 140 },
		style: { opacity: 0.65 },
	});
});

test("invalid color swatch color, label, and style values block loading and saving with actionable diagnostics", () => {
	for (const invalidSource of [
		swatchSource.replace('"color": "#3b82f6"', '"color": "blue"'),
		swatchSource.replace('"label": "hex"', '"label": "markdown"'),
		swatchSource.replace('"opacity": 0.7', '"opacity": 2'),
	]) {
		const invalidLoad = createSchemaV2BoardspaceDocumentAdapter().loadSource(invalidSource);
		assert.equal(invalidLoad.status, "read-only");
		if (invalidLoad.status !== "read-only") continue;
		assert.match(invalidLoad.diagnostics[0]?.message ?? "", /color swatch swatch-1.*malformed/i);
	}

	const adapter = createSchemaV2BoardspaceDocumentAdapter();
	adapter.loadSource(emptySource);
	const invalidSnapshot = structuredClone(emptyEditorSnapshot) as unknown as BoardspaceSnapshot;
	addSnapshotSwatchCard(invalidSnapshot, "swatch-invalid", "a1", "red", "hex");
	assert.throws(
		() => adapter.serializeEditorState(createSnapshotEditorState(invalidSnapshot)),
		/color swatch.*color.*complete save was blocked/i,
	);
	addSnapshotSwatchCard(invalidSnapshot, "swatch-invalid", "a1", "#3b82f6", "hex");
	const rawSwatch = (invalidSnapshot.document.store as Record<string, unknown>)["shape:swatch-invalid"] as Record<string, unknown>;
	rawSwatch.opacity = 2;
	assert.throws(
		() => adapter.serializeEditorState(createSnapshotEditorState(invalidSnapshot)),
		/color swatch.*visual style.*complete save was blocked/i,
	);
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
	const textOnePlacement = reopened.document.items["text-1"]?.placement;
	assert.equal(textOnePlacement?.type === "root" ? textOnePlacement.position.x : undefined, 400);
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
	(unsupportedSnapshot.document.store as Record<string, unknown>)["shape:geo"] = {
		id: "shape:geo",
		typeName: "shape",
		type: "geo",
	};

	assert.throws(
		() => adapter.serializeEditorState(createSnapshotEditorState(unsupportedSnapshot)),
		/Unsupported editor record shape:geo \(geo\) blocks the complete save/,
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

function addSnapshotArrow(
	snapshot: BoardspaceSnapshot,
	overrides: { dash?: string; kind?: string } = {},
) {
	(snapshot.document.store as Record<string, unknown>)["shape:arrow-1"] = {
		id: "shape:arrow-1", typeName: "shape", type: "arrow", parentId: "page:page", index: "a1",
		opacity: 1, x: 80, y: 100,
		props: {
			kind: overrides.kind ?? "arc", labelColor: "blue", color: "blue", fill: "none",
			dash: overrides.dash ?? "dashed", size: "l", arrowheadStart: "dot", arrowheadEnd: "triangle",
			font: "draw", start: { x: 0, y: 0 }, end: { x: 280, y: 8 }, bend: 48,
			richText: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Plain **label**" }] }] },
			labelPosition: 0.5, scale: 1, elbowMidPoint: 0.5,
		},
	};
}

function addSnapshotArrowBinding(
	snapshot: BoardspaceSnapshot,
	terminal: "start" | "end",
	targetId: string,
) {
	(snapshot.document.store as Record<string, unknown>)[`binding:arrow-1-${terminal}`] = {
		id: `binding:arrow-1-${terminal}`,
		typeName: "binding",
		type: "arrow",
		fromId: "shape:arrow-1",
		toId: `shape:${targetId}`,
		meta: {},
		props: {
			terminal,
			normalizedAnchor: { x: 0.5, y: 0.5 },
			isExact: false,
			isPrecise: false,
			snap: "none",
		},
	};
}

function addSnapshotColumn(snapshot: BoardspaceSnapshot) {
	(snapshot.document.store as Record<string, unknown>)["shape:column-1"] = {
		id: "shape:column-1", typeName: "shape", type: "board-column", parentId: "page:page", index: "a1",
		opacity: 0.9, x: 20, y: 30,
		props: {
			collapsed: false, color: "blue", customColor: "#6b7280", dash: "solid", fill: "semi",
			h: 420, minH: 180, size: "m", title: "Now", topBarColor: "transparent",
			topBarCustomColor: "#6b7280", w: 380,
		},
	};
}

function addSnapshotBoardLink(
	snapshot: BoardspaceSnapshot,
	id: string,
	filePath: string,
	boardCount: number,
	cardCount: number,
) {
	(snapshot.document.store as Record<string, unknown>)[`shape:${id}`] = {
		id: `shape:${id}`,
		typeName: "shape",
		type: "board-link",
		parentId: "page:page",
		index: "a1",
		opacity: 0.75,
		x: 300,
		y: 180,
		props: {
			boardCount,
			cardCount,
			color: "grey",
			customColor: "#6b7280",
			dash: "solid",
			filePath,
			fill: "semi",
			h: 168,
			icon: "bookmark",
			size: "m",
			title: "Board **B**",
			topBarColor: "transparent",
			topBarCustomColor: "#f8fafc",
			w: 210,
		},
	};
}

function addSnapshotMediaCard(snapshot: BoardspaceSnapshot, includeCaption: boolean) {
	const store = snapshot.document.store as Record<string, unknown>;
	store["asset:media-1"] = {
		id: "asset:media-1", typeName: "asset", type: "image",
		meta: { boardspaceVaultPath: "Attachments/photo.png" },
		props: { w: 1200, h: 800, name: "photo.png", isAnimated: false, mimeType: "image/png", src: "asset:media-1", fileSize: 34567, pixelRatio: 2 },
	};
	store["shape:media-1"] = {
		id: "shape:media-1", typeName: "shape", type: "image", parentId: "page:page", index: "a1",
		opacity: 0.9, x: 220, y: 180,
		props: { w: 450, h: 300, playing: true, url: "", assetId: "asset:media-1", crop: null, flipX: false, flipY: false, altText: "A photo" },
	};
	if (includeCaption) {
		store["shape:media-caption"] = {
			id: "shape:media-caption", typeName: "shape", type: "board-note", parentId: "shape:media-1", index: "a1",
			opacity: 1, x: 0, y: 300, meta: { boardspaceMediaCaption: true },
			props: { color: "blue", customColor: "#6b7280", dash: "solid", fill: "semi", h: 96, markdown: "A plain **caption**", minH: 96, size: "m", topBarColor: "transparent", topBarCustomColor: "#6b7280", w: 450 },
		};
	}
}

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

function addSnapshotSwatchCard(
	snapshot: BoardspaceSnapshot,
	id: string,
	index: string,
	colorValue: string,
	labelMode: "none" | "hex" | "rgb" | "hsl",
) {
	(snapshot.document.store as Record<string, unknown>)[`shape:${id}`] = {
		id: `shape:${id}`,
		typeName: "shape",
		type: "board-swatch",
		parentId: "page:page",
		index,
		opacity: 0.65,
		x: 300,
		y: 200,
		props: {
			colorValue,
			h: 140,
			labelMode,
			w: 240,
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
