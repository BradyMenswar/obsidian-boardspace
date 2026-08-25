import {
	BOARDSPACE_ARROW_TARGET_META_KEY,
} from "../files/boardspace-arrow-adapter";
import {
	BoardspaceEditorState,
	getArrowVisualTargetId,
} from "../files/boardspace-document-adapter";
import {
	Editor,
	IndexKey,
	TLArrowShape,
	TLBindingCreate,
	toRichText,
} from "tldraw";

export function createCanonicalArrows(
	editor: Editor,
	state: Extract<BoardspaceEditorState, { kind: "canonical" }>,
	rootIndices: Map<string, IndexKey>,
) {
	const arrows = state.arrows ?? [];
	if (arrows.length === 0) return;

	editor.createShapes(arrows.map((arrow) => ({
		id: `shape:${arrow.id}` as TLArrowShape["id"],
		type: "arrow" as const,
		parentId: editor.getCurrentPageId(),
		index: rootIndices.get(arrow.id),
		x: arrow.placement.position.x,
		y: arrow.placement.position.y,
		props: {
			kind: "arc" as const,
			labelColor: arrow.color as TLArrowShape["props"]["labelColor"],
			color: arrow.color as TLArrowShape["props"]["color"],
			fill: "none" as const,
			dash: arrow.dash as TLArrowShape["props"]["dash"],
			size: arrow.size as TLArrowShape["props"]["size"],
			arrowheadStart: arrow.arrowheadStart,
			arrowheadEnd: arrow.arrowheadEnd,
			font: "draw" as const,
			start: {
				x: arrow.start.point.x - arrow.placement.position.x,
				y: arrow.start.point.y - arrow.placement.position.y,
			},
			end: {
				x: arrow.end.point.x - arrow.placement.position.x,
				y: arrow.end.point.y - arrow.placement.position.y,
			},
			bend: arrow.bend,
			richText: toRichText(arrow.label ?? ""),
			labelPosition: 0.5,
			scale: 1,
			elbowMidPoint: 0.5,
		},
	})));

	const bindings = arrows.flatMap((arrow) => (["start", "end"] as const).flatMap((terminal) => {
		const endpoint = arrow[terminal];
		if (endpoint.type !== "item") return [];
		const visualTargetId = getArrowVisualTargetId(state, endpoint);
		return [{
			type: "arrow" as const,
			fromId: `shape:${arrow.id}` as TLArrowShape["id"],
			toId: `shape:${visualTargetId}` as TLArrowShape["id"],
			meta: { [BOARDSPACE_ARROW_TARGET_META_KEY]: endpoint.itemId },
			props: { terminal, normalizedAnchor: { x: 0.5, y: 0.5 }, isExact: false, isPrecise: false, snap: "none" as const },
		}];
	}));
	if (bindings.length > 0) editor.createBindings(bindings as TLBindingCreate[]);
}

export function registerBoardspaceArrowBindingNormalization(editor: Editor) {
	let isNormalizing = false;
	const normalize = () => {
		if (isNormalizing) return;
		const updates = editor.getCurrentPageShapes()
			.filter((shape): shape is TLArrowShape => shape.type === "arrow")
			.flatMap((arrow) => editor.getBindingsFromShape(arrow, "arrow"))
			.flatMap((binding) => {
				const storedTarget = binding.meta[BOARDSPACE_ARROW_TARGET_META_KEY];
				const canonicalTargetId = typeof storedTarget === "string"
					? `shape:${storedTarget}`
					: binding.toId;
				const canonicalTarget = editor.getShape(canonicalTargetId as TLArrowShape["id"]);
				if (!canonicalTarget || canonicalTarget.type === "arrow") return [];
				const parent = editor.getShape(canonicalTarget.parentId);
				const visualTargetId = parent?.type === "board-column" && parent.props.collapsed
					? parent.id
					: canonicalTarget.id;
				const canonicalItemId = canonicalTarget.id.slice("shape:".length);
				if (binding.toId === visualTargetId && storedTarget === canonicalItemId) return [];
				return [{
					id: binding.id,
					type: binding.type,
					toId: visualTargetId,
					meta: { [BOARDSPACE_ARROW_TARGET_META_KEY]: canonicalItemId },
				}];
			});
		if (updates.length === 0) return;
		isNormalizing = true;
		try {
			editor.updateBindings(updates);
		} finally {
			isNormalizing = false;
		}
	};
	const remove = editor.sideEffects.registerOperationCompleteHandler(normalize);
	normalize();
	return remove;
}
