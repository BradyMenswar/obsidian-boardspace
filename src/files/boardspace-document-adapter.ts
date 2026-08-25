import type { TLEditorSnapshot } from "tldraw";
import type { BoardspaceDocumentAdapter } from "./boardspace-document-lifecycle";
import { BOARDSPACE_PREFERRED_SIZE_META_KEY } from "./boardspace-editor-meta";
import {
	BoardspaceArrow,
	BoardspaceArrowEndpoint,
	BoardspaceBoardLinkCard,
	BoardspaceBoardLinkIcon,
	BoardspaceCanvasItem,
	BoardspaceCardPlacement,
	BoardspaceColumn,
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

interface BoardspaceEditorPlacement {
	columnId?: string;
	order: number;
	position: { x: number; y: number };
}

export interface BoardspaceEditorColumn {
	id: string;
	title: string;
	collapsed: boolean;
	order: number;
	position: { x: number; y: number };
	width: number;
	style: BoardspaceTextCardStyle;
}

export interface BoardspaceEditorTextCard extends BoardspaceEditorPlacement {
	id: string;
	markdown: string;
	position: { x: number; y: number };
	preferredSize: { width: number; height: number };
	style: BoardspaceTextCardStyle;
}

export interface BoardspaceEditorTodoCard extends BoardspaceEditorPlacement {
	id: string;
	preferredSize: { width: number; height: number };
	style: BoardspaceTextCardStyle;
	title: string;
	tasks: BoardspaceTodoTask[];
}

export interface BoardspaceEditorTableCard extends BoardspaceEditorPlacement {
	id: string;
	preferredSize: { width: number; height: number };
	style: BoardspaceTextCardStyle;
	title: string;
	columns: BoardspaceTableColumn[];
	rows: BoardspaceTableRow[];
}

export interface BoardspaceEditorColorSwatchCard extends BoardspaceEditorPlacement {
	id: string;
	color: string;
	label: BoardspaceColorSwatchLabel;
	preferredSize: { width: number; height: number };
	style: { opacity: number };
}

export interface BoardspaceEditorMediaCard extends BoardspaceEditorPlacement {
	id: string;
	attachmentPath: string;
	caption?: string;
	metadata: BoardspaceMediaMetadata;
	preferredSize: { width: number; height: number };
	style: { opacity: number };
}

export interface BoardspaceEditorBoardLinkCard extends BoardspaceEditorPlacement {
	id: string;
	targetPath: string;
	title: string;
	icon: BoardspaceBoardLinkIcon;
	preferredSize: { width: number; height: number };
	style: BoardspaceTextCardStyle;
}

interface CanonicalEditorState {
	kind: "canonical";
	textCards: BoardspaceEditorTextCard[];
	todoCards: BoardspaceEditorTodoCard[];
	tableCards: BoardspaceEditorTableCard[];
	swatchCards: BoardspaceEditorColorSwatchCard[];
	mediaCards: BoardspaceEditorMediaCard[];
	boardLinkCards: BoardspaceEditorBoardLinkCard[];
	arrows?: BoardspaceArrow[];
	columns?: BoardspaceEditorColumn[];
}

export type BoardspaceEditorState = CanonicalEditorState | { kind: "snapshot"; snapshot: TLEditorSnapshot };

const VAULT_PATH_META_KEY = "boardspaceVaultPath";
const MEDIA_CAPTION_META_KEY = "boardspaceMediaCaption";
export const BOARDSPACE_ARROW_TARGET_META_KEY = "boardspaceArrowTargetItemId";

export function createSnapshotEditorState(snapshot: TLEditorSnapshot): BoardspaceEditorState {
	return { kind: "snapshot", snapshot };
}

export function getArrowVisualTargetId(
	state: Extract<BoardspaceEditorState, { kind: "canonical" }>,
	endpoint: Extract<BoardspaceArrowEndpoint, { type: "item" }>,
) {
	const card = [
		...state.textCards,
		...state.todoCards,
		...state.tableCards,
		...state.swatchCards,
		...state.mediaCards,
		...state.boardLinkCards,
	].find((candidate) => candidate.id === endpoint.itemId);
	if (!card?.columnId) return endpoint.itemId;
	return state.columns?.find((column) => column.id === card.columnId)?.collapsed
		? card.columnId
		: endpoint.itemId;
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
			const boardLinkCards = Object.values(result.document.items)
				.filter((item): item is BoardspaceBoardLinkCard => item.kind === "board-link")
				.map(toEditorBoardLinkCard);
			const columns = Object.values(result.document.items)
				.filter((item): item is BoardspaceColumn => item.kind === "column")
				.map(toEditorColumn);
			const arrows = Object.values(result.document.items)
				.filter((item): item is BoardspaceArrow => item.kind === "arrow")
				.map((arrow) => structuredClone(arrow));
			const isEmpty = textCards.length === 0 && todoCards.length === 0 && tableCards.length === 0 && swatchCards.length === 0 && mediaCards.length === 0 && boardLinkCards.length === 0 && columns.length === 0 && arrows.length === 0;
			return {
				status: "editable",
				sourceStatus: isEmpty ? "empty" : "loaded",
				editorState: isEmpty
					? undefined
					: { kind: "canonical" as const, textCards, todoCards, tableCards, swatchCards, mediaCards, boardLinkCards, ...(columns.length === 0 ? {} : { columns }), ...(arrows.length === 0 ? {} : { arrows }) },
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
					...editorState.boardLinkCards.map(toCanonicalBoardLinkCard),
					...(editorState.columns ?? []).map(toCanonicalColumn),
					...(editorState.arrows ?? []).map((arrow) => structuredClone(arrow)),
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
	cards: BoardspaceCanvasItem[],
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

export function updateBoardLinkTargetPath(
	state: BoardspaceEditorState,
	oldPath: string,
	newPath: string,
): { state: BoardspaceEditorState; changed: boolean } {
	if (state.kind === "canonical") {
		const changed = state.boardLinkCards.some((card) => card.targetPath === oldPath);
		return changed
			? { state: { ...state, boardLinkCards: state.boardLinkCards.map((card) => card.targetPath === oldPath ? { ...card, targetPath: newPath } : card) }, changed: true }
			: { state, changed: false };
	}

	const snapshot = structuredClone(state.snapshot);
	const store = snapshot.document?.store;
	let changed = false;
	if (isRecord(store)) {
		for (const record of Object.values(store)) {
			if (!isRecord(record) || record.typeName !== "shape" || record.type !== "board-link" || !isRecord(record.props) || record.props.filePath !== oldPath) continue;
			record.props.filePath = newPath;
			changed = true;
		}
	}
	return changed ? { state: { kind: "snapshot", snapshot }, changed: true } : { state, changed: false };
}

export function editorStateReferencesBoardLinkTarget(state: BoardspaceEditorState, path: string) {
	if (state.kind === "canonical") return state.boardLinkCards.some((card) => card.targetPath === path);
	const store = state.snapshot.document?.store;
	return isRecord(store) && Object.values(store).some((record) =>
		isRecord(record) && record.typeName === "shape" && record.type === "board-link" && isRecord(record.props) && record.props.filePath === path,
	);
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
		...toEditorPlacement(card.placement),
		preferredSize: { ...card.preferredSize },
		style: { ...card.style },
	};
}

function toEditorTodoCard(card: BoardspaceTodoCard): BoardspaceEditorTodoCard {
	return {
		id: card.id,
		...toEditorPlacement(card.placement),
		preferredSize: { ...card.preferredSize },
		style: { ...card.style },
		title: card.title,
		tasks: card.tasks.map((task) => ({ ...task })),
	};
}

function toEditorTableCard(card: BoardspaceTableCard): BoardspaceEditorTableCard {
	return {
		id: card.id,
		...toEditorPlacement(card.placement),
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
		...toEditorPlacement(card.placement),
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
		...toEditorPlacement(card.placement),
		preferredSize: { ...card.preferredSize },
		style: { ...card.style },
	};
}

function toEditorBoardLinkCard(card: BoardspaceBoardLinkCard): BoardspaceEditorBoardLinkCard {
	return {
		id: card.id,
		targetPath: card.targetPath,
		title: card.title,
		icon: card.icon,
		...toEditorPlacement(card.placement),
		preferredSize: { ...card.preferredSize },
		style: { ...card.style },
	};
}

function toEditorColumn(column: BoardspaceColumn): BoardspaceEditorColumn {
	return {
		id: column.id,
		title: column.title,
		collapsed: column.collapsed,
		order: column.placement.order,
		position: { ...column.placement.position },
		width: column.width,
		style: { ...column.style },
	};
}

function toEditorPlacement(placement: BoardspaceCardPlacement): BoardspaceEditorPlacement {
	return placement.type === "root"
		? { order: placement.order, position: { ...placement.position } }
		: { columnId: placement.columnId, order: placement.order, position: { x: 0, y: 0 } };
}

function toCanonicalPlacement(card: BoardspaceEditorPlacement): BoardspaceCardPlacement {
	return card.columnId
		? { type: "column", columnId: card.columnId, order: card.order }
		: { type: "root", order: card.order, position: { ...card.position } };
}

function toCanonicalTextCard(card: BoardspaceEditorTextCard): BoardspaceTextCard {
	return {
		id: card.id,
		kind: "text",
		markdown: card.markdown,
		placement: toCanonicalPlacement(card),
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
		placement: toCanonicalPlacement(card),
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
		placement: toCanonicalPlacement(card),
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
		placement: toCanonicalPlacement(card),
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
		placement: toCanonicalPlacement(card),
		preferredSize: { ...card.preferredSize },
		style: { ...card.style },
	};
}

function toCanonicalBoardLinkCard(card: BoardspaceEditorBoardLinkCard): BoardspaceBoardLinkCard {
	return {
		id: card.id,
		kind: "board-link",
		targetPath: card.targetPath,
		title: card.title,
		icon: card.icon,
		placement: toCanonicalPlacement(card),
		preferredSize: { ...card.preferredSize },
		style: { ...card.style },
	};
}

function toCanonicalColumn(column: BoardspaceEditorColumn): BoardspaceColumn {
	return {
		id: column.id,
		kind: "column",
		title: column.title,
		collapsed: column.collapsed,
		placement: { type: "root", order: column.order, position: { ...column.position } },
		width: column.width,
		style: { ...column.style },
	};
}

function readCardsFromSnapshot(snapshot: TLEditorSnapshot): BoardspaceCanvasItem[] {
	const store = snapshot.document?.store;
	if (!isRecord(store)) {
		throw new Error("The editor representation is malformed; the complete save was blocked.");
	}

	const shapes = new Map<string, Record<string, unknown>>();
	const assets = new Map<string, Record<string, unknown>>();
	const bindings: Record<string, unknown>[] = [];
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
		if (record.typeName === "binding" && record.type === "arrow") {
			bindings.push(record);
			continue;
		}
		if (record.typeName !== "shape" || !["board-note", "board-todo", "board-table", "board-swatch", "board-link", "board-column", "image", "video", "arrow"].includes(String(record.type))) {
			throw unsupportedRecord(recordId, typeof record.type === "string" ? record.type : String(record.typeName));
		}
		shapes.set(recordId, record);
	}

	for (const binding of bindings) {
		const from = shapes.get(String(binding.fromId));
		if (!from || from.type !== "arrow" || !isValidArrowBinding(binding) || !shapes.has(String(binding.toId))) {
			throw new Error(`Unsupported or malformed arrow binding ${String(binding.id)} blocks the complete save.`);
		}
	}
	if (documentCount !== 1 || pageIds.length !== 1) {
		throw new Error("A Boardspace editor representation must contain one document and one editor page; the complete save was blocked.");
	}
	const pageId = pageIds[0]!;
	const rootShapes = Array.from(shapes.values()).filter((shape) => shape.parentId === pageId);
	const columnIds = new Set(rootShapes.filter((shape) => shape.type === "board-column").map((shape) => shape.id));
	for (const [id, shape] of shapes) {
		if (shape.parentId === pageId) continue;
		const isCaption = shape.type === "board-note" && isRecord(shape.meta) && shape.meta[MEDIA_CAPTION_META_KEY] === true && shapes.has(String(shape.parentId));
		const isColumnCard = typeof shape.parentId === "string" && columnIds.has(shape.parentId) && shape.type !== "board-column" && shape.type !== "arrow";
		const isNestedArrow = shape.type === "arrow" && typeof shape.parentId === "string" && columnIds.has(shape.parentId);
		if (!isCaption && !isColumnCard && !isNestedArrow) throw unsupportedRecord(id, String(shape.type));
	}

	const readCard = (shape: Record<string, unknown>, placement: BoardspaceCardPlacement) => {
		const parentId = placement.type === "root" ? pageId : `shape:${placement.columnId}`;
		if (shape.type === "board-todo") return readTodoCardShape(shape, placement, parentId);
		if (shape.type === "board-table") return readTableCardShape(shape, placement, parentId);
		if (shape.type === "board-swatch") return readColorSwatchShape(shape, placement, parentId);
		if (shape.type === "board-link") return readBoardLinkShape(shape, placement, parentId);
		if (shape.type === "image" || shape.type === "video") return readMediaCardShape(shape, placement, parentId, assets, shapes);
		return readTextCardShape(shape, placement, parentId);
	};
	rootShapes.sort((a, b) => String(a.index).localeCompare(String(b.index)));
	const items: BoardspaceCanvasItem[] = [];
	rootShapes.forEach((shape, order) => {
		if (shape.type === "arrow") {
			items.push(readArrowShape(shape, order, pageId, bindings, shapes));
			return;
		}
		if (shape.type === "board-column") {
			const column = readColumnShape(shape, order, pageId);
			items.push(column);
			Array.from(shapes.values())
				.filter((child) => child.parentId === shape.id && child.type !== "arrow")
				.sort((a, b) => String(a.index).localeCompare(String(b.index)))
				.forEach((child, childOrder) => items.push(readCard(child, { type: "column", columnId: column.id, order: childOrder })));
			return;
		}
		items.push(readCard(shape, { type: "root", order, position: { x: Number(shape.x), y: Number(shape.y) } }));
	});
	const nestedArrows = Array.from(shapes.values())
		.filter((shape) => shape.type === "arrow" && shape.parentId !== pageId)
		.sort((a, b) => String(a.index).localeCompare(String(b.index)));
	nestedArrows.forEach((shape, offset) => items.push(readArrowShape(shape, rootShapes.length + offset, pageId, bindings, shapes)));
	return items;
}

function readArrowShape(
	shape: Record<string, unknown>,
	order: number,
	pageId: string,
	bindings: Record<string, unknown>[],
	shapes: Map<string, Record<string, unknown>>,
): BoardspaceArrow {
	const props = shape.props;
	if (
		typeof shape.id !== "string" || !shape.id.startsWith("shape:") ||
		(shape.parentId !== pageId && shapes.get(String(shape.parentId))?.type !== "board-column") ||
		!isFiniteNumber(shape.x) || !isFiniteNumber(shape.y) || shape.opacity !== 1 ||
		(shape.rotation !== undefined && shape.rotation !== 0) || shape.isLocked === true || !isEmptyMeta(shape.meta) ||
		!isRecord(props) || !hasOnlyKeys(props, ["kind", "labelColor", "color", "fill", "dash", "size", "arrowheadStart", "arrowheadEnd", "font", "start", "end", "bend", "richText", "labelPosition", "scale", "elbowMidPoint"]) ||
		(props.kind !== "arc" && props.kind !== "elbow") || !isFiniteNumber(props.bend) ||
		!isPoint(props.start) || !isPoint(props.end) || typeof props.color !== "string" ||
		typeof props.dash !== "string" || typeof props.size !== "string" ||
		typeof props.arrowheadStart !== "string" || typeof props.arrowheadEnd !== "string"
	) throw new Error("An arrow editor record is malformed; the complete save was blocked.");
	if (props.kind === "elbow") throw new Error(`Arrow ${shape.id.slice(6)} uses unsupported elbow geometry; the complete save was blocked.`);
	if (props.fill !== "none" || props.font !== "draw" || props.labelColor !== props.color || props.scale !== 1 || props.labelPosition !== 0.5) {
		throw new Error(`Arrow ${shape.id.slice(6)} uses unsupported visual or label styles; the complete save was blocked.`);
	}
	const arrowId = shape.id;
	const pagePosition = getShapePagePosition(shape, pageId, shapes);
	const label = readPlainTextLabel(props.richText);
	const arrowBindings = bindings.filter((binding) => binding.fromId === arrowId);
	if (arrowBindings.length > 2) throw new Error(`Arrow ${shape.id.slice(6)} has duplicate endpoint bindings; the complete save was blocked.`);
	const pointFor = (terminal: "start" | "end") => {
		const local = props[terminal] as { x: number; y: number };
		return { x: pagePosition.x + local.x, y: pagePosition.y + local.y };
	};
	const endpointFor = (terminal: "start" | "end"): BoardspaceArrowEndpoint => {
		const point = pointFor(terminal);
		const binding = arrowBindings.find((candidate) => isRecord(candidate.props) && candidate.props.terminal === terminal);
		if (!binding) return { type: "free", point };
		if (!isValidArrowBinding(binding)) throw new Error(`Arrow ${arrowId.slice(6)} has a malformed ${terminal} binding; the complete save was blocked.`);
		const metaTarget = isRecord(binding.meta) ? binding.meta[BOARDSPACE_ARROW_TARGET_META_KEY] : undefined;
		const targetShapeId = typeof metaTarget === "string" ? `shape:${metaTarget}` : binding.toId;
		const target = shapes.get(String(targetShapeId));
		if (!target || target.type === "arrow") return { type: "free", point };
		return { type: "item", itemId: String(targetShapeId).replace(/^shape:/, ""), point };
	};
	return {
		id: shape.id.slice("shape:".length), kind: "arrow",
		placement: { type: "root", order, position: pagePosition },
		geometry: props.bend === 0 ? "straight" : "curved", bend: props.bend,
		start: endpointFor("start"), end: endpointFor("end"),
		arrowheadStart: props.arrowheadStart as BoardspaceArrow["arrowheadStart"],
		arrowheadEnd: props.arrowheadEnd as BoardspaceArrow["arrowheadEnd"],
		dash: props.dash, color: props.color, size: props.size,
		...(label === "" ? {} : { label }),
	};
}

function getShapePagePosition(
	shape: Record<string, unknown>,
	pageId: string,
	shapes: Map<string, Record<string, unknown>>,
) {
	let x = shape.x as number;
	let y = shape.y as number;
	let parentId = shape.parentId;
	const visited = new Set<string>();
	while (typeof parentId === "string" && parentId !== pageId) {
		if (visited.has(parentId)) throw new Error("An arrow has a cyclic parent chain; the complete save was blocked.");
		visited.add(parentId);
		const parent = shapes.get(parentId);
		if (!parent || !isFiniteNumber(parent.x) || !isFiniteNumber(parent.y)) {
			throw new Error("An arrow parent is malformed; the complete save was blocked.");
		}
		x += parent.x;
		y += parent.y;
		parentId = parent.parentId;
	}
	return { x, y };
}

function isValidArrowBinding(binding: Record<string, unknown>) {
	return typeof binding.toId === "string" && isArrowBindingMeta(binding.meta) && isRecord(binding.props) &&
		hasOnlyKeys(binding.props, ["terminal", "normalizedAnchor", "isExact", "isPrecise", "snap"]) &&
		(binding.props.terminal === "start" || binding.props.terminal === "end") && isPoint(binding.props.normalizedAnchor) &&
		typeof binding.props.isExact === "boolean" && typeof binding.props.isPrecise === "boolean" &&
		["center", "edge-point", "edge", "none"].includes(String(binding.props.snap));
}

function isArrowBindingMeta(value: unknown) {
	return value === undefined || isRecord(value) && Object.keys(value).every((key) => key === BOARDSPACE_ARROW_TARGET_META_KEY) &&
		(value[BOARDSPACE_ARROW_TARGET_META_KEY] === undefined || typeof value[BOARDSPACE_ARROW_TARGET_META_KEY] === "string");
}

function readPlainTextLabel(value: unknown) {
	if (!isRecord(value) || !hasOnlyOptionalKeys(value, ["type", "content"], ["content"]) || value.type !== "doc" || (value.content !== undefined && !Array.isArray(value.content))) {
		throw new Error("An arrow label is malformed; the complete save was blocked.");
	}
	return (value.content ?? []).map((paragraph) => {
		if (!isRecord(paragraph) || !hasOnlyOptionalKeys(paragraph, ["type", "content"], ["content"]) || paragraph.type !== "paragraph" || (paragraph.content !== undefined && !Array.isArray(paragraph.content))) {
			throw new Error("Arrow labels must be plain text; the complete save was blocked.");
		}
		return (paragraph.content ?? []).map((node) => {
			if (!isRecord(node) || !hasOnlyKeys(node, ["type", "text"]) || node.type !== "text" || typeof node.text !== "string") {
				throw new Error("Arrow labels must be plain text; the complete save was blocked.");
			}
			return node.text;
		}).join("");
	}).join("\n");
}

function readColumnShape(shape: Record<string, unknown>, order: number, pageId: string): BoardspaceColumn {
	const props = shape.props;
	if (typeof shape.id !== "string" || !shape.id.startsWith("shape:") || shape.parentId !== pageId ||
		!isFiniteNumber(shape.x) || !isFiniteNumber(shape.y) || !isFiniteNumber(shape.opacity) || shape.opacity < 0 || shape.opacity > 1 || !isRecord(props) ||
		!hasOnlyKeys(props, ["color", "customColor", "dash", "h", "fill", "minH", "size", "title", "collapsed", "topBarColor", "topBarCustomColor", "w"]) ||
		typeof props.title !== "string" || typeof props.collapsed !== "boolean" || !isPositiveNumber(props.w) || !isTextStyleMetaAllowed(shape.meta)) {
		throw new Error("A column editor record is malformed; the complete save was blocked.");
	}
	return {
		id: shape.id.slice("shape:".length), kind: "column", title: props.title, collapsed: props.collapsed,
		placement: { type: "root", order, position: { x: shape.x, y: shape.y } }, width: props.w,
		style: readTextCardStyle(props, shape.opacity),
	};
}

function readBoardLinkShape(
	shape: Record<string, unknown>,
	placement: BoardspaceCardPlacement,
	parentId: string,
): BoardspaceBoardLinkCard {
	const props = shape.props;
	if (
		typeof shape.id !== "string" || !shape.id.startsWith("shape:") || shape.parentId !== parentId ||
		!isFiniteNumber(shape.x) || !isFiniteNumber(shape.y) || !isRecord(props) ||
		!hasOnlyKeys(props, ["boardCount", "cardCount", "color", "customColor", "dash", "filePath", "fill", "h", "icon", "size", "title", "topBarColor", "topBarCustomColor", "w"]) ||
		typeof props.filePath !== "string" || typeof props.title !== "string" || !isBoardLinkIcon(props.icon) ||
		!isPositiveNumber(props.w) || !isPositiveNumber(props.h) ||
		!isFiniteNumber(shape.opacity) || shape.opacity < 0 || shape.opacity > 1 ||
		(shape.rotation !== undefined && shape.rotation !== 0) || shape.isLocked === true ||
		!isTextStyleMetaAllowed(shape.meta)
	) {
		throw new Error("A board-link editor record is malformed; the complete save was blocked.");
	}
	return {
		id: shape.id.slice("shape:".length),
		kind: "board-link",
		targetPath: props.filePath,
		title: props.title,
		icon: props.icon,
		placement,
		preferredSize: readPreferredSize(shape, props.w, props.h),
		style: readTextCardStyle(props, shape.opacity),
	};
}

function readMediaCardShape(
	shape: Record<string, unknown>,
	placement: BoardspaceCardPlacement,
	parentId: string,
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
		typeof shape.id !== "string" || !shape.id.startsWith("shape:") || shape.parentId !== parentId ||
		!isFiniteNumber(shape.x) || !isFiniteNumber(shape.y) || !isRecord(props) || !hasOnlyKeys(props, expectedProps) ||
		!isPositiveNumber(props.w) || !isPositiveNumber(props.h) || typeof props.assetId !== "string" || typeof props.altText !== "string" ||
		(mediaType === "image" && (props.crop !== null || props.flipX !== false || props.flipY !== false)) ||
		!isFiniteNumber(shape.opacity) || shape.opacity < 0 || shape.opacity > 1 ||
		(shape.rotation !== undefined && shape.rotation !== 0) || shape.isLocked === true ||
		!isTextStyleMetaAllowed(shape.meta)
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
		placement,
		preferredSize: readPreferredSize(shape, props.w, props.h),
		style: { opacity: shape.opacity },
	};
}

