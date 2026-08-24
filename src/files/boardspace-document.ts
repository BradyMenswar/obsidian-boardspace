import { validateTextCardMarkdownNamespaces } from "./boardspace-markdown";

export const BOARDSPACE_SCHEMA_VERSION = 2 as const;

const STRUCTURED_BLOCK_PATTERN = /^```boardspace[ \t]*\r?\n([\s\S]*?)^```[ \t]*$/gm;
const FRONTMATTER_PATTERN = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;
const TEXT_CARD_REGION_PATTERN = /^<!-- boardspace-text-card:start ([A-Za-z0-9_.:]+(?:-[A-Za-z0-9_.:]+)*) -->[ \t]*\r?\n([\s\S]*?)\r?\n<!-- boardspace-text-card:end \1 -->[ \t]*\r?$/gm;
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
const COLORS = new Set([
	"black", "grey", "light-violet", "violet", "blue", "light-blue",
	"yellow", "orange", "green", "light-green", "light-red", "red", "custom",
]);
const TOP_BAR_COLORS = new Set([...COLORS, "transparent"]);
const DASHES = new Set(["draw", "solid", "dashed", "dotted"]);
const FILLS = new Set(["none", "semi", "solid", "pattern", "fill", "lined-fill"]);
const SIZES = new Set(["s", "m", "l", "xl"]);

export interface BoardspaceTextCardStyle {
	color: string;
	customColor: string;
	dash: string;
	fill: string;
	opacity: number;
	size: string;
	topBarColor: string;
	topBarCustomColor: string;
}

interface BoardspaceRootCard {
	id: string;
	placement: {
		type: "root";
		order: number;
		position: { x: number; y: number };
	};
	preferredSize: { width: number; height: number };
	style: BoardspaceTextCardStyle;
}

export interface BoardspaceTextCard extends BoardspaceRootCard {
	kind: "text";
	markdown: string;
}

export interface BoardspaceTodoTask {
	id: string;
	text: string;
	checked: boolean;
}

export interface BoardspaceTodoCard extends BoardspaceRootCard {
	kind: "todo";
	title: string;
	tasks: BoardspaceTodoTask[];
}

export type BoardspaceCanvasItem = BoardspaceTextCard | BoardspaceTodoCard;

export interface BoardspaceDocumentV2 {
	schemaVersion: typeof BOARDSPACE_SCHEMA_VERSION;
	items: Record<string, BoardspaceCanvasItem>;
	textCardOrder: string[];
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
		| "text-card-region-duplicate"
		| "text-card-region-malformed"
		| "text-card-region-missing"
		| "text-card-region-orphan"
		| "task-identity-invalid"
		| "task-identity-duplicate"
		| "markdown-block-identity-duplicate"
		| "markdown-footnote-definition-duplicate"
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
	const regionsResult = parseTextCardRegions(body.slice(0, blockStart));
	if (regionsResult.status === "invalid") {
		return readOnly(source, regionsResult.code, regionsResult.message);
	}
	const afterBlock = body.slice(blockStart + block[0].length).trim();
	if (afterBlock !== INDEX_PROJECTION) {
		return readOnly(source, "index-projection-malformed", "The Boardspace index projection is missing or malformed.");
	}

	let structuredData: unknown;
	try {
		structuredData = JSON.parse(block[1] ?? "");
	} catch {
		return readOnly(source, "structured-json-malformed", "The Boardspace structured data is not valid JSON.");
	}

	const validation = validateStructuredData(structuredData, regionsResult.regions);
	if (validation.status === "invalid") {
		return { status: "read-only", source, diagnostics: [validation.diagnostic] };
	}
	const markdownNamespaceDiagnostic = validateTextCardMarkdownNamespaces(regionsResult.regions);
	if (markdownNamespaceDiagnostic) {
		return { status: "read-only", source, diagnostics: [markdownNamespaceDiagnostic] };
	}

	return {
		status: "editable",
		document: {
			schemaVersion: BOARDSPACE_SCHEMA_VERSION,
			items: validation.items,
			textCardOrder: validation.textCardOrder,
			frontmatterLines: frontmatter.unrelatedLines,
		},
	};
}

export function serializeBoardspaceDocument(document: BoardspaceDocumentV2): string {
	assertValidTaskIdentities(document.items);
	const unrelatedFrontmatter = document.frontmatterLines.length > 0
		? `\n${document.frontmatterLines.join("\n")}`
		: "";
	const regions = document.textCardOrder
		.map((id) => {
			const item = document.items[id];
			if (!item || item.kind !== "text") {
				throw new Error(`Text-card source order references missing text item: ${id}.`);
			}
			return `<!-- boardspace-text-card:start ${id} -->\n${item.markdown}\n<!-- boardspace-text-card:end ${id} -->`;
		})
		.join("\n\n");
	const structuredItems = Object.fromEntries(
		Object.keys(document.items).sort().map((id) => [
			id,
			toStructuredCard(document.items[id]!),
		]),
	);
	const structuredData = JSON.stringify(
		{ items: structuredItems, textCardOrder: document.textCardOrder },
		null,
		2,
	);
	const bodyPrefix = regions ? `${regions}\n\n` : "";

	return `---\ntype: boardspace\nboard-version: ${BOARDSPACE_SCHEMA_VERSION}${unrelatedFrontmatter}\n---\n\n${bodyPrefix}\`\`\`boardspace\n${structuredData}\n\`\`\`\n\n${INDEX_PROJECTION}\n`;
}

