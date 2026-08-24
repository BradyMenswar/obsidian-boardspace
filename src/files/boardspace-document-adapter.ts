import type { TLEditorSnapshot } from "tldraw";
import type { BoardspaceDocumentAdapter } from "./boardspace-document-lifecycle";
import {
	BoardspaceColorSwatchCard,
	BoardspaceColorSwatchLabel,
	BoardspaceDocumentV2,
	BoardspaceMediaCard,
	BoardspaceMediaMetadata,
	BoardspaceTableCard,
	BoardspaceTableColumn,
	BoardspaceTableRow,
	BoardspaceTextCard,
	BoardspaceTextCardStyle,
	BoardspaceTodoCard,
	BoardspaceTodoTask,
	parseBoardspaceDocument,
	serializeBoardspaceDocument,
} from "./boardspace-document";

export interface BoardspaceEditorTextCard {
	id: string;
	markdown: string;
	order: number;
	position: { x: number; y: number };
	preferredSize: { width: number; height: number };
	style: BoardspaceTextCardStyle;
}

export interface BoardspaceEditorTodoCard {
	id: string;
	order: number;
	position: { x: number; y: number };
	preferredSize: { width: number; height: number };
	style: BoardspaceTextCardStyle;
	title: string;
	tasks: BoardspaceTodoTask[];
}

export interface BoardspaceEditorTableCard {
	id: string;
	order: number;
	position: { x: number; y: number };
	preferredSize: { width: number; height: number };
	style: BoardspaceTextCardStyle;
	title: string;
	columns: BoardspaceTableColumn[];
	rows: BoardspaceTableRow[];
}

export interface BoardspaceEditorColorSwatchCard {
	id: string;
	color: string;
	label: BoardspaceColorSwatchLabel;
	order: number;
	position: { x: number; y: number };
	preferredSize: { width: number; height: number };
	style: { opacity: number };
}

export interface BoardspaceEditorMediaCard {
	id: string;
	attachmentPath: string;
	caption?: string;
	metadata: BoardspaceMediaMetadata;
	order: number;
	position: { x: number; y: number };
	preferredSize: { width: number; height: number };
	style: { opacity: number };
}

interface CanonicalEditorState {
	kind: "canonical";
	textCards: BoardspaceEditorTextCard[];
	todoCards: BoardspaceEditorTodoCard[];
	tableCards: BoardspaceEditorTableCard[];
	swatchCards: BoardspaceEditorColorSwatchCard[];
	mediaCards: BoardspaceEditorMediaCard[];
}

export type BoardspaceEditorState = CanonicalEditorState | { kind: "snapshot"; snapshot: TLEditorSnapshot };

const VAULT_PATH_META_KEY = "boardspaceVaultPath";
const MEDIA_CAPTION_META_KEY = "boardspaceMediaCaption";

export function createSnapshotEditorState(snapshot: TLEditorSnapshot): BoardspaceEditorState {
	return { kind: "snapshot", snapshot };
}