function readTextCardShape(
	shape: Record<string, unknown>,
	placement: BoardspaceCardPlacement,
	parentId: string,
): BoardspaceTextCard {
	const props = shape.props;
	if (
		typeof shape.id !== "string" || !shape.id.startsWith("shape:") ||
		shape.parentId !== parentId ||
		!isFiniteNumber(shape.x) || !isFiniteNumber(shape.y) || !isRecord(props) ||
		!hasOnlyKeys(props, ["color", "customColor", "dash", "fill", "h", "markdown", "minH", "size", "topBarColor", "topBarCustomColor", "w"]) ||
		typeof props.markdown !== "string" || !isPositiveNumber(props.w) || !isPositiveNumber(props.minH) ||
		!isFiniteNumber(shape.opacity) || shape.opacity < 0 || shape.opacity > 1 ||
		(shape.rotation !== undefined && shape.rotation !== 0) || shape.isLocked === true ||
		!isTextStyleMetaAllowed(shape.meta)
	) {
		throw new Error("A text-card editor record is malformed; the complete save was blocked.");
	}
	const style = readTextCardStyle(props, shape.opacity);
	return {
		id: shape.id.slice("shape:".length),
		kind: "text",
		markdown: props.markdown,
		placement,
		preferredSize: readPreferredSize(shape, props.w, props.minH),
		style,
	};
}

