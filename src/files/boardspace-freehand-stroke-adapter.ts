import { b64Vecs } from "@tldraw/tlschema";
import type { BoardspaceFreehandStroke } from "./boardspace-document";

export function readFreehandStrokeShape(
	shape: Record<string, unknown>,
	order: number,
	pageId: string,
): BoardspaceFreehandStroke {
	const id = typeof shape.id === "string" && shape.id.startsWith("shape:")
		? shape.id.slice("shape:".length)
		: "unknown";
	const props = shape.props;
	if (
		typeof shape.id !== "string" || !shape.id.startsWith("shape:") || shape.parentId !== pageId ||
		!isFiniteNumber(shape.x) || !isFiniteNumber(shape.y) || !isOpacity(shape.opacity) ||
		(shape.rotation !== undefined && shape.rotation !== 0) || shape.isLocked === true || !isEmptyMeta(shape.meta) ||
		!isRecord(props) || !hasOnlyKeys(props, ["color", "fill", "dash", "size", "segments", "isComplete", "isClosed", "isPen", "scale", "scaleX", "scaleY"])
	) {
		throw new Error(`Freehand stroke ${id} is malformed; the complete save was blocked.`);
	}
	if (props.isComplete !== true) {
		throw new Error(`Freehand stroke ${id} is incomplete; the complete save was blocked.`);
	}
	if (props.scale !== 1) {
		throw new Error(`Freehand stroke ${id} uses an unsupported stroke scale; the complete save was blocked.`);
	}
	const scaleX = props.scaleX;
	const scaleY = props.scaleY;
	if (!isFiniteNonZero(scaleX) || !isFiniteNonZero(scaleY)) {
		throw new Error(`Freehand stroke ${id} has malformed resize scale data; the complete save was blocked.`);
	}
	if (!Array.isArray(props.segments) || props.segments.length !== 1) {
		throw new Error(`Freehand stroke ${id} must contain one freehand segment; the complete save was blocked.`);
	}
	const segment = props.segments[0];
	if (!isRecord(segment) || !hasOnlyKeys(segment, ["type", "path"]) || segment.type !== "free" || typeof segment.path !== "string") {
		throw new Error(`Freehand stroke ${id} has unsupported segment data; the complete save was blocked.`);
	}
	let decodedPoints: Array<{ x: number; y: number; z?: number }>;
	try {
		decodedPoints = b64Vecs.decodePoints(segment.path);
	} catch {
		throw new Error(`Freehand stroke ${id} has malformed point data; the complete save was blocked.`);
	}
	if (
		decodedPoints.length === 0 || typeof props.isPen !== "boolean" || typeof props.isClosed !== "boolean" ||
		typeof props.color !== "string" || typeof props.fill !== "string" || typeof props.dash !== "string" || typeof props.size !== "string" ||
		decodedPoints.some((point) => !isFiniteNumber(point.x) || !isFiniteNumber(point.y) || !isFiniteNumber(point.z) || point.z < 0 || point.z > 1)
	) {
		throw new Error(`Freehand stroke ${id} has malformed points or visual style; the complete save was blocked.`);
	}

	return {
		id,
		kind: "freehand-stroke",
		placement: { type: "root", order, position: { x: shape.x, y: shape.y } },
		points: decodedPoints.map((point) => ({
			x: point.x * scaleX,
			y: point.y * scaleY,
			...(props.isPen ? { pressure: point.z } : {}),
		})),
		closed: props.isClosed,
		fill: props.fill,
		style: { color: props.color, dash: props.dash, size: props.size, opacity: shape.opacity },
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowedKeys: string[]) {
	const keys = Object.keys(value);
	return keys.length === allowedKeys.length && keys.every((key) => allowedKeys.includes(key));
}

function isEmptyMeta(value: unknown) {
	return value === undefined || isRecord(value) && Object.keys(value).length === 0;
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

function isFiniteNonZero(value: unknown): value is number {
	return isFiniteNumber(value) && value !== 0;
}

function isOpacity(value: unknown): value is number {
	return isFiniteNumber(value) && value >= 0 && value <= 1;
}
