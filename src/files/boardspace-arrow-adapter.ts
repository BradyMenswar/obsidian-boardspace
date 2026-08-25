import type { BoardspaceArrow, BoardspaceArrowEndpoint } from "./boardspace-document";
import { isBoardspaceEditorMeta } from "./boardspace-editor-meta";

export const BOARDSPACE_ARROW_TARGET_META_KEY = "boardspaceArrowTargetItemId";

export function readArrowShape(
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
		(shape.rotation !== undefined && shape.rotation !== 0) || shape.isLocked === true || !isBoardspaceEditorMeta(shape.meta) ||
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

export function isValidArrowBinding(binding: Record<string, unknown>) {
	return typeof binding.toId === "string" && isArrowBindingMeta(binding.meta) && isRecord(binding.props) &&
		hasOnlyKeys(binding.props, ["terminal", "normalizedAnchor", "isExact", "isPrecise", "snap"]) &&
		(binding.props.terminal === "start" || binding.props.terminal === "end") && isPoint(binding.props.normalizedAnchor) &&
		typeof binding.props.isExact === "boolean" && typeof binding.props.isPrecise === "boolean" &&
		["center", "edge-point", "edge", "none"].includes(String(binding.props.snap));
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

function isArrowBindingMeta(value: unknown) {
	return value === undefined || isRecord(value) && Object.keys(value).every((key) => key === BOARDSPACE_ARROW_TARGET_META_KEY) &&
		(value[BOARDSPACE_ARROW_TARGET_META_KEY] === undefined || typeof value[BOARDSPACE_ARROW_TARGET_META_KEY] === "string");
}

function isPoint(value: unknown): value is { x: number; y: number } {
	return isRecord(value) && hasOnlyKeys(value, ["x", "y"]) && isFiniteNumber(value.x) && isFiniteNumber(value.y);
}

function hasOnlyKeys(value: Record<string, unknown>, allowedKeys: string[]) {
	const keys = Object.keys(value);
	return keys.length === allowedKeys.length && keys.every((key) => allowedKeys.includes(key));
}

function hasOnlyOptionalKeys(value: Record<string, unknown>, allowedKeys: string[], optionalKeys: string[]) {
	const keys = Object.keys(value);
	return keys.every((key) => allowedKeys.includes(key)) && allowedKeys.every((key) => optionalKeys.includes(key) || keys.includes(key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}