function readTodoCardShape(
	shape: Record<string, unknown>,
	placement: BoardspaceCardPlacement,
	parentId: string,
): BoardspaceTodoCard {
	const props = shape.props;
	if (
		typeof shape.id !== "string" || !shape.id.startsWith("shape:") ||
		shape.parentId !== parentId ||
		!isFiniteNumber(shape.x) || !isFiniteNumber(shape.y) || !isRecord(props) ||
		!hasOnlyKeys(props, ["color", "customColor", "dash", "fill", "h", "size", "tasks", "title", "topBarColor", "topBarCustomColor", "w"]) ||
		!isPositiveNumber(props.w) || !isPositiveNumber(props.h) || typeof props.title !== "string" ||
		!Array.isArray(props.tasks) || !props.tasks.every(isTodoTask) ||
		!isFiniteNumber(shape.opacity) || shape.opacity < 0 || shape.opacity > 1 ||
		(shape.rotation !== undefined && shape.rotation !== 0) || shape.isLocked === true ||
		!isTextStyleMetaAllowed(shape.meta)
	) {
		throw new Error("A to-do card editor record is malformed; the complete save was blocked.");
	}
	return {
		id: shape.id.slice("shape:".length),
		kind: "todo",
		title: props.title,
		tasks: props.tasks.map((task) => ({ ...task })),
		placement,
		preferredSize: readPreferredSize(shape, props.w, props.h),
		style: readTextCardStyle(props, shape.opacity),
	};
}

