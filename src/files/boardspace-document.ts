export const BOARDSPACE_SCHEMA_VERSION = 2 as const;

const STRUCTURED_BLOCK_PATTERN = /^```boardspace[ \t]*\r?\n([\s\S]*?)^```[ \t]*$/gm;
const FRONTMATTER_PATTERN = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;
const INDEX_PROJECTION = "<!-- boardspace-index:start -->\n<!-- boardspace-index:end -->";
const KNOWN_ITEM_KINDS = new Set([
	"text",
	"todo",
	"table",
	"color-swatch",
	"media",
	"board-link",
	"column",
	"arrow",
	"freehand-stroke",
]);

export interface BoardspaceDocumentV2 {
	schemaVersion: typeof BOARDSPACE_SCHEMA_VERSION;
	items: Record<string, never>;
	textCardOrder: [];
	frontmatterLines: string[];
}

export interface BoardspaceDocumentDiagnostic {
	code:
		| "frontmatter-missing"
		| "frontmatter-malformed"
		| "reserved-frontmatter-invalid"
		| "unsupported-schema-version"
		| "structured-block-missing"
		| "structured-block-duplicate"
		| "structured-json-malformed"
		| "structured-data-invalid"
		| "unknown-item-kind"
		| "canvas-content-not-supported"
		| "body-content-invalid"
		| "index-projection-malformed";
	message: string;
}

export type BoardspaceDocumentParseResult =
	| { status: "editable"; document: BoardspaceDocumentV2 }
	| {
			status: "read-only";
			source: string;
			diagnostics: BoardspaceDocumentDiagnostic[];
	  };

export function createEmptyBoardspaceDocument(
	frontmatterLines: string[] = [],
): BoardspaceDocumentV2 {
	return {
		schemaVersion: BOARDSPACE_SCHEMA_VERSION,
		items: {},
		textCardOrder: [],
		frontmatterLines: [...frontmatterLines],
	};
}

export function parseBoardspaceDocument(
	source: string,
): BoardspaceDocumentParseResult {
	const frontmatterMatch = source.match(FRONTMATTER_PATTERN);
	if (!frontmatterMatch) {
		return source.startsWith("---")
			? readOnly(source, "frontmatter-malformed", "Boardspace frontmatter is malformed.")
			: readOnly(source, "frontmatter-missing", "Boardspace frontmatter is missing.");
	}

	const rawFrontmatter = frontmatterMatch[1];
	if (rawFrontmatter === undefined) {
		return readOnly(source, "frontmatter-malformed", "Boardspace frontmatter is malformed.");
	}

	const frontmatter = parseReservedFrontmatter(rawFrontmatter);
	if (frontmatter.status === "invalid") {
		return readOnly(source, "reserved-frontmatter-invalid", frontmatter.message);
	}
	if (frontmatter.version !== BOARDSPACE_SCHEMA_VERSION) {
		return readOnly(
			source,
			"unsupported-schema-version",
			`Boardspace schema version ${frontmatter.version} is unsupported.`,
		);
	}

	const body = source.slice(frontmatterMatch[0].length);
	const blocks = Array.from(body.matchAll(STRUCTURED_BLOCK_PATTERN));
	if (blocks.length === 0) {
		return readOnly(source, "structured-block-missing", "The Boardspace structured data block is missing.");
	}
	if (blocks.length > 1) {
		return readOnly(source, "structured-block-duplicate", "The Boardspace structured data block appears more than once.");
	}

	const block = blocks[0];
	if (!block) {
		return readOnly(source, "structured-block-missing", "The Boardspace structured data block is missing.");
	}
	const blockStart = block.index ?? 0;
	const beforeBlock = body.slice(0, blockStart).trim();
	const afterBlock = body.slice(blockStart + block[0].length).trim();
	if (beforeBlock !== "") {
		return readOnly(
			source,
			"body-content-invalid",
			"Markdown outside Boardspace-owned regions is not allowed.",
		);
	}
	if (afterBlock !== INDEX_PROJECTION) {
		return readOnly(source, "index-projection-malformed", "The Boardspace index projection is missing or malformed.");
	}

	let structuredData: unknown;
	try {
		structuredData = JSON.parse(block[1] ?? "");
	} catch {
		return readOnly(source, "structured-json-malformed", "The Boardspace structured data is not valid JSON.");
	}

	const validation = validateEmptyStructuredData(structuredData);
	if (validation) {
		return { status: "read-only", source, diagnostics: [validation] };
	}

	return {
		status: "editable",
		document: createEmptyBoardspaceDocument(frontmatter.unrelatedLines),
	};
}

