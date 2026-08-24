import test from "node:test";
import assert from "node:assert/strict";
import { createSchemaV2BoardspaceDocumentAdapter } from "../src/files/boardspace-document-adapter";
import {
	createEmptyBoardspaceDocument,
	serializeBoardspaceDocument,
} from "../src/files/boardspace-document";
import type { BoardspaceSnapshot } from "../src/types/board";

const emptySource = serializeBoardspaceDocument(createEmptyBoardspaceDocument());

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
	assert.equal(adapter.serializeEditorState(emptyEditorSnapshot), emptySource);
	assert.doesNotMatch(adapter.serializeEditorState(emptyEditorSnapshot), /currentPageId|selectedShapeIds|isFocusMode/);
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
