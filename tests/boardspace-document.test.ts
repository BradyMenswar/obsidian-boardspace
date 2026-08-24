import test from "node:test";
import assert from "node:assert/strict";
import {
	parseBoardspaceDocument,
	serializeBoardspaceDocument,
} from "../src/files/boardspace-document";

const EMPTY_DOCUMENT = `---
type: boardspace
board-version: 2
---

\`\`\`boardspace
{
  "items": {},
  "textCardOrder": []
}
\`\`\`

<!-- boardspace-index:start -->
<!-- boardspace-index:end -->
`;

function diagnosticCodes(source: string) {
	const result = parseBoardspaceDocument(source);
	assert.equal(result.status, "read-only");
	return result.status === "read-only"
		? result.diagnostics.map((diagnostic) => diagnostic.code)
		: [];
}

test("round-trips an empty schema-v2 Boardspace document deterministically", () => {
	const parsed = parseBoardspaceDocument(EMPTY_DOCUMENT);

	assert.equal(parsed.status, "editable");
	if (parsed.status !== "editable") return;
	assert.deepEqual(parsed.document.items, {});
	assert.deepEqual(parsed.document.textCardOrder, []);
	const serialized = serializeBoardspaceDocument(parsed.document);
	assert.equal(serialized, EMPTY_DOCUMENT);

	const reparsed = parseBoardspaceDocument(serialized);
	assert.equal(reparsed.status, "editable");
	if (reparsed.status !== "editable") return;
	assert.equal(serializeBoardspaceDocument(reparsed.document), EMPTY_DOCUMENT);
});

test("preserves unrelated frontmatter properties and values", () => {
	const source = EMPTY_DOCUMENT.replace(
		"board-version: 2\n",
		"board-version: 2\naliases:\n  - Project board\ncssclasses: [wide, planning]\n",
	);
	const parsed = parseBoardspaceDocument(source);

	assert.equal(parsed.status, "editable");
	if (parsed.status !== "editable") return;
	assert.equal(serializeBoardspaceDocument(parsed.document), source);
});

test("diagnoses unsupported schema versions without changing their source", () => {
	for (const version of [1, 3]) {
		const source = EMPTY_DOCUMENT.replace("board-version: 2", `board-version: ${version}`);
		const parsed = parseBoardspaceDocument(source);

		assert.equal(parsed.status, "read-only");
		if (parsed.status !== "read-only") continue;
		assert.equal(parsed.source, source);
		assert.deepEqual(parsed.diagnostics, [
			{
				code: "unsupported-schema-version",
				message: `Boardspace schema version ${version} is unsupported.`,
			},
		]);
	}
});

test("returns distinct diagnostics for damaged empty-document structure", () => {
	assert.deepEqual(diagnosticCodes("# ordinary Markdown\n"), [
		"frontmatter-missing",
	]);
	assert.deepEqual(
		diagnosticCodes("---\ntype: boardspace\nboard-version: 2\n"),
		["frontmatter-malformed"],
	);
	assert.deepEqual(
		diagnosticCodes(EMPTY_DOCUMENT.replace("```boardspace", "```json")),
		["structured-block-missing"],
	);
	assert.deepEqual(
		diagnosticCodes(EMPTY_DOCUMENT.replace("```boardspace", "Unexpected Markdown\n\n```boardspace")),
		["body-content-invalid"],
	);
	assert.deepEqual(
		diagnosticCodes(EMPTY_DOCUMENT.replace('  "items": {},', '  "items": {bad},')),
		["structured-json-malformed"],
	);
	assert.deepEqual(
		diagnosticCodes(EMPTY_DOCUMENT.replace('  "textCardOrder": []', '  "textCardOrder": [],\n  "viewport": { "x": 10, "y": 20 }')),
		["structured-data-invalid"],
	);
	assert.deepEqual(
		diagnosticCodes(EMPTY_DOCUMENT.replace("<!-- boardspace-index:start -->\n", "")),
		["index-projection-malformed"],
	);
});

test("diagnoses unknown canvas item kinds", () => {
	const source = EMPTY_DOCUMENT.replace(
		'  "items": {},',
		'  "items": {\n    "item-1": { "id": "item-1", "kind": "portal" }\n  },',
	);

	assert.deepEqual(diagnosticCodes(source), ["unknown-item-kind"]);
});