export function createSchemaV2BoardspaceDocumentAdapter(): BoardspaceDocumentAdapter<BoardspaceEditorState> {
	let document: BoardspaceDocumentV2 | undefined;
	let untouchedReadOnlySource = "";
	const tableCopyIdentityRemaps = new Map<string, Map<string, string>>();

	return {
		loadSource(source) {
			tableCopyIdentityRemaps.clear();
			const result = parseBoardspaceDocument(source);
			if (result.status === "read-only") {
				document = undefined;
				untouchedReadOnlySource = result.source;
				return {
					status: "read-only",
					sourceStatus: result.diagnostics.some(
						(diagnostic) => diagnostic.code === "unsupported-schema-version",
					)
						? "unsupported"
						: "invalid",
					editorState: undefined,
					diagnostics: result.diagnostics,
				};
			}

			document = result.document;
			untouchedReadOnlySource = "";
			const textCards = result.document.textCardOrder.map((id) =>
				toEditorTextCard(result.document.items[id] as BoardspaceTextCard),
			);
			const todoCards = Object.values(result.document.items)
				.filter((item): item is BoardspaceTodoCard => item.kind === "todo")
				.map(toEditorTodoCard);
			const tableCards = Object.values(result.document.items)
				.filter((item): item is BoardspaceTableCard => item.kind === "table")
				.map(toEditorTableCard);
			const swatchCards = Object.values(result.document.items)
				.filter((item): item is BoardspaceColorSwatchCard => item.kind === "color-swatch")
				.map(toEditorColorSwatchCard);
			const mediaCards = Object.values(result.document.items)
				.filter((item): item is BoardspaceMediaCard => item.kind === "media")
				.map(toEditorMediaCard);
			const isEmpty = textCards.length === 0 && todoCards.length === 0 && tableCards.length === 0 && swatchCards.length === 0 && mediaCards.length === 0;
			return {
				status: "editable",
				sourceStatus: isEmpty ? "empty" : "loaded",
				editorState: isEmpty
					? undefined
					: { kind: "canonical" as const, textCards, todoCards, tableCards, swatchCards, mediaCards },
			};
		},
		serializeEditorState(editorState) {
			if (!document) {
				return untouchedReadOnlySource;
			}
			if (!editorState) {
				return serializeBoardspaceDocument({ ...document, items: {}, textCardOrder: [] });
			}
			let cards = editorState.kind === "canonical"
				? [
					...editorState.textCards.map(toCanonicalTextCard),
					...editorState.todoCards.map(toCanonicalTodoCard),
					...editorState.tableCards.map(toCanonicalTableCard),
					...editorState.swatchCards.map(toCanonicalColorSwatchCard),
					...editorState.mediaCards.map(toCanonicalMediaCard),
				]
				: readCardsFromSnapshot(editorState.snapshot);
			cards = renewDuplicatedTableIdentities(cards, document, tableCopyIdentityRemaps);
			const items = Object.fromEntries(cards.map((card) => [card.id, card]));
			if (Object.keys(items).length !== cards.length) {
				throw new Error("Canvas-item identities must be unique; the complete save was blocked.");
			}
			const retainedSourceOrder = document.textCardOrder.filter((id) => items[id]?.kind === "text");
			const retainedIds = new Set(retainedSourceOrder);
			const newSourceOrder = cards
				.filter((card): card is BoardspaceTextCard => card.kind === "text")
				.map((card) => card.id)
				.filter((id) => !retainedIds.has(id));
			document = {
				...document,
				items,
				textCardOrder: [...retainedSourceOrder, ...newSourceOrder],
			};
			return serializeBoardspaceDocument(document);
		},
	};
}

function renewDuplicatedTableIdentities(
	cards: Array<BoardspaceTextCard | BoardspaceTodoCard | BoardspaceTableCard | BoardspaceColorSwatchCard | BoardspaceMediaCard>,
	loadedDocument: BoardspaceDocumentV2,
	copyRemaps: Map<string, Map<string, string>>,
) {
	const loadedTables = Object.values(loadedDocument.items)
		.filter((item): item is BoardspaceTableCard => item.kind === "table");

	return cards.map((card) => {
		if (card.kind !== "table") return card;
		const loadedCard = loadedDocument.items[card.id];
		const matchesNestedIdentities = (table: BoardspaceTableCard) =>
			table.columns.length === card.columns.length &&
			table.rows.length === card.rows.length &&
			table.columns.every((column, index) => column.id === card.columns[index]?.id) &&
			table.rows.every((row, index) => row.id === card.rows[index]?.id);
		if (loadedCard?.kind === "table" && matchesNestedIdentities(loadedCard)) return card;

		let remap = copyRemaps.get(card.id);
		const copiedFrom = loadedTables.find(matchesNestedIdentities);
		if (!remap && !copiedFrom) return card;
		if (!remap) {
			remap = new Map<string, string>();
			for (const column of card.columns) remap.set(column.id, createNestedIdentity("table-column"));
			for (const row of card.rows) remap.set(row.id, createNestedIdentity("table-row"));
			copyRemaps.set(card.id, remap);
		}
		return {
			...card,
			columns: card.columns.map((column) => ({ ...column, id: remap.get(column.id)! })),
			rows: card.rows.map((row) => ({
				...row,
				id: remap.get(row.id)!,
				cells: row.cells.map((cell) => ({
					...cell,
					columnId: remap.get(cell.columnId) ?? cell.columnId,
				})),
			})),
		};
	});
}

function createNestedIdentity(prefix: string) {
	return `${prefix}:${crypto.randomUUID()}`;
}