function parseTextCardRegions(source: string):
	| { status: "valid"; regions: Map<string, string> }
	| { status: "invalid"; code: "body-content-invalid" | "text-card-region-duplicate" | "text-card-region-malformed"; message: string } {
	const regions = new Map<string, string>();
	let previousEnd = 0;

	for (const match of source.matchAll(TEXT_CARD_REGION_PATTERN)) {
		const gap = source.slice(previousEnd, match.index ?? 0);
		if (gap.trim() !== "") {
			return invalidRegionGap(gap);
		}
		const id = match[1];
		if (!id) {
			return { status: "invalid", code: "text-card-region-malformed", message: "A Boardspace text-card region identity is missing." };
		}
		if (regions.has(id)) {
			return { status: "invalid", code: "text-card-region-duplicate", message: `Boardspace text-card region ${id} appears more than once.` };
		}
		regions.set(id, match[2] ?? "");
		previousEnd = (match.index ?? 0) + match[0].length;
	}

	const trailingContent = source.slice(previousEnd);
	if (trailingContent.trim() !== "") {
		return invalidRegionGap(trailingContent);
	}
	return { status: "valid", regions };
}

function invalidRegionGap(content: string) {
	return content.includes("boardspace-text-card:")
		? { status: "invalid" as const, code: "text-card-region-malformed" as const, message: "A Boardspace text-card region is malformed." }
		: { status: "invalid" as const, code: "body-content-invalid" as const, message: "Markdown outside Boardspace-owned regions is not allowed." };
}

function validateStructuredData(
	value: unknown,
	regions: Map<string, string>,
):
	| { status: "valid"; items: Record<string, BoardspaceCanvasItem>; textCardOrder: string[] }
	| { status: "invalid"; diagnostic: BoardspaceDocumentDiagnostic } {
	if (
		!isRecord(value) ||
		!hasOnlyKeys(value, ["items", "textCardOrder"]) ||
		!isRecord(value.items) ||
		!Array.isArray(value.textCardOrder) ||
		!value.textCardOrder.every((id) => typeof id === "string")
	) {
		return invalidData("The Boardspace structured data does not match schema v2.");
	}

	const entries = Object.entries(value.items);
	for (const [, item] of entries) {
		if (!isRecord(item) || typeof item.kind !== "string") {
			return invalidData("A Boardspace canvas item is malformed.");
		}
		if (!KNOWN_ITEM_KINDS.has(item.kind)) {
			return invalid("unknown-item-kind", `Unknown Boardspace canvas item kind: ${item.kind}.`);
		}
		if (item.kind !== "text" && item.kind !== "todo") {
			return invalid("canvas-content-not-supported", `Boardspace canvas item kind ${item.kind} is not supported yet.`);
		}
	}

	const items: Record<string, BoardspaceCanvasItem> = {};
	const taskIds = new Set<string>();
	for (const [key, rawItem] of entries) {
		if (isRecord(rawItem) && rawItem.kind === "text") {
			if (!isTextCardData(key, rawItem)) {
				return invalidData(`Boardspace text card ${key} is malformed.`);
			}
			const markdown = regions.get(key);
			if (markdown === undefined) {
				return invalid("text-card-region-missing", `Text card ${key} has no Markdown region.`);
			}
			items[key] = { ...rawItem, markdown };
			continue;
		}
		if (!isTodoCardData(key, rawItem)) {
			return invalidData(`Boardspace to-do card ${key} is malformed.`);
		}
		for (const task of rawItem.tasks) {
			if (task.id.trim().length === 0) {
				return invalid("task-identity-invalid", `To-do card ${key} has a task with an empty identity.`);
			}
			if (taskIds.has(task.id)) {
				return invalid("task-identity-duplicate", `To-do task identity ${task.id} appears more than once in this Boardspace document.`);
			}
			taskIds.add(task.id);
		}
		items[key] = rawItem;
	}

	for (const id of regions.keys()) {
		if (items[id]?.kind !== "text") {
			return invalid("text-card-region-orphan", `Markdown region ${id} has no text-card record.`);
		}
	}

	const textCardOrder = value.textCardOrder;
	const textCardIds = entries
		.filter(([, item]) => isRecord(item) && item.kind === "text")
		.map(([id]) => id);
	if (
		textCardOrder.length !== textCardIds.length ||
		new Set(textCardOrder).size !== textCardOrder.length ||
		textCardOrder.some((id) => items[id]?.kind !== "text")
	) {
		return invalidData("Text-card source order does not match the text-card records.");
	}
	const regionOrder = Array.from(regions.keys());
	if (textCardOrder.some((id, index) => id !== regionOrder[index])) {
		return invalidData("Text-card source order does not match the Markdown region order.");
	}

	return { status: "valid", items, textCardOrder: [...textCardOrder] };
}

