import { validateTextCardMarkdownNamespaces } from "./boardspace-markdown";

export const BOARDSPACE_SCHEMA_VERSION = 2 as const;

const STRUCTURED_BLOCK_PATTERN = /^```boardspace[ \t]*\r?\n([\s\S]*?)^```[ \t]*$/gm;
const FRONTMATTER_PATTERN = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;
const TEXT_CARD_REGION_PATTERN = /^<!-- boardspace-text-card:start ([A-Za-z0-9_.:]+(?:-[A-Za-z0-9_.:]+)*) -->[ \t]*\r?\n([\s\S]*?)\r?\n<!-- boardspace-text-card:end \1 -->[ \t]*\r?$/gm;
const INDEX_PROJECTION_START = "<!-- boardspace-index:start -->";
const INDEX_PROJECTION_END = "<!-- boardspace-index:end -->";
const INDEX_PROJECTION_PATTERN = /^<!-- boardspace-index:start -->\r?\n[\s\S]*?<!-- boardspace-index:end -->$/;
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
const SWATCH_LABELS = new Set(["none", "hex", "rgb", "hsl"]);
const BOARD_LINK_ICONS = new Set(["board", "bookmark", "folder", "lightbulb", "layers", "sparkle"]);

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

export interface BoardspaceTableColumn {
	id: string;
	title: string;
}

export interface BoardspaceTableCell {
	columnId: string;
	value: string;
}

export interface BoardspaceTableRow {
	id: string;
	cells: BoardspaceTableCell[];
}

export interface BoardspaceTableCard extends BoardspaceRootCard {
	kind: "table";
	title: string;
	columns: BoardspaceTableColumn[];
	rows: BoardspaceTableRow[];
}

export type BoardspaceColorSwatchLabel = "none" | "hex" | "rgb" | "hsl";

export interface BoardspaceColorSwatchCard {
	id: string;
	kind: "color-swatch";
	color: string;
	label: BoardspaceColorSwatchLabel;
	placement: {
		type: "root";
		order: number;
		position: { x: number; y: number };
	};
	preferredSize: { width: number; height: number };
	style: { opacity: number };
}

export interface BoardspaceMediaMetadata {
	type: "image" | "video";
	name: string;
	mimeType: string | null;
	width: number;
	height: number;
	isAnimated: boolean;
	fileSize?: number;
	pixelRatio?: number;
	altText: string;
}

export interface BoardspaceMediaCard {
	id: string;
	kind: "media";
	attachmentPath: string;
	caption?: string;
	metadata: BoardspaceMediaMetadata;
	placement: {
		type: "root";
		order: number;
		position: { x: number; y: number };
	};
	preferredSize: { width: number; height: number };
	style: { opacity: number };
}

export type BoardspaceBoardLinkIcon = "board" | "bookmark" | "folder" | "lightbulb" | "layers" | "sparkle";

export interface BoardspaceBoardLinkCard extends BoardspaceRootCard {
	kind: "board-link";
	targetPath: string;
	title: string;
	icon: BoardspaceBoardLinkIcon;
}