export function updateMediaAttachmentPath(
	state: BoardspaceEditorState,
	oldPath: string,
	newPath: string,
): { state: BoardspaceEditorState; changed: boolean } {
	if (state.kind === "canonical") {
		const changed = state.mediaCards.some((card) => card.attachmentPath === oldPath);
		return changed
			? { state: { ...state, mediaCards: state.mediaCards.map((card) => card.attachmentPath === oldPath ? { ...card, attachmentPath: newPath } : card) }, changed: true }
			: { state, changed: false };
	}

	const snapshot = structuredClone(state.snapshot);
	const store = snapshot.document?.store;
	let changed = false;
	if (isRecord(store)) {
		for (const record of Object.values(store)) {
			if (!isRecord(record) || record.typeName !== "asset" || !isRecord(record.meta) || record.meta[VAULT_PATH_META_KEY] !== oldPath) continue;
			record.meta[VAULT_PATH_META_KEY] = newPath;
			changed = true;
		}
	}
	return changed ? { state: { kind: "snapshot", snapshot }, changed: true } : { state, changed: false };
}

export function editorStateReferencesMediaAttachment(state: BoardspaceEditorState, path: string) {
	if (state.kind === "canonical") return state.mediaCards.some((card) => card.attachmentPath === path);
	const store = state.snapshot.document?.store;
	return isRecord(store) && Object.values(store).some((record) =>
		isRecord(record) && record.typeName === "asset" && isRecord(record.meta) && record.meta[VAULT_PATH_META_KEY] === path,
	);
}

function toEditorTextCard(card: BoardspaceTextCard): BoardspaceEditorTextCard {
	return {
		id: card.id,
		markdown: card.markdown,
		order: card.placement.order,
		position: { ...card.placement.position },
		preferredSize: { ...card.preferredSize },
		style: { ...card.style },
	};
}

function toEditorTodoCard(card: BoardspaceTodoCard): BoardspaceEditorTodoCard {
	return {
		id: card.id,
		order: card.placement.order,
		position: { ...card.placement.position },
		preferredSize: { ...card.preferredSize },
		style: { ...card.style },
		title: card.title,
		tasks: card.tasks.map((task) => ({ ...task })),
	};
}

function toEditorTableCard(card: BoardspaceTableCard): BoardspaceEditorTableCard {
	return {
		id: card.id,
		order: card.placement.order,
		position: { ...card.placement.position },
		preferredSize: { ...card.preferredSize },
		style: { ...card.style },
		title: card.title,
		columns: card.columns.map((column) => ({ ...column })),
		rows: card.rows.map((row) => ({
			...row,
			cells: row.cells.map((cell) => ({ ...cell })),
		})),
	};
}

function toEditorColorSwatchCard(card: BoardspaceColorSwatchCard): BoardspaceEditorColorSwatchCard {
	return {
		id: card.id,
		color: card.color,
		label: card.label,
		order: card.placement.order,
		position: { ...card.placement.position },
		preferredSize: { ...card.preferredSize },
		style: { ...card.style },
	};
}

function toEditorMediaCard(card: BoardspaceMediaCard): BoardspaceEditorMediaCard {
	return {
		id: card.id,
		attachmentPath: card.attachmentPath,
		...(card.caption === undefined ? {} : { caption: card.caption }),
		metadata: { ...card.metadata },
		order: card.placement.order,
		position: { ...card.placement.position },
		preferredSize: { ...card.preferredSize },
		style: { ...card.style },
	};
}

function toCanonicalTextCard(card: BoardspaceEditorTextCard): BoardspaceTextCard {
	return {
		id: card.id,
		kind: "text",
		markdown: card.markdown,
		placement: {
			type: "root",
			order: card.order,
			position: { ...card.position },
		},
		preferredSize: { ...card.preferredSize },
		style: { ...card.style },
	};
}

function toCanonicalTodoCard(card: BoardspaceEditorTodoCard): BoardspaceTodoCard {
	return {
		id: card.id,
		kind: "todo",
		title: card.title,
		tasks: card.tasks.map((task) => ({ ...task })),
		placement: {
			type: "root",
			order: card.order,
			position: { ...card.position },
		},
		preferredSize: { ...card.preferredSize },
		style: { ...card.style },
	};
}