function readTableCardShape(
	shape: Record<string, unknown>,
	placement: BoardspaceCardPlacement,
	parentId: string,
): BoardspaceTableCard {
	const props = shape.props;
	if (
		typeof shape.id !== "string" || !shape.id.startsWith("shape:") ||
		shape.parentId !== parentId ||
		!isFiniteNumber(shape.x) || !isFiniteNumber(shape.y) || !isRecord(props) ||
		!hasOnlyKeys(props, ["color", "columns", "customColor", "dash", "fill", "h", "rows", "size", "title", "topBarColor", "topBarCustomColor", "w"]) ||
		!isPositiveNumber(props.w) || !isPositiveNumber(props.h) || typeof props.title !== "string" ||
		!Array.isArray(props.columns) || !props.columns.every(isTableColumn) ||
		!Array.isArray(props.rows) || !props.rows.every(isTableRow) ||
		!isFiniteNumber(shape.opacity) || shape.opacity < 0 || shape.opacity > 1 ||
		(shape.rotation !== undefined && shape.rotation !== 0) || shape.isLocked === true ||
		!isTextStyleMetaAllowed(shape.meta)
	) {
		throw new Error("A table-card editor record is malformed; the complete save was blocked.");
	}
	return {
		id: shape.id.slice("shape:".length),
		kind: "table",
		title: props.title,
		columns: props.columns.map((column) => ({ ...column })),
		rows: props.rows.map((row) => ({ ...row, cells: row.cells.map((cell) => ({ ...cell })) })),
		placement,
		preferredSize: readPreferredSize(shape, props.w, props.h),
		style: readTextCardStyle(props, shape.opacity),
	};
}

