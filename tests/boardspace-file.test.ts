import test from "node:test";
import assert from "node:assert/strict";
import {
	isSupportedBoardspaceVersion,
	parseBoardspaceFile,
	parseBoardspaceFileWithMetadata,
	serializeBoardspaceFile,
} from "../src/files/boardspace-file";
import { hasBoardspaceFrontmatter } from "../src/files/boardspace-frontmatter";
import {
	BOARDSPACE_FILE_VERSION,
	BoardspaceSnapshot,
} from "../src/types/board";
import {
	formatBoardLinkCounts,
	getBoardLinkCountsFromSnapshot,
} from "../src/tldraw/board-link-counts";

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

test("serializes and parses a boardspace snapshot", () => {
	const fileContents = serializeBoardspaceFile(snapshot);
	const result = parseBoardspaceFileWithMetadata(fileContents);

	assert.equal(result.version, BOARDSPACE_FILE_VERSION);
	assert.deepEqual(result.snapshot, snapshot);
	assert.deepEqual(parseBoardspaceFile(fileContents), snapshot);
});

test("serializes board links as Obsidian backlinks", () => {
	const linkedSnapshot = {
		document: {
			store: {
				"shape:link-a": {
					id: "shape:link-a",
					typeName: "shape",
					type: "board-link",
					parentId: "page:page",
					props: {
						filePath: "Projects/Board B.md",
					},
				},
				"shape:link-b": {
					id: "shape:link-b",
					typeName: "shape",
					type: "board-link",
					parentId: "page:page",
					props: {
						filePath: "Projects/Board B.md",
					},
				},
				"shape:link-c": {
					id: "shape:link-c",
					typeName: "shape",
					type: "board-link",
					parentId: "page:page",
					props: {
						filePath: "Ideas/Board C.md",
					},
				},
				"shape:untargeted-link": {
					id: "shape:untargeted-link",
					typeName: "shape",
					type: "board-link",
					parentId: "page:page",
					props: {
						filePath: "",
					},
				},
			},
			schema: {},
		},
		session: snapshot.session,
	} as unknown as BoardspaceSnapshot;

	const fileContents = serializeBoardspaceFile(linkedSnapshot);

	assert.match(fileContents, /<!-- boardspace-links:start -->/);
	assert.match(fileContents, /\[\[Projects\/Board B\]\]/);
	assert.match(fileContents, /\[\[Ideas\/Board C\]\]/);
	assert.equal(fileContents.match(/\[\[Projects\/Board B\]\]/g)?.length, 1);
	assert.deepEqual(parseBoardspaceFile(fileContents), linkedSnapshot);
});

test("returns no snapshot for empty boardspace files", () => {
	const result = parseBoardspaceFileWithMetadata(serializeBoardspaceFile(undefined));

	assert.equal(result.version, BOARDSPACE_FILE_VERSION);
	assert.equal(result.snapshot, undefined);
});

test("rejects invalid json and arbitrary markdown", () => {
	const invalidJson = `---
type: boardspace
board-version: ${BOARDSPACE_FILE_VERSION}
---

\`\`\`boardspace
{bad json
\`\`\`
`;

	assert.equal(parseBoardspaceFileWithMetadata(invalidJson).snapshot, undefined);
	assert.equal(parseBoardspaceFileWithMetadata("# normal note").version, undefined);
	assert.equal(parseBoardspaceFile("# normal note"), undefined);
});

test("rejects unsupported boardspace versions", () => {
	assert.equal(isSupportedBoardspaceVersion(BOARDSPACE_FILE_VERSION), true);
	assert.equal(isSupportedBoardspaceVersion(BOARDSPACE_FILE_VERSION + 1), false);
	assert.equal(isSupportedBoardspaceVersion(undefined), false);
});

test("detects only current-version boardspace frontmatter", () => {
	assert.equal(
		hasBoardspaceFrontmatter({
			frontmatter: {
				type: "boardspace",
				"board-version": BOARDSPACE_FILE_VERSION,
			},
		}),
		true,
	);
	assert.equal(
		hasBoardspaceFrontmatter({
			frontmatter: {
				type: "boardspace",
				"board-version": BOARDSPACE_FILE_VERSION + 1,
			},
		}),
		false,
	);
	assert.equal(
		hasBoardspaceFrontmatter({
			frontmatter: {
				type: "note",
				"board-version": BOARDSPACE_FILE_VERSION,
			},
		}),
		false,
	);
});

test("counts board links and cards in boardspace snapshots", () => {
	const countedSnapshot = {
		document: {
			store: {
				"shape:note": {
					id: "shape:note",
					typeName: "shape",
					type: "board-note",
					parentId: "page:page",
				},
				"shape:todo": {
					id: "shape:todo",
					typeName: "shape",
					type: "board-todo",
					parentId: "page:page",
				},
				"shape:link": {
					id: "shape:link",
					typeName: "shape",
					type: "board-link",
					parentId: "page:page",
				},
				"shape:image": {
					id: "shape:image",
					typeName: "shape",
					type: "image",
					parentId: "page:page",
				},
				"shape:caption": {
					id: "shape:caption",
					typeName: "shape",
					type: "board-note",
					parentId: "shape:image",
				},
			},
			schema: {},
		},
		session: snapshot.session,
	} as unknown as BoardspaceSnapshot;

	const counts = getBoardLinkCountsFromSnapshot(countedSnapshot);

	assert.deepEqual(counts, {
		boardCount: 1,
		cardCount: 3,
	});
	assert.equal(formatBoardLinkCounts(counts), "1 board, 3 cards");
});