function toCanonicalTableCard(card: BoardspaceEditorTableCard): BoardspaceTableCard {
	return {
		id: card.id,
		kind: "table",
		title: card.title,
		columns: card.columns.map((column) => ({ ...column })),
		rows: card.rows.map((row) => ({
			...row,
			cells: row.cells.map((cell) => ({ ...cell })),
		})),
		placement: {
			type: "root",
			order: card.order,
			position: { ...card.position },
		},
		preferredSize: { ...card.preferredSize },
		style: { ...card.style },
	};
}

function toCanonicalColorSwatchCard(card: BoardspaceEditorColorSwatchCard): BoardspaceColorSwatchCard {
	return {
		id: card.id,
		kind: "color-swatch",
		color: card.color,
		label: card.label,
		placement: { type: "root", order: card.order, position: { ...card.position } },
		preferredSize: { ...card.preferredSize },
		style: { ...card.style },
	};
}

function toCanonicalMediaCard(card: BoardspaceEditorMediaCard): BoardspaceMediaCard {
	return {
		id: card.id,
		kind: "media",
		attachmentPath: card.attachmentPath,
		...(card.caption === undefined ? {} : { caption: card.caption }),
		metadata: { ...card.metadata },
		placement: { type: "root", order: card.order, position: { ...card.position } },
		preferredSize: { ...card.preferredSize },
		style: { ...card.style },
	};
}

function readCardsFromSnapshot(snapshot: TLEditorSnapshot): Array<BoardspaceTextCard | BoardspaceTodoCard | BoardspaceTableCard | BoardspaceColorSwatchCard | BoardspaceMediaCard> {
	const store = snapshot.document?.store;
	if (!isRecord(store)) {
		throw new Error("The editor representation is malformed; the complete save was blocked.");
	}

	const shapes = new Map<string, Record<string, unknown>>();
	const assets = new Map<string, Record<string, unknown>>();
	const pageIds: string[] = [];
	let documentCount = 0;
	for (const [recordId, record] of Object.entries(store)) {
		if (!isRecord(record)) throw unsupportedRecord(recordId, "malformed");
		if (record.typeName === "document") {
			documentCount += 1;
			continue;
		}
		if (record.typeName === "page") {
			pageIds.push(recordId);
			continue;
		}
		if (record.typeName === "asset" && (record.type === "image" || record.type === "video")) {
			assets.set(recordId, record);
			continue;
		}
		if (record.typeName !== "shape" || !["board-note", "board-todo", "board-table", "board-swatch", "image", "video"].includes(String(record.type))) {
			throw unsupportedRecord(recordId, typeof record.type === "string" ? record.type : String(record.typeName));
		}
		shapes.set(recordId, record);
	}

	if (documentCount !== 1 || pageIds.length !== 1) {
		throw new Error("A Boardspace editor representation must contain one document and one editor page; the complete save was blocked.");
	}
	const pageId = pageIds[0]!;
	const rootShapes = Array.from(shapes.values()).filter((shape) => shape.parentId === pageId);
	for (const [id, shape] of shapes) {
		if (shape.parentId === pageId) continue;
		if (shape.type !== "board-note" || !isRecord(shape.meta) || shape.meta[MEDIA_CAPTION_META_KEY] !== true || !shapes.has(String(shape.parentId))) {
			throw unsupportedRecord(id, String(shape.type));
		}
	}

	rootShapes.sort((a, b) => String(a.index).localeCompare(String(b.index)));
	return rootShapes.map((shape, order) => {
		if (shape.type === "board-todo") return readTodoCardShape(shape, order, pageId);
		if (shape.type === "board-table") return readTableCardShape(shape, order, pageId);
		if (shape.type === "board-swatch") return readColorSwatchShape(shape, order, pageId);
		if (shape.type === "image" || shape.type === "video") return readMediaCardShape(shape, order, pageId, assets, shapes);
		return readTextCardShape(shape, order, pageId);
	});
}

