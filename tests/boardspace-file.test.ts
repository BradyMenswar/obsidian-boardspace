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
