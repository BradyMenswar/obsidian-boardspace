import type { TLEditorSnapshot } from "tldraw";
import type { BoardspaceDocumentAdapter } from "./boardspace-document-lifecycle";
import {
	BoardspaceDocumentV2,
	BoardspaceTextCard,
	BoardspaceTextCardStyle,
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

export type BoardspaceEditorState =
	| { kind: "canonical"; textCards: BoardspaceEditorTextCard[] }
	| { kind: "snapshot"; snapshot: TLEditorSnapshot };

export function createSnapshotEditorState(snapshot: TLEditorSnapshot): BoardspaceEditorState {
	return { kind: "snapshot", snapshot };
}

export function createSchemaV2BoardspaceDocumentAdapter(): BoardspaceDocumentAdapter<BoardspaceEditorState> {
	let document: BoardspaceDocumentV2 | undefined;
	let untouchedReadOnlySource = "";

	return {
		loadSource(source) {
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
				toEditorTextCard(result.document.items[id]!),
			);
			return {
				status: "editable",
				sourceStatus: textCards.length === 0 ? "empty" : "loaded",
				editorState: textCards.length > 0
					? { kind: "canonical" as const, textCards }
					: undefined,
			};
		},
		serializeEditorState(editorState) {
			if (!document) {
				return untouchedReadOnlySource;
			}
			if (!editorState) {
				return serializeBoardspaceDocument({ ...document, items: {}, textCardOrder: [] });
			}
			const textCards = editorState.kind === "canonical"
				? editorState.textCards.map(toCanonicalTextCard)
				: readTextCardsFromSnapshot(editorState.snapshot);
			const items = Object.fromEntries(textCards.map((card) => [card.id, card]));
			if (Object.keys(items).length !== textCards.length) {
				throw new Error("Text-card identities must be unique; the complete save was blocked.");
			}
			const retainedSourceOrder = document.textCardOrder.filter((id) => items[id]);
			const retainedIds = new Set(retainedSourceOrder);
			const newSourceOrder = textCards
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

function readTextCardsFromSnapshot(snapshot: TLEditorSnapshot): BoardspaceTextCard[] {
	const store = snapshot.document?.store;
	if (!isRecord(store)) {
		throw new Error("The editor representation is malformed; the complete save was blocked.");
	}

	const shapes: Record<string, unknown>[] = [];
	const pageIds: string[] = [];
	let documentCount = 0;
	for (const [recordId, record] of Object.entries(store)) {
		if (!isRecord(record)) {
			throw unsupportedRecord(recordId, "malformed");
		}
		if (record.typeName === "document") {
			documentCount += 1;
			continue;
		}
		if (record.typeName === "page") {
			pageIds.push(recordId);
			continue;
		}
		if (record.typeName !== "shape" || record.type !== "board-note") {
			throw unsupportedRecord(recordId, typeof record.type === "string" ? record.type : String(record.typeName));
		}
		shapes.push(record);
	}

	if (documentCount !== 1 || pageIds.length !== 1) {
		throw new Error("A Boardspace editor representation must contain one document and one editor page; the complete save was blocked.");
	}
	shapes.sort((a, b) => String(a.index).localeCompare(String(b.index)));
	return shapes.map((shape, order) => readTextCardShape(shape, order, pageIds[0]!));
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

function isFiniteNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

function isPositiveNumber(value: unknown): value is number {
	return isFiniteNumber(value) && value > 0;
}