function toStructuredCard(item: BoardspaceCanvasItem): Omit<BoardspaceTextCard, "markdown"> | BoardspaceTodoCard {
	if (item.kind === "todo") return item;
	return {
		id: item.id,
		kind: item.kind,
		placement: item.placement,
		preferredSize: item.preferredSize,
		style: item.style,
	};
}

function isTextCardData(key: string, value: unknown): value is Omit<BoardspaceTextCard, "markdown"> {
	return isRecord(value) &&
		hasOnlyKeys(value, ["id", "kind", "placement", "preferredSize", "style"]) &&
		value.id === key && value.kind === "text" && isRootCardData(value);
}

function isTodoCardData(key: string, value: unknown): value is BoardspaceTodoCard {
	if (!isRecord(value) || !hasOnlyKeys(value, ["id", "kind", "title", "tasks", "placement", "preferredSize", "style"])) return false;
	if (value.id !== key || value.kind !== "todo" || typeof value.title !== "string" || !Array.isArray(value.tasks)) return false;
	if (!value.tasks.every((task) => isRecord(task) && hasOnlyKeys(task, ["id", "text", "checked"]) && typeof task.id === "string" && typeof task.text === "string" && typeof task.checked === "boolean")) return false;
	return isRootCardData(value);
}

function isRootCardData(value: Record<string, unknown>) {
	if (!isRecord(value.placement) || !isRecord(value.preferredSize) || !isRecord(value.style)) return false;
	const placement = value.placement;
	const preferredSize = value.preferredSize;
	const style = value.style;
	return hasOnlyKeys(placement, ["type", "order", "position"]) &&
		placement.type === "root" && isNonNegativeInteger(placement.order) &&
		isRecord(placement.position) && hasOnlyKeys(placement.position, ["x", "y"]) &&
		isFiniteNumber(placement.position.x) && isFiniteNumber(placement.position.y) &&
		hasOnlyKeys(preferredSize, ["width", "height"]) && isPositiveNumber(preferredSize.width) && isPositiveNumber(preferredSize.height) &&
		hasOnlyKeys(style, ["color", "customColor", "dash", "fill", "opacity", "size", "topBarColor", "topBarCustomColor"]) &&
		typeof style.color === "string" && COLORS.has(style.color) && typeof style.customColor === "string" &&
		typeof style.dash === "string" && DASHES.has(style.dash) && typeof style.fill === "string" && FILLS.has(style.fill) &&
		isFiniteNumber(style.opacity) && style.opacity >= 0 && style.opacity <= 1 &&
		typeof style.size === "string" && SIZES.has(style.size) && typeof style.topBarColor === "string" && TOP_BAR_COLORS.has(style.topBarColor) &&
		typeof style.topBarCustomColor === "string";
}

function assertValidTaskIdentities(items: Record<string, BoardspaceCanvasItem>) {
	const taskIds = new Set<string>();
	for (const item of Object.values(items)) {
		if (item.kind !== "todo") continue;
		for (const task of item.tasks) {
			if (task.id.trim().length === 0) {
				throw new Error(`To-do card ${item.id} has a task with an empty identity; the complete save was blocked.`);
			}
			if (taskIds.has(task.id)) {
				throw new Error(`Duplicate to-do task identity ${task.id} blocks the complete save.`);
			}
			taskIds.add(task.id);
		}
	}
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
		unrelatedLines: lines.filter((line) => !/^type\s*:/.test(line) && !/^board-version\s*:/.test(line)),
	};
}

function invalidData(message: string) {
	return invalid("structured-data-invalid", message);
}

function invalid(code: BoardspaceDocumentDiagnostic["code"], message: string) {
	return { status: "invalid" as const, diagnostic: { code, message } };
}

function readOnly(source: string, code: BoardspaceDocumentDiagnostic["code"], message: string): BoardspaceDocumentParseResult {
	return { status: "read-only", source, diagnostics: [{ code, message }] };
}

function hasOnlyKeys(value: Record<string, unknown>, allowedKeys: string[]) {
	const keys = Object.keys(value);
	return keys.length === allowedKeys.length && keys.every((key) => allowedKeys.includes(key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

function isPositiveNumber(value: unknown): value is number {
	return isFiniteNumber(value) && value > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
	return typeof value === "number" && Number.isInteger(value) && value >= 0;
}