function readColorSwatchShape(
	shape: Record<string, unknown>,
	placement: BoardspaceCardPlacement,
	parentId: string,
): BoardspaceColorSwatchCard {
	const props = shape.props;
	if (
		typeof shape.id !== "string" || !shape.id.startsWith("shape:") ||
		shape.parentId !== parentId ||
		!isFiniteNumber(shape.x) || !isFiniteNumber(shape.y) || !isRecord(props) ||
		!hasOnlyKeys(props, ["colorValue", "h", "labelMode", "w"]) ||
		!isHexColor(props.colorValue) || !isColorSwatchLabel(props.labelMode) ||
		!isPositiveNumber(props.w) || !isPositiveNumber(props.h) ||
		!isFiniteNumber(shape.opacity) || shape.opacity < 0 || shape.opacity > 1 ||
		(shape.rotation !== undefined && shape.rotation !== 0) || shape.isLocked === true ||
		!isTextStyleMetaAllowed(shape.meta)
	) {
		throw new Error("A color swatch editor record has an invalid color, label, placement, preferred size, or visual style; the complete save was blocked.");
	}
	return {
		id: shape.id.slice("shape:".length),
		kind: "color-swatch",
		color: props.colorValue,
		label: props.labelMode,
		placement,
		preferredSize: readPreferredSize(shape, props.w, props.h),
		style: { opacity: shape.opacity },
	};
}