function readMediaCardShape(
	shape: Record<string, unknown>,
	order: number,
	pageId: string,
	assets: Map<string, Record<string, unknown>>,
	shapes: Map<string, Record<string, unknown>>,
): BoardspaceMediaCard {
	if (shape.type !== "image" && shape.type !== "video") {
		throw new Error("A media-card editor record is malformed; the complete save was blocked.");
	}
	const mediaType = shape.type;
	const props = shape.props;
	const expectedProps = mediaType === "image"
		? ["w", "h", "playing", "url", "assetId", "crop", "flipX", "flipY", "altText"]
		: ["w", "h", "time", "playing", "autoplay", "url", "assetId", "altText"];
	if (
		typeof shape.id !== "string" || !shape.id.startsWith("shape:") || shape.parentId !== pageId ||
		!isFiniteNumber(shape.x) || !isFiniteNumber(shape.y) || !isRecord(props) || !hasOnlyKeys(props, expectedProps) ||
		!isPositiveNumber(props.w) || !isPositiveNumber(props.h) || typeof props.assetId !== "string" || typeof props.altText !== "string" ||
		(mediaType === "image" && (props.crop !== null || props.flipX !== false || props.flipY !== false)) ||
		!isFiniteNumber(shape.opacity) || shape.opacity < 0 || shape.opacity > 1 ||
		(shape.rotation !== undefined && shape.rotation !== 0) || shape.isLocked === true ||
		(isRecord(shape.meta) && Object.keys(shape.meta).length > 0)
	) {
		throw new Error("A media-card editor record is malformed; the complete save was blocked.");
	}

	const asset = assets.get(props.assetId);
	if (!asset || asset.type !== shape.type || !isRecord(asset.props) || !isRecord(asset.meta)) {
		throw new Error("A media card has a missing or malformed attachment asset; the complete save was blocked.");
	}
	const assetProps = asset.props;
	const optionalAssetKeys = asset.type === "image" ? ["fileSize", "pixelRatio"] : ["fileSize"];
	if (
		!hasOnlyOptionalKeys(assetProps, ["w", "h", "name", "isAnimated", "mimeType", "src", ...optionalAssetKeys], optionalAssetKeys) ||
		!isPositiveNumber(assetProps.w) || !isPositiveNumber(assetProps.h) || typeof assetProps.name !== "string" || assetProps.name.length === 0 ||
		typeof assetProps.isAnimated !== "boolean" || (assetProps.mimeType !== null && typeof assetProps.mimeType !== "string") ||
		(assetProps.fileSize !== undefined && (!isFiniteNumber(assetProps.fileSize) || assetProps.fileSize < 0)) ||
		(assetProps.pixelRatio !== undefined && !isPositiveNumber(assetProps.pixelRatio)) ||
		typeof asset.meta[VAULT_PATH_META_KEY] !== "string" || asset.meta[VAULT_PATH_META_KEY].length === 0
	) {
		throw new Error("A media card has malformed attachment metadata; the complete save was blocked.");
	}

	const captions = Array.from(shapes.values()).filter((candidate) => candidate.parentId === shape.id && isRecord(candidate.meta) && candidate.meta[MEDIA_CAPTION_META_KEY] === true);
	if (captions.length > 1) throw new Error("A media card has more than one caption; the complete save was blocked.");
	const captionProps = captions[0]?.props;
	let caption: string | undefined;
	if (captions[0]) {
		if (!isRecord(captionProps) || typeof captionProps.markdown !== "string") {
			throw new Error("A media-card caption is malformed; the complete save was blocked.");
		}
		caption = captionProps.markdown;
	}

	return {
		id: shape.id.slice("shape:".length),
		kind: "media",
		attachmentPath: asset.meta[VAULT_PATH_META_KEY],
		...(caption === undefined ? {} : { caption }),
		metadata: {
			type: mediaType,
			name: assetProps.name,
			mimeType: assetProps.mimeType,
			width: assetProps.w,
			height: assetProps.h,
			isAnimated: assetProps.isAnimated,
			...(assetProps.fileSize === undefined ? {} : { fileSize: assetProps.fileSize }),
			...(assetProps.pixelRatio === undefined ? {} : { pixelRatio: assetProps.pixelRatio }),
			altText: props.altText,
		},
		placement: { type: "root", order, position: { x: shape.x, y: shape.y } },
		preferredSize: { width: props.w, height: props.h },
		style: { opacity: shape.opacity },
	};
}

