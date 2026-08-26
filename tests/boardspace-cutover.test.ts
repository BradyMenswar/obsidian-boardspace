import test from "node:test";
import assert from "node:assert/strict";
import {
	BOARDSPACE_SCHEMA_VERSION,
	createEmptyBoardspaceSource,
	parseBoardspaceDocument,
	serializeBoardspaceDocument,
	type BoardspaceDocumentV2,
} from "../src/files/boardspace-document";
import { hasBoardspaceFrontmatter } from "../src/files/boardspace-frontmatter";
import {
	formatBoardLinkCounts,
	getBoardLinkCountsFromDocument,
	getBoardLinkCountsFromSource,
} from "../src/tldraw/board-link-counts";

test("creates a valid empty schema-v2 Boardspace source", () => {
	const source = createEmptyBoardspaceSource();
	const parsed = parseBoardspaceDocument(source);

	assert.equal(parsed.status, "editable");
	if (parsed.status !== "editable") return;
	assert.equal(parsed.document.schemaVersion, 2);
	assert.deepEqual(parsed.document.items, {});
	assert.deepEqual(parsed.document.textCardOrder, []);
	assert.doesNotMatch(source, /"session"|pageStates|selectedShapeIds|currentPageId|activeTool|isFocusMode/);
});

test("detects Boardspace frontmatter independently of schema support", () => {
	assert.equal(hasBoardspaceFrontmatter({ frontmatter: { type: "boardspace", "board-version": BOARDSPACE_SCHEMA_VERSION } }), true);
	assert.equal(hasBoardspaceFrontmatter({ frontmatter: { type: "boardspace", "board-version": 1 } }), true);
	assert.equal(hasBoardspaceFrontmatter({ frontmatter: { type: "boardspace" } }), true);
	assert.equal(hasBoardspaceFrontmatter({ frontmatter: { type: "note", "board-version": BOARDSPACE_SCHEMA_VERSION } }), false);
});

test("reads linked-board counts only from editable schema-v2 documents", () => {
	const style = {
		color: "blue",
		customColor: "#3b82f6",
		dash: "solid",
		fill: "semi",
		opacity: 1,
		size: "m",
		topBarColor: "transparent",
		topBarCustomColor: "#3b82f6",
	};
	const placement = { type: "root" as const, order: 0, position: { x: 0, y: 0 } };
	const preferredSize = { width: 240, height: 160 };
	const document: BoardspaceDocumentV2 = {
		schemaVersion: 2,
		frontmatterLines: [],
		textCardOrder: [],
		items: {
			"link-1": { id: "link-1", kind: "board-link", targetPath: "One.md", title: "One", icon: "board", placement, preferredSize, style },
			"link-2": { id: "link-2", kind: "board-link", targetPath: "Two.md", title: "Two", icon: "board", placement: { ...placement, order: 1 }, preferredSize, style },
			"todo-1": { id: "todo-1", kind: "todo", title: "Tasks", tasks: [], placement: { ...placement, order: 2 }, preferredSize, style },
		},
	};
	const source = serializeBoardspaceDocument(document);

	assert.deepEqual(getBoardLinkCountsFromDocument(document), { boardCount: 2, cardCount: 1 });
	assert.deepEqual(getBoardLinkCountsFromSource(source), { boardCount: 2, cardCount: 1 });
	assert.equal(getBoardLinkCountsFromSource(source.replace("board-version: 2", "board-version: 1")), null);
	assert.equal(formatBoardLinkCounts({ boardCount: 1, cardCount: 4 }), "1 board, 4 cards");
});