export type BoardspaceCanvasItem = BoardspaceTextCard | BoardspaceTodoCard | BoardspaceTableCard | BoardspaceColorSwatchCard | BoardspaceMediaCard | BoardspaceBoardLinkCard;

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
		| "table-nested-identity-invalid"
		| "table-nested-identity-duplicate"
		| "table-cell-reference-invalid"
		| "table-dimensions-invalid"
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
	if (!INDEX_PROJECTION_PATTERN.test(afterBlock)) {
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
	assertValidNestedIdentities(document.items);
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
	const indexProjection = serializeIndexProjection(document.items);

	return `---\ntype: boardspace\nboard-version: ${BOARDSPACE_SCHEMA_VERSION}${unrelatedFrontmatter}\n---\n\n${bodyPrefix}\`\`\`boardspace\n${structuredData}\n\`\`\`\n\n${indexProjection}\n`;
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
		if (item.kind !== "text" && item.kind !== "todo" && item.kind !== "table" && item.kind !== "color-swatch" && item.kind !== "media" && item.kind !== "board-link") {
			return invalid("canvas-content-not-supported", `Boardspace canvas item kind ${item.kind} is not supported yet.`);
		}
	}

	const items: Record<string, BoardspaceCanvasItem> = {};
	const taskIds = new Set<string>();
	const tableNestedIds = new Set<string>();
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
		if (isRecord(rawItem) && rawItem.kind === "table") {
			if (!isTableCardData(key, rawItem)) {
				return invalidData(`Boardspace table card ${key} is malformed.`);
			}
			const tableDiagnostic = validateTableCard(rawItem, tableNestedIds);
			if (tableDiagnostic) return { status: "invalid", diagnostic: tableDiagnostic };
			items[key] = rawItem;
			continue;
		}
		if (isRecord(rawItem) && rawItem.kind === "color-swatch") {
			if (!isColorSwatchCardData(key, rawItem)) {
				return invalidData(`Boardspace color swatch ${key} is malformed; use a six-digit hex color, a supported plain-text label setting, and opacity from 0 to 1.`);
			}
			items[key] = rawItem;
			continue;
		}
		if (isRecord(rawItem) && rawItem.kind === "media") {
			if (!isMediaCardData(key, rawItem)) {
				return invalidData(`Boardspace media card ${key} has a malformed attachment reference, caption, metadata, placement, preferred size, or visual style.`);
			}
			items[key] = rawItem;
			continue;
		}
		if (isRecord(rawItem) && rawItem.kind === "board-link") {
			if (!isBoardLinkCardData(key, rawItem)) {
				return invalidData(`Boardspace board link ${key} has a malformed target path, title, icon, placement, preferred size, or visual style.`);
			}
			items[key] = rawItem;
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

function toStructuredCard(item: BoardspaceCanvasItem): Omit<BoardspaceTextCard, "markdown"> | BoardspaceTodoCard | BoardspaceTableCard | BoardspaceColorSwatchCard | BoardspaceMediaCard | BoardspaceBoardLinkCard {
	if (item.kind !== "text") return item;
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

function isTableCardData(key: string, value: unknown): value is BoardspaceTableCard {
	if (!isRecord(value) || !hasOnlyKeys(value, ["id", "kind", "title", "columns", "rows", "placement", "preferredSize", "style"])) return false;
	if (value.id !== key || value.kind !== "table" || typeof value.title !== "string" || !Array.isArray(value.columns) || !Array.isArray(value.rows)) return false;
	if (!value.columns.every((column) => isRecord(column) && hasOnlyKeys(column, ["id", "title"]) && typeof column.id === "string" && typeof column.title === "string")) return false;
	if (!value.rows.every((row) => isRecord(row) && hasOnlyKeys(row, ["id", "cells"]) && typeof row.id === "string" && Array.isArray(row.cells) && row.cells.every((cell) => isRecord(cell) && hasOnlyKeys(cell, ["columnId", "value"]) && typeof cell.columnId === "string" && typeof cell.value === "string"))) return false;
	return isRootCardData(value);
}

function isColorSwatchCardData(key: string, value: unknown): value is BoardspaceColorSwatchCard {
	if (!isRecord(value) || !hasOnlyKeys(value, ["id", "kind", "color", "label", "placement", "preferredSize", "style"])) return false;
	if (value.id !== key || value.kind !== "color-swatch" || !isHexColor(value.color) || typeof value.label !== "string" || !SWATCH_LABELS.has(value.label)) return false;
	if (!isRootPlacementAndPreferredSize(value) || !isRecord(value.style) || !hasOnlyKeys(value.style, ["opacity"])) return false;
	return isFiniteNumber(value.style.opacity) && value.style.opacity >= 0 && value.style.opacity <= 1;
}

function isMediaCardData(key: string, value: unknown): value is BoardspaceMediaCard {
	if (!isRecord(value) || !hasOnlyOptionalKeys(value, ["id", "kind", "attachmentPath", "caption", "metadata", "placement", "preferredSize", "style"], ["caption"])) return false;
	if (value.id !== key || value.kind !== "media" || !isVaultPath(value.attachmentPath) || (value.caption !== undefined && typeof value.caption !== "string")) return false;
	if (!isRootPlacementAndPreferredSize(value) || !isRecord(value.style) || !hasOnlyKeys(value.style, ["opacity"]) || !isOpacity(value.style.opacity)) return false;
	if (!isRecord(value.metadata) || !hasOnlyOptionalKeys(value.metadata, ["type", "name", "mimeType", "width", "height", "isAnimated", "fileSize", "pixelRatio", "altText"], ["fileSize", "pixelRatio"])) return false;
	const metadata = value.metadata;
	return (metadata.type === "image" || metadata.type === "video") &&
		typeof metadata.name === "string" && metadata.name.length > 0 &&
		(metadata.mimeType === null || typeof metadata.mimeType === "string") &&
		isPositiveNumber(metadata.width) && isPositiveNumber(metadata.height) &&
		typeof metadata.isAnimated === "boolean" && typeof metadata.altText === "string" &&
		(metadata.fileSize === undefined || isFiniteNumber(metadata.fileSize) && metadata.fileSize >= 0) &&
		(metadata.pixelRatio === undefined || metadata.type === "image" && isPositiveNumber(metadata.pixelRatio));
}

function serializeIndexProjection(items: Record<string, BoardspaceCanvasItem>) {
	const boardPaths = uniqueSortedPaths(
		Object.values(items)
			.filter((item): item is BoardspaceBoardLinkCard => item.kind === "board-link")
			.map((item) => item.targetPath)
			.filter((path) => path.length > 0),
	);
	const attachmentPaths = uniqueSortedPaths(
		Object.values(items)
			.filter((item): item is BoardspaceMediaCard => item.kind === "media")
			.map((item) => item.attachmentPath),
	);
	const sections = [
		boardPaths.length > 0
			? `## Board links\n${boardPaths.map((path) => `- [[${escapeWikiLinkTarget(path.replace(/\.md$/i, ""))}]]`).join("\n")}`
			: "",
		attachmentPaths.length > 0
			? `## Attachments\n${attachmentPaths.map((path) => `- ![[${escapeWikiLinkTarget(path)}]]`).join("\n")}`
			: "",
	].filter(Boolean);
	const content = sections.length > 0 ? `\n${sections.join("\n\n")}` : "";
	return `${INDEX_PROJECTION_START}${content}\n${INDEX_PROJECTION_END}`;
}

function uniqueSortedPaths(paths: string[]) {
	return Array.from(new Set(paths)).sort();
}

function escapeWikiLinkTarget(path: string) {
	return path.replace(/\\/g, "/").replace(/\|/g, "\\|").replace(/\]/g, "\\]");
}

function isBoardLinkCardData(key: string, value: unknown): value is BoardspaceBoardLinkCard {
	return isRecord(value) &&
		hasOnlyKeys(value, ["id", "kind", "targetPath", "title", "icon", "placement", "preferredSize", "style"]) &&
		value.id === key && value.kind === "board-link" && isOptionalVaultPath(value.targetPath) &&
		typeof value.title === "string" && typeof value.icon === "string" && BOARD_LINK_ICONS.has(value.icon) &&
		isRootCardData(value);
}

function validateTableCard(
	table: BoardspaceTableCard,
	seenNestedIds: Set<string>,
): BoardspaceDocumentDiagnostic | undefined {
	for (const nested of [...table.columns, ...table.rows]) {
		if (nested.id.trim().length === 0) {
			return { code: "table-nested-identity-invalid", message: `Table card ${table.id} has a row or column with an empty identity.` };
		}
		if (seenNestedIds.has(nested.id)) {
			return { code: "table-nested-identity-duplicate", message: `Table row or column identity ${nested.id} appears more than once in this Boardspace document.` };
		}
		seenNestedIds.add(nested.id);
	}

	const columnIds = new Set(table.columns.map((column) => column.id));
	for (const row of table.rows) {
		for (const cell of row.cells) {
			if (!columnIds.has(cell.columnId)) {
				return { code: "table-cell-reference-invalid", message: `Table card ${table.id} row ${row.id} references missing column ${cell.columnId}.` };
			}
		}
		if (row.cells.length !== table.columns.length || new Set(row.cells.map((cell) => cell.columnId)).size !== table.columns.length) {
			return { code: "table-dimensions-invalid", message: `Table card ${table.id} row ${row.id} must have exactly one cell for every column.` };
		}
	}
	return undefined;
}

function isRootCardData(value: Record<string, unknown>) {
	if (!isRootPlacementAndPreferredSize(value) || !isRecord(value.style)) return false;
	const style = value.style;
	return hasOnlyKeys(style, ["color", "customColor", "dash", "fill", "opacity", "size", "topBarColor", "topBarCustomColor"]) &&
		typeof style.color === "string" && COLORS.has(style.color) && typeof style.customColor === "string" &&
		typeof style.dash === "string" && DASHES.has(style.dash) && typeof style.fill === "string" && FILLS.has(style.fill) &&
		isFiniteNumber(style.opacity) && style.opacity >= 0 && style.opacity <= 1 &&
		typeof style.size === "string" && SIZES.has(style.size) && typeof style.topBarColor === "string" && TOP_BAR_COLORS.has(style.topBarColor) &&
		typeof style.topBarCustomColor === "string";
}

function isRootPlacementAndPreferredSize(value: Record<string, unknown>) {
	if (!isRecord(value.placement) || !isRecord(value.preferredSize)) return false;
	const placement = value.placement;
	const preferredSize = value.preferredSize;
	return hasOnlyKeys(placement, ["type", "order", "position"]) &&
		placement.type === "root" && isNonNegativeInteger(placement.order) &&
		isRecord(placement.position) && hasOnlyKeys(placement.position, ["x", "y"]) &&
		isFiniteNumber(placement.position.x) && isFiniteNumber(placement.position.y) &&
		hasOnlyKeys(preferredSize, ["width", "height"]) && isPositiveNumber(preferredSize.width) && isPositiveNumber(preferredSize.height);
}

function assertValidNestedIdentities(items: Record<string, BoardspaceCanvasItem>) {
	const taskIds = new Set<string>();
	const tableNestedIds = new Set<string>();
	for (const item of Object.values(items)) {
		const itemId = item.id;
		if (item.kind === "color-swatch" && !isColorSwatchCardData(itemId, item)) {
			throw new Error(`Color swatch ${itemId} has an invalid color, label, placement, preferred size, or visual style; the complete save was blocked.`);
		}
		if (item.kind === "media" && !isMediaCardData(itemId, item)) {
			throw new Error(`Media card ${itemId} has a malformed attachment reference, caption, metadata, placement, preferred size, or visual style; the complete save was blocked.`);
		}
		if (item.kind === "board-link" && !isBoardLinkCardData(itemId, item)) {
			throw new Error(`Board link ${itemId} has a malformed target path, title, icon, placement, preferred size, or visual style; the complete save was blocked.`);
		}
		if (item.kind === "todo") {
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
		if (item.kind === "table") {
			const diagnostic = validateTableCard(item, tableNestedIds);
			if (diagnostic) throw new Error(`${diagnostic.message} The complete save was blocked.`);
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

function isHexColor(value: unknown): value is string {
	return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

function hasOnlyOptionalKeys(value: Record<string, unknown>, allowedKeys: string[], optionalKeys: string[]) {
	const keys = Object.keys(value);
	return keys.every((key) => allowedKeys.includes(key)) &&
		allowedKeys.every((key) => optionalKeys.includes(key) || keys.includes(key));
}

function isVaultPath(value: unknown): value is string {
	return typeof value === "string" && value.trim() === value && value.length > 0 && !value.startsWith("/") && !value.includes("\\");
}

function isOptionalVaultPath(value: unknown): value is string {
	return value === "" || isVaultPath(value);
}

function isOpacity(value: unknown): value is number {
	return isFiniteNumber(value) && value >= 0 && value <= 1;
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