function readTextCardShape(
	shape: Record<string, unknown>,
	order: number,
	pageId: string,
): BoardspaceTextCard {
	const props = shape.props;
	if (
		typeof shape.id !== "string" || !shape.id.startsWith("shape:") ||
		shape.parentId !== pageId ||
		!isFiniteNumber(shape.x) || !isFiniteNumber(shape.y) || !isRecord(props) ||
		!hasOnlyKeys(props, ["color", "customColor", "dash", "fill", "h", "markdown", "minH", "size", "topBarColor", "topBarCustomColor", "w"]) ||
		typeof props.markdown !== "string" || !isPositiveNumber(props.w) || !isPositiveNumber(props.minH) ||
		!isFiniteNumber(shape.opacity) || shape.opacity < 0 || shape.opacity > 1 ||
		(shape.rotation !== undefined && shape.rotation !== 0) || shape.isLocked === true ||
		(isRecord(shape.meta) && Object.keys(shape.meta).length > 0)
	) {
		throw new Error("A text-card editor record is malformed; the complete save was blocked.");
	}
	const style = readTextCardStyle(props, shape.opacity);
	return {
		id: shape.id.slice("shape:".length),
		kind: "text",
		markdown: props.markdown,
		placement: {
			type: "root",
			order,
			position: { x: shape.x, y: shape.y },
		},
		preferredSize: { width: props.w, height: props.minH },
		style,
	};
}

function readTodoCardShape(
	shape: Record<string, unknown>,
	order: number,
	pageId: string,
): BoardspaceTodoCard {
	const props = shape.props;
	if (
		typeof shape.id !== "string" || !shape.id.startsWith("shape:") ||
		shape.parentId !== pageId ||
		!isFiniteNumber(shape.x) || !isFiniteNumber(shape.y) || !isRecord(props) ||
		!hasOnlyKeys(props, ["color", "customColor", "dash", "fill", "h", "size", "tasks", "title", "topBarColor", "topBarCustomColor", "w"]) ||
		!isPositiveNumber(props.w) || !isPositiveNumber(props.h) || typeof props.title !== "string" ||
		!Array.isArray(props.tasks) || !props.tasks.every(isTodoTask) ||
		!isFiniteNumber(shape.opacity) || shape.opacity < 0 || shape.opacity > 1 ||
		(shape.rotation !== undefined && shape.rotation !== 0) || shape.isLocked === true ||
		(isRecord(shape.meta) && Object.keys(shape.meta).length > 0)
	) {
		throw new Error("A to-do card editor record is malformed; the complete save was blocked.");
	}
	return {
		id: shape.id.slice("shape:".length),
		kind: "todo",
		title: props.title,
		tasks: props.tasks.map((task) => ({ ...task })),
		placement: { type: "root", order, position: { x: shape.x, y: shape.y } },
		preferredSize: { width: props.w, height: props.h },
		style: readTextCardStyle(props, shape.opacity),
	};
}

function readTableCardShape(
	shape: Record<string, unknown>,
	order: number,
	pageId: string,
): BoardspaceTableCard {
	const props = shape.props;
	if (
		typeof shape.id !== "string" || !shape.id.startsWith("shape:") ||
		shape.parentId !== pageId ||
		!isFiniteNumber(shape.x) || !isFiniteNumber(shape.y) || !isRecord(props) ||
		!hasOnlyKeys(props, ["color", "columns", "customColor", "dash", "fill", "h", "rows", "size", "title", "topBarColor", "topBarCustomColor", "w"]) ||
		!isPositiveNumber(props.w) || !isPositiveNumber(props.h) || typeof props.title !== "string" ||
		!Array.isArray(props.columns) || !props.columns.every(isTableColumn) ||
		!Array.isArray(props.rows) || !props.rows.every(isTableRow) ||
		!isFiniteNumber(shape.opacity) || shape.opacity < 0 || shape.opacity > 1 ||
		(shape.rotation !== undefined && shape.rotation !== 0) || shape.isLocked === true ||
		(isRecord(shape.meta) && Object.keys(shape.meta).length > 0)
	) {
		throw new Error("A table-card editor record is malformed; the complete save was blocked.");
	}
	return {
		id: shape.id.slice("shape:".length),
		kind: "table",
		title: props.title,
		columns: props.columns.map((column) => ({ ...column })),
		rows: props.rows.map((row) => ({ ...row, cells: row.cells.map((cell) => ({ ...cell })) })),
		placement: { type: "root", order, position: { x: shape.x, y: shape.y } },
		preferredSize: { width: props.w, height: props.h },
		style: readTextCardStyle(props, shape.opacity),
	};
}