function isTextStyleMetaAllowed(value: unknown) {
	if (value === undefined) return true;
	if (!isRecord(value)) return false;
	const keys = Object.keys(value);
	return keys.length === 0 || keys.length === 1 && isPreferredSize(value[BOARDSPACE_PREFERRED_SIZE_META_KEY]);
}

function readPreferredSize(shape: Record<string, unknown>, width: number, height: number) {
	if (isRecord(shape.meta) && isPreferredSize(shape.meta[BOARDSPACE_PREFERRED_SIZE_META_KEY])) {
		return { ...shape.meta[BOARDSPACE_PREFERRED_SIZE_META_KEY] };
	}
	return { width, height };
}

function isPreferredSize(value: unknown): value is { width: number; height: number } {
	return isRecord(value) && hasOnlyKeys(value, ["width", "height"]) && isPositiveNumber(value.width) && isPositiveNumber(value.height);
}

function isBoardLinkIcon(value: unknown): value is BoardspaceBoardLinkIcon {
	return value === "board" || value === "bookmark" || value === "folder" || value === "lightbulb" || value === "layers" || value === "sparkle";
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

function isEmptyMeta(value: unknown) {
	return value === undefined || isRecord(value) && Object.keys(value).length === 0;
}

function isPoint(value: unknown): value is { x: number; y: number } {
	return isRecord(value) && hasOnlyKeys(value, ["x", "y"]) && isFiniteNumber(value.x) && isFiniteNumber(value.y);
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