export function serializeBoardspaceDocument(document: BoardspaceDocumentV2): string {
	const unrelatedFrontmatter = document.frontmatterLines.length > 0
		? `\n${document.frontmatterLines.join("\n")}`
		: "";
	const structuredData = JSON.stringify(
		{ items: document.items, textCardOrder: document.textCardOrder },
		null,
		2,
	);

	return `---\ntype: boardspace\nboard-version: ${BOARDSPACE_SCHEMA_VERSION}${unrelatedFrontmatter}\n---\n\n\`\`\`boardspace\n${structuredData}\n\`\`\`\n\n${INDEX_PROJECTION}\n`;
}

function parseReservedFrontmatter(rawFrontmatter: string):
	| { status: "valid"; version: number; unrelatedLines: string[] }
	| { status: "invalid"; message: string } {
	const lines = rawFrontmatter.split(/\r?\n/);
	const typeLines = lines.filter((line) => /^type\s*:/.test(line));
	const versionLines = lines.filter((line) => /^board-version\s*:/.test(line));
	if (typeLines.length !== 1 || versionLines.length !== 1) {
		return { status: "invalid", message: "Reserved Boardspace frontmatter is missing or duplicated." };
	}

	const rawType = typeLines[0]?.replace(/^type\s*:\s*/, "").trim().replace(/^["']|["']$/g, "");
	const rawVersion = versionLines[0]?.replace(/^board-version\s*:\s*/, "").trim().replace(/^["']|["']$/g, "");
	const version = Number(rawVersion);
	if (rawType !== "boardspace" || !Number.isInteger(version)) {
		return { status: "invalid", message: "Reserved Boardspace frontmatter has invalid values." };
	}

	return {
		status: "valid",
		version,
		unrelatedLines: lines.filter(
			(line) => !/^type\s*:/.test(line) && !/^board-version\s*:/.test(line),
		),
	};
}

function validateEmptyStructuredData(
	value: unknown,
): BoardspaceDocumentDiagnostic | undefined {
	if (
		!isRecord(value) ||
		!hasOnlyKeys(value, ["items", "textCardOrder"]) ||
		!isRecord(value.items) ||
		!Array.isArray(value.textCardOrder)
	) {
		return {
			code: "structured-data-invalid",
			message: "The Boardspace structured data does not match schema v2.",
		};
	}

	for (const item of Object.values(value.items)) {
		if (!isRecord(item) || typeof item.kind !== "string") {
			return {
				code: "structured-data-invalid",
				message: "A Boardspace canvas item is malformed.",
			};
		}
		if (!KNOWN_ITEM_KINDS.has(item.kind)) {
			return {
				code: "unknown-item-kind",
				message: `Unknown Boardspace canvas item kind: ${item.kind}.`,
			};
		}
	}

	if (Object.keys(value.items).length > 0 || value.textCardOrder.length > 0) {
		return {
			code: "canvas-content-not-supported",
			message: "This Boardspace build cannot edit populated schema-v2 documents yet.",
		};
	}

	return undefined;
}

function readOnly(
	source: string,
	code: BoardspaceDocumentDiagnostic["code"],
	message: string,
): BoardspaceDocumentParseResult {
	return { status: "read-only", source, diagnostics: [{ code, message }] };
}

function hasOnlyKeys(value: Record<string, unknown>, allowedKeys: string[]) {
	const keys = Object.keys(value);
	return keys.length === allowedKeys.length &&
		keys.every((key) => allowedKeys.includes(key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