function readColorSwatchShape(
	shape: Record<string, unknown>,
	order: number,
	pageId: string,
): BoardspaceColorSwatchCard {
	const props = shape.props;
	if (
		typeof shape.id !== "string" || !shape.id.startsWith("shape:") ||
		shape.parentId !== pageId ||
		!isFiniteNumber(shape.x) || !isFiniteNumber(shape.y) || !isRecord(props) ||
		!hasOnlyKeys(props, ["colorValue", "h", "labelMode", "w"]) ||
		!isHexColor(props.colorValue) || !isColorSwatchLabel(props.labelMode) ||
		!isPositiveNumber(props.w) || !isPositiveNumber(props.h) ||
		!isFiniteNumber(shape.opacity) || shape.opacity < 0 || shape.opacity > 1 ||
		(shape.rotation !== undefined && shape.rotation !== 0) || shape.isLocked === true ||
		(isRecord(shape.meta) && Object.keys(shape.meta).length > 0)
	) {
		throw new Error("A color swatch editor record has an invalid color, label, placement, preferred size, or visual style; the complete save was blocked.");
	}
	return {
		id: shape.id.slice("shape:".length),
		kind: "color-swatch",
		color: props.colorValue,
		label: props.labelMode,
		placement: { type: "root", order, position: { x: shape.x, y: shape.y } },
		preferredSize: { width: props.w, height: props.h },
		style: { opacity: shape.opacity },
	};
}

function isTodoTask(value: unknown): value is BoardspaceTodoTask {
	return isRecord(value) && hasOnlyKeys(value, ["id", "text", "checked"]) &&
		typeof value.id === "string" && typeof value.text === "string" && typeof value.checked === "boolean";
}

function isTableColumn(value: unknown): value is BoardspaceTableColumn {
	return isRecord(value) && hasOnlyKeys(value, ["id", "title"]) &&
		typeof value.id === "string" && typeof value.title === "string";
}

function isTableRow(value: unknown): value is BoardspaceTableRow {
	return isRecord(value) && hasOnlyKeys(value, ["id", "cells"]) &&
		typeof value.id === "string" && Array.isArray(value.cells) &&
		value.cells.every((cell) => isRecord(cell) && hasOnlyKeys(cell, ["columnId", "value"]) &&
			typeof cell.columnId === "string" && typeof cell.value === "string");
}

function readTextCardStyle(
	props: Record<string, unknown>,
	opacity: number,
): BoardspaceTextCardStyle {
	const keys = ["color", "customColor", "dash", "fill", "size", "topBarColor", "topBarCustomColor"] as const;
	if (keys.some((key) => typeof props[key] !== "string")) {
		throw new Error("A text-card visual style is malformed; the complete save was blocked.");
	}
	return {
		color: props.color as string,
		customColor: props.customColor as string,
		dash: props.dash as string,
		fill: props.fill as string,
		opacity,
		size: props.size as string,
		topBarColor: props.topBarColor as string,
		topBarCustomColor: props.topBarCustomColor as string,
	};
}

function unsupportedRecord(id: string, type: string) {
	return new Error(`Unsupported editor record ${id} (${type}) blocks the complete save.`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowedKeys: string[]) {
	const keys = Object.keys(value);
	return keys.length === allowedKeys.length && keys.every((key) => allowedKeys.includes(key));
}

function hasOnlyOptionalKeys(value: Record<string, unknown>, allowedKeys: string[], optionalKeys: string[]) {
	const keys = Object.keys(value);
	return keys.every((key) => allowedKeys.includes(key)) && allowedKeys.every((key) => optionalKeys.includes(key) || keys.includes(key));
}

function isHexColor(value: unknown): value is string {
	return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

function isColorSwatchLabel(value: unknown): value is BoardspaceColorSwatchLabel {
	return value === "none" || value === "hex" || value === "rgb" || value === "hsl";
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

function isPositiveNumber(value: unknown): value is number {
	return isFiniteNumber(value) && value > 0;
}
