import test from "node:test";
import assert from "node:assert/strict";
import {
	BoardspaceDocumentV2,
	BoardspaceTableCard,
	BoardspaceTextCard,
	BoardspaceTodoCard,
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

function makeTextCard(id: string, markdown: string, order: number): BoardspaceTextCard {
	return {
		id,
		kind: "text",
		markdown,
		placement: { type: "root", order, position: { x: order * 100, y: order * 50 } },
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
	};
}

function textCard(document: BoardspaceDocumentV2, id: string): BoardspaceTextCard {
	const item = document.items[id];
	if (item?.kind !== "text") {
		throw new Error(`Expected text card ${id}.`);
	}
	return item;
}

function makeMultiCardDocument(): BoardspaceDocumentV2 {
	return {
		schemaVersion: 2,
		frontmatterLines: [],
		textCardOrder: ["text-b", "text-a"],
		items: {
			"text-a": makeTextCard("text-a", "Alpha  \n\n- untouched", 0),
			"text-b": makeTextCard("text-b", "## Beta\n\n`raw`", 1),
		},
	};
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

test("round-trips one raw-Markdown text card with canonical placement and style", () => {
	const source = `---
type: boardspace
board-version: 2
---

<!-- boardspace-text-card:start text-1 -->
# Project notes

- [ ] Keep **Markdown** intact
<!-- boardspace-text-card:end text-1 -->

\`\`\`boardspace
{
  "items": {
    "text-1": {
      "id": "text-1",
      "kind": "text",
      "placement": {
        "type": "root",
        "order": 0,
        "position": {
          "x": 120,
          "y": 80
        }
      },
      "preferredSize": {
        "width": 320,
        "height": 96
      },
      "style": {
        "color": "blue",
        "customColor": "#6b7280",
        "dash": "solid",
        "fill": "semi",
        "opacity": 1,
        "size": "m",
        "topBarColor": "transparent",
        "topBarCustomColor": "#6b7280"
      }
    }
  },
  "textCardOrder": [
    "text-1"
  ]
}
\`\`\`

<!-- boardspace-index:start -->
<!-- boardspace-index:end -->
`;

	const parsed = parseBoardspaceDocument(source);

	assert.equal(parsed.status, "editable");
	if (parsed.status !== "editable") return;
	assert.equal(textCard(parsed.document, "text-1").markdown, "# Project notes\n\n- [ ] Keep **Markdown** intact");
	assert.deepEqual(parsed.document.textCardOrder, ["text-1"]);
	assert.equal(serializeBoardspaceDocument(parsed.document), source);
});

test("round-trips multiple text-card regions in stable source order with deterministic structured data", () => {
	const source = serializeBoardspaceDocument(makeMultiCardDocument());

	assert.ok(source.indexOf("start text-b") < source.indexOf("start text-a"));
	assert.ok(source.indexOf('"text-a":') < source.indexOf('"text-b":'));
	const parsed = parseBoardspaceDocument(source);
	assert.equal(parsed.status, "editable");
	if (parsed.status !== "editable") return;
	assert.deepEqual(parsed.document.textCardOrder, ["text-b", "text-a"]);
	assert.equal(textCard(parsed.document, "text-a").markdown, "Alpha  \n\n- untouched");
	assert.equal(serializeBoardspaceDocument(parsed.document), source);
});

test("round-trips to-do plain text, placement, preferred size, style, and task order", () => {
	const todo: BoardspaceTodoCard = {
		id: "todo-1",
		kind: "todo",
		title: "Sprint **tasks**",
		tasks: [
			{ id: "task-a", text: "First [[plain text]]", checked: false },
			{ id: "task-b", text: "Second", checked: true },
		],
		placement: { type: "root", order: 0, position: { x: -20, y: 45 } },
		preferredSize: { width: 340, height: 132 },
		style: {
			color: "orange",
			customColor: "#f97316",
			dash: "dotted",
			fill: "pattern",
			opacity: 0.75,
			size: "s",
			topBarColor: "yellow",
			topBarCustomColor: "#eab308",
		},
	};
	const document: BoardspaceDocumentV2 = {
		schemaVersion: 2,
		frontmatterLines: [],
		items: { "todo-1": todo },
		textCardOrder: [],
	};
	const source = serializeBoardspaceDocument(document);
	const parsed = parseBoardspaceDocument(source);

	assert.equal(parsed.status, "editable");
	if (parsed.status !== "editable") return;
	assert.deepEqual(parsed.document.items["todo-1"], todo);
	assert.equal(serializeBoardspaceDocument(parsed.document), source);
});

test("round-trips table plain text, stable row and column order, placement, preferred size, and style", () => {
	const table: BoardspaceTableCard = {
		id: "table-1",
		kind: "table",
		title: "Release **matrix**",
		columns: [
			{ id: "column-a", title: "Owner [[plain text]]" },
			{ id: "column-b", title: "Status" },
		],
		rows: [
			{
				id: "row-b",
				cells: [
					{ columnId: "column-a", value: "Ada" },
					{ columnId: "column-b", value: "Ready" },
				],
			},
			{
				id: "row-a",
				cells: [
					{ columnId: "column-a", value: "Grace" },
					{ columnId: "column-b", value: "Blocked" },
				],
			},
		],
		placement: { type: "root", order: 3, position: { x: 140, y: -30 } },
		preferredSize: { width: 520, height: 240 },
		style: {
			color: "violet",
			customColor: "#8b5cf6",
			dash: "solid",
			fill: "semi",
			opacity: 0.9,
			size: "m",
			topBarColor: "light-violet",
			topBarCustomColor: "#a78bfa",
		},
	};
	const source = serializeBoardspaceDocument({
		schemaVersion: 2,
		frontmatterLines: [],
		items: { "table-1": table },
		textCardOrder: [],
	});
	const parsed = parseBoardspaceDocument(source);

	assert.equal(parsed.status, "editable");
	if (parsed.status !== "editable") return;
	assert.deepEqual(parsed.document.items["table-1"], table);
	assert.equal(serializeBoardspaceDocument(parsed.document), source);
});

test("rejects invalid table dimensions, references, and document-scoped nested identities", () => {
	const table: BoardspaceTableCard = {
		id: "table-1",
		kind: "table",
		title: "Matrix",
		columns: [{ id: "column-a", title: "Owner" }],
		rows: [{ id: "row-a", cells: [{ columnId: "column-a", value: "Ada" }] }],
		placement: { type: "root", order: 0, position: { x: 0, y: 0 } },
		preferredSize: { width: 320, height: 160 },
		style: makeTextCard("style", "", 0).style,
	};
	const source = serializeBoardspaceDocument({
		schemaVersion: 2,
		frontmatterLines: [],
		items: { "table-1": table },
		textCardOrder: [],
	});
	const cases = [
		{
			source: source.replace('"columnId": "column-a"', '"columnId": "missing"'),
			diagnostic: { code: "table-cell-reference-invalid", message: "Table card table-1 row row-a references missing column missing." },
		},
		{
			source: source.replace(
				'"columns": [',
				'"columns": [{ "id": "column-b", "title": "Status" },',
			),
			diagnostic: { code: "table-dimensions-invalid", message: "Table card table-1 row row-a must have exactly one cell for every column." },
		},
		{
			source: source.replace('"id": "row-a"', '"id": "column-a"'),
			diagnostic: { code: "table-nested-identity-duplicate", message: "Table row or column identity column-a appears more than once in this Boardspace document." },
		},
	];

	for (const invalid of cases) {
		const parsed = parseBoardspaceDocument(invalid.source);
		assert.equal(parsed.status, "read-only");
		if (parsed.status !== "read-only") continue;
		assert.deepEqual(parsed.diagnostics, [invalid.diagnostic]);
	}
});

test("rejects duplicate and empty task identities with actionable diagnostics", () => {
	const todo: BoardspaceTodoCard = {
		id: "todo-1",
		kind: "todo",
		title: "",
		tasks: [
			{ id: "task-a", text: "First", checked: false },
			{ id: "task-b", text: "Second", checked: false },
		],
		placement: { type: "root", order: 0, position: { x: 0, y: 0 } },
		preferredSize: { width: 320, height: 96 },
		style: makeTextCard("style", "", 0).style,
	};
	const source = serializeBoardspaceDocument({
		schemaVersion: 2,
		frontmatterLines: [],
		items: { "todo-1": todo },
		textCardOrder: [],
	});
	const duplicate = parseBoardspaceDocument(source.replace('"id": "task-b"', '"id": "task-a"'));
	assert.equal(duplicate.status, "read-only");
	if (duplicate.status === "read-only") {
		assert.deepEqual(duplicate.diagnostics, [{
			code: "task-identity-duplicate",
			message: "To-do task identity task-a appears more than once in this Boardspace document.",
		}]);
	}
	const empty = parseBoardspaceDocument(source.replace('"id": "task-b"', '"id": ""'));
	assert.equal(empty.status, "read-only");
	if (empty.status === "read-only") {
		assert.deepEqual(empty.diagnostics, [{
			code: "task-identity-invalid",
			message: "To-do card todo-1 has a task with an empty identity.",
		}]);
	}
});

test("returns exact read-only diagnostics for damaged multi-card region structure without repairing source", () => {
	const source = serializeBoardspaceDocument(makeMultiCardDocument());
	const textBRegion = "<!-- boardspace-text-card:start text-b -->\n## Beta\n\n`raw`\n<!-- boardspace-text-card:end text-b -->";
	const textARegion = "<!-- boardspace-text-card:start text-a -->\nAlpha  \n\n- untouched\n<!-- boardspace-text-card:end text-a -->";
	const cases = [
		{
			source: source.replace(`${textBRegion}\n\n`, ""),
			diagnostic: { code: "text-card-region-missing", message: "Text card text-b has no Markdown region." },
		},
		{
			source: source.replace(`${textBRegion}\n\n`, `${textBRegion}\n\n${textBRegion}\n\n`),
			diagnostic: { code: "text-card-region-duplicate", message: "Boardspace text-card region text-b appears more than once." },
		},
		{
			source: source.replace("end text-b", "end text-a"),
			diagnostic: { code: "text-card-region-malformed", message: "A Boardspace text-card region is malformed." },
		},
		{
			source: source.replace(`${textBRegion}\n\n`, `${textBRegion}\n\n<!-- boardspace-text-card:start orphan -->\nOrphan\n<!-- boardspace-text-card:end orphan -->\n\n`),
			diagnostic: { code: "text-card-region-orphan", message: "Markdown region orphan has no text-card record." },
		},
		{
			source: source.replace(`${textBRegion}\n\n`, `${textBRegion}\n\nOutside Markdown\n\n`),
			diagnostic: { code: "body-content-invalid", message: "Markdown outside Boardspace-owned regions is not allowed." },
		},
		{
			source: source.replace(`${textBRegion}\n\n${textARegion}`, `${textARegion}\n\n${textBRegion}`),
			diagnostic: { code: "structured-data-invalid", message: "Text-card source order does not match the Markdown region order." },
		},
	];

	for (const damaged of cases) {
		const parsed = parseBoardspaceDocument(damaged.source);
		assert.equal(parsed.status, "read-only");
		if (parsed.status !== "read-only") continue;
		assert.equal(parsed.source, damaged.source);
		assert.deepEqual(parsed.diagnostics, [damaged.diagnostic]);
	}
});

test("rejects duplicate document-level Markdown identities with exact diagnostics", () => {
	const cases = [
		{
			first: "First paragraph ^shared-block",
			second: "Second paragraph ^shared-block",
			diagnostic: {
				code: "markdown-block-identity-duplicate",
				message: "Obsidian block identity ^shared-block appears more than once across Boardspace text cards.",
			},
		},
		{
			first: "First note[^shared]\n\n[^shared]: First definition",
			second: "Second note[^shared]\n\n[^shared]: Second definition",
			diagnostic: {
				code: "markdown-footnote-definition-duplicate",
				message: "Footnote definition [^shared] appears more than once across Boardspace text cards.",
			},
		},
	];

	for (const duplicate of cases) {
		const document = makeMultiCardDocument();
		textCard(document, "text-a").markdown = duplicate.first;
		textCard(document, "text-b").markdown = duplicate.second;
		const source = serializeBoardspaceDocument(document);
		const parsed = parseBoardspaceDocument(source);

		assert.equal(parsed.status, "read-only");
		if (parsed.status !== "read-only") continue;
		assert.equal(parsed.source, source);
		assert.deepEqual(parsed.diagnostics, [duplicate.diagnostic]);
	}
});

test("does not treat identifiers shown in text-card code blocks as Markdown definitions", () => {
	const document = makeMultiCardDocument();
	textCard(document, "text-a").markdown = "```markdown\nParagraph ^example\n[^example]: Footnote\n```";
	textCard(document, "text-b").markdown = "Paragraph ^example\n\n[^example]: Footnote";
	const source = serializeBoardspaceDocument(document);

	const parsed = parseBoardspaceDocument(source);

	assert.equal(parsed.status, "editable");
	if (parsed.status !== "editable") return;
	assert.equal(serializeBoardspaceDocument(parsed.document), source);
});

test("keeps Markdown references and definitions scoped to their text card without rewriting", () => {
	const document = makeMultiCardDocument();
	const localMarkdown = "Read [the local note][details] and note[^1].\n\n[details]: https://example.com/local\n[^1]: Local footnote";
	const crossCardReference = "This [reference][remote] and footnote[^remote] have no local definitions.";
	const otherCardDefinitions = "[remote]: https://example.com/remote\n[^remote]: Another card's footnote";
	textCard(document, "text-a").markdown = `${localMarkdown}\n\n${crossCardReference}`;
	textCard(document, "text-b").markdown = otherCardDefinitions;
	const source = serializeBoardspaceDocument(document);

	const parsed = parseBoardspaceDocument(source);

	assert.equal(parsed.status, "editable");
	if (parsed.status !== "editable") return;
	assert.equal(textCard(parsed.document, "text-a").markdown, `${localMarkdown}\n\n${crossCardReference}`);
	assert.equal(textCard(parsed.document, "text-b").markdown, otherCardDefinitions);
	assert.equal(serializeBoardspaceDocument(parsed.document), source);
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
