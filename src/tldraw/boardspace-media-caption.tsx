import {
	createShapeId,
	DefaultContextMenu,
	DefaultContextMenuContent,
	DefaultDashStyle,
	DefaultFillStyle,
	DefaultSizeStyle,
	DefaultStylePanel,
	Editor,
	ReadonlySharedStyleMap,
	StyleProp,
	TLShape,
	TLShapeId,
	TLShapePartial,
	TLUiActionItem,
	TLUiActionsContextType,
	TLUiContextMenuProps,
	TLUiOverrideHelpers,
	TLUiStylePanelProps,
	TldrawUiMenuActionItem,
	toRichText,
	useEditor,
	useValue,
} from "tldraw";
import { ReactNode, useEffect } from "react";
import { BOARD_NOTE_MIN_HEIGHT } from "./board-note-config";
import {
	BOARDSPACE_TRANSPARENT_TOP_BAR_COLOR,
	BoardNoteShape,
	BoardNoteTopBarCustomColorStyle,
	BoardNoteTopBarColorStyle,
	BoardspaceColorStyle,
	BoardspaceCustomColorStyle,
	getBoardNoteMeasuredHeight,
} from "./board-note-shape";
import { focusBoardNoteForTyping } from "./board-note-tool";

const BOARDSPACE_MEDIA_CAPTION_ACTION_ID = "boardspace-add-media-caption";
const BOARDSPACE_MEDIA_REMOVE_CAPTION_ACTION_ID =
	"boardspace-remove-media-caption";
const BOARDSPACE_MEDIA_CAPTION_LABEL_KEY = "boardspace.add-media-caption";
const BOARDSPACE_MEDIA_REMOVE_CAPTION_LABEL_KEY =
	"boardspace.remove-media-caption";
const BOARDSPACE_MEDIA_CAPTION_META_KEY = "boardspaceMediaCaption";

export type BoardspaceMediaShape = Extract<TLShape, { type: "image" | "video" }>;

export const BOARDSPACE_MEDIA_CAPTION_TRANSLATIONS = {
	en: {
		[BOARDSPACE_MEDIA_CAPTION_LABEL_KEY]: "Add caption",
		[BOARDSPACE_MEDIA_REMOVE_CAPTION_LABEL_KEY]: "Remove caption",
	},
} as const;

export function isBoardspaceMediaShape(
	shape: TLShape | null | undefined,
): shape is BoardspaceMediaShape {
	return shape?.type === "image" || shape?.type === "video";
}

export function isBoardspaceMediaCaptionShape(
	shape: TLShape | null | undefined,
): shape is BoardNoteShape {
	return (
		shape?.type === "board-note" &&
		shape.meta?.[BOARDSPACE_MEDIA_CAPTION_META_KEY] === true
	);
}

export function getBoardspaceMediaCaptionShape(
	editor: Editor,
	mediaId: TLShapeId,
): BoardNoteShape | null {
	for (const childId of editor.getSortedChildIdsForParent(mediaId)) {
		const child = editor.getShape(childId);
		if (isBoardspaceMediaCaptionShape(child)) {
			return child;
		}
	}

	return null;
}

export function getBoardspaceMediaCaptionHeight(
	editor: Editor,
	mediaShape: BoardspaceMediaShape,
	captionShape = getBoardspaceMediaCaptionShape(editor, mediaShape.id),
) {
	if (!captionShape) {
		return 0;
	}

	return Math.max(
		BOARD_NOTE_MIN_HEIGHT,
		getBoardNoteMeasuredHeight(editor, {
			...captionShape,
			props: {
				...captionShape.props,
				minH: BOARD_NOTE_MIN_HEIGHT,
				w: mediaShape.props.w,
			},
		}),
	);
}

export function getBoardspaceMediaCardHeight(
	editor: Editor,
	shape: BoardspaceMediaShape,
) {
	return shape.props.h + getBoardspaceMediaCaptionHeight(editor, shape);
}

export function getBoardspaceSelectedMediaShape(editor: Editor) {
	const selectedShapes = editor.getSelectedShapes();

	if (selectedShapes.length !== 1) {
		return null;
	}

	const [selectedShape] = selectedShapes;
	return isBoardspaceMediaShape(selectedShape) ? selectedShape : null;
}

export function getBoardspaceSelectedMediaCaptionTarget(editor: Editor) {
	const selectedShapes = editor.getSelectedShapes();

	if (selectedShapes.length !== 1) {
		return null;
	}

	const [selectedShape] = selectedShapes;
	if (isBoardspaceMediaShape(selectedShape)) {
		return selectedShape;
	}

	if (!isBoardspaceMediaCaptionShape(selectedShape)) {
		return null;
	}

	const parentShape = editor.getShape(selectedShape.parentId);
	return isBoardspaceMediaShape(parentShape) ? parentShape : null;
}

export function useSelectedBoardspaceMediaCaption() {
	const editor = useEditor();

	return useValue(
		"selected-boardspace-media-caption",
		() => {
			const selectedMediaShape = getBoardspaceSelectedMediaShape(editor);
			if (!selectedMediaShape) {
				return null;
			}

			return getBoardspaceMediaCaptionShape(editor, selectedMediaShape.id);
		},
		[editor],
	);
}

export function buildBoardspaceMediaCaptionStyles(
	captionShape: BoardNoteShape,
): ReadonlySharedStyleMap {
	return new ReadonlySharedStyleMap([
		[BoardspaceColorStyle, { type: "shared", value: captionShape.props.color }],
		[
			BoardspaceCustomColorStyle,
			{ type: "shared", value: captionShape.props.customColor },
		],
		[DefaultDashStyle, { type: "shared", value: captionShape.props.dash }],
		[DefaultFillStyle, { type: "shared", value: captionShape.props.fill }],
		[DefaultSizeStyle, { type: "shared", value: captionShape.props.size }],
		[
			BoardNoteTopBarColorStyle,
			{ type: "shared", value: captionShape.props.topBarColor },
		],
		[
			BoardNoteTopBarCustomColorStyle,
			{ type: "shared", value: captionShape.props.topBarCustomColor },
		],
	]);
}

export function BoardspaceMediaCaptionStyleScope({
	captionShape,
	children,
}: {
	captionShape: BoardNoteShape;
	children: ReactNode;
}) {
	const editor = useEditor();

	useEffect(() => {
		const patchedEditor = editor as Editor & {
			getSharedOpacity: Editor["getSharedOpacity"];
			setOpacityForSelectedShapes: Editor["setOpacityForSelectedShapes"];
			setStyleForSelectedShapes: Editor["setStyleForSelectedShapes"];
		};
		const originalGetSharedOpacity = editor.getSharedOpacity.bind(editor);
		const originalSetOpacityForSelectedShapes =
			editor.setOpacityForSelectedShapes.bind(editor);
		const originalSetStyleForSelectedShapes =
			editor.setStyleForSelectedShapes.bind(editor);

		patchedEditor.getSharedOpacity = () => {
			const nextCaptionShape = editor.getShape(captionShape.id);
			if (!nextCaptionShape || nextCaptionShape.type !== "board-note") {
				return originalGetSharedOpacity();
			}

			return {
				type: "shared",
				value: nextCaptionShape.opacity,
			};
		};

		patchedEditor.setOpacityForSelectedShapes = (opacity: number) => {
			const nextCaptionShape = editor.getShape(captionShape.id);
			if (!nextCaptionShape || nextCaptionShape.type !== "board-note") {
				return originalSetOpacityForSelectedShapes(opacity);
			}

			editor.updateShapes([
				{
					id: nextCaptionShape.id,
					type: nextCaptionShape.type,
					opacity,
				},
			]);

			return editor;
		};

		patchedEditor.setStyleForSelectedShapes = function <
			S extends StyleProp<any>,
		>(
			style: S,
			value: S extends StyleProp<infer TValue> ? TValue : never,
		) {
			const nextCaptionShape = editor.getShape(captionShape.id);
			if (!nextCaptionShape || nextCaptionShape.type !== "board-note") {
				return originalSetStyleForSelectedShapes(style, value);
			}

			const update = getBoardspaceCaptionStyleUpdate(
				nextCaptionShape,
				style,
				value,
			);

			if (update) {
				editor.updateShapes([update]);
			}

			return editor;
		};

		return () => {
			patchedEditor.getSharedOpacity = originalGetSharedOpacity;
			patchedEditor.setOpacityForSelectedShapes =
				originalSetOpacityForSelectedShapes;
			patchedEditor.setStyleForSelectedShapes =
				originalSetStyleForSelectedShapes;
		};
	}, [captionShape.id, editor]);

	return <>{children}</>;
}

export function BoardspaceMediaCaptionStylePanel({
	captionShape,
	children,
	props,
}: {
	captionShape: BoardNoteShape;
	children: ReactNode;
	props?: TLUiStylePanelProps;
}) {
	return (
		<BoardspaceMediaCaptionStyleScope captionShape={captionShape}>
			<DefaultStylePanel
				{...props}
				styles={buildBoardspaceMediaCaptionStyles(captionShape)}
			>
				{children}
			</DefaultStylePanel>
		</BoardspaceMediaCaptionStyleScope>
	);
}

export function BoardspaceContextMenu(props: TLUiContextMenuProps) {
	return (
		<DefaultContextMenu {...props}>
			<BoardspaceContextMenuContent />
		</DefaultContextMenu>
	);
}

export function addBoardspaceMediaCaptionActions(
	editor: Editor,
	actions: TLUiActionsContextType,
	_helpers: TLUiOverrideHelpers,
): TLUiActionsContextType {
	const addCaptionAction: TLUiActionItem = {
		id: BOARDSPACE_MEDIA_CAPTION_ACTION_ID,
		label: BOARDSPACE_MEDIA_CAPTION_LABEL_KEY,
		onSelect() {
			const selectedMediaShape = getBoardspaceSelectedMediaCaptionTarget(editor);
			if (!selectedMediaShape) {
				return;
			}

			const captionShape = ensureBoardspaceMediaCaption(editor, selectedMediaShape);
			if (captionShape) {
				focusBoardNoteForTyping(editor, captionShape.id, true);
			}
		},
	};
	const removeCaptionAction: TLUiActionItem = {
		id: BOARDSPACE_MEDIA_REMOVE_CAPTION_ACTION_ID,
		label: BOARDSPACE_MEDIA_REMOVE_CAPTION_LABEL_KEY,
		onSelect() {
			const selectedMediaShape = getBoardspaceSelectedMediaCaptionTarget(editor);
			if (!selectedMediaShape) {
				return;
			}

			removeBoardspaceMediaCaption(editor, selectedMediaShape.id);
		},
	};

	return {
		...actions,
		[BOARDSPACE_MEDIA_CAPTION_ACTION_ID]: addCaptionAction,
		[BOARDSPACE_MEDIA_REMOVE_CAPTION_ACTION_ID]: removeCaptionAction,
	};
}

export function registerBoardspaceMediaCaptionNormalization(editor: Editor) {
	const pendingMediaIds = new Set<BoardspaceMediaShape["id"]>();
	let isNormalizing = false;

	const queueShape = (shape: TLShape | null | undefined) => {
		if (!shape) {
			return;
		}

		if (isBoardspaceMediaShape(shape)) {
			pendingMediaIds.add(shape.id);
			return;
		}

		if (!isBoardspaceMediaCaptionShape(shape)) {
			return;
		}

		const parentShape = editor.getShape(shape.parentId);
		if (isBoardspaceMediaShape(parentShape)) {
			pendingMediaIds.add(parentShape.id);
		}
	};

	const removeAfterCreateHandler = editor.sideEffects.registerAfterCreateHandler(
		"shape",
		(shape) => {
			if (!isNormalizing) {
				queueShape(shape);
			}
		},
	);
	const removeAfterChangeHandler = editor.sideEffects.registerAfterChangeHandler(
		"shape",
		(from, to) => {
			if (!isNormalizing) {
				queueShape(from);
				queueShape(to);
			}
		},
	);
	const removeAfterDeleteHandler = editor.sideEffects.registerAfterDeleteHandler(
		"shape",
		(shape) => {
			if (!isNormalizing) {
				queueShape(shape);
			}
		},
	);
	const removeOperationCompleteHandler =
		editor.sideEffects.registerOperationCompleteHandler(() => {
			if (isNormalizing || pendingMediaIds.size === 0) {
				return;
			}

			isNormalizing = true;

			try {
				normalizeBoardspaceMediaCaptions(editor, Array.from(pendingMediaIds));
			} finally {
				pendingMediaIds.clear();
				isNormalizing = false;
			}
		});

	normalizeBoardspaceMediaCaptions(
		editor,
		editor
			.getCurrentPageShapes()
			.filter((shape): shape is BoardspaceMediaShape => isBoardspaceMediaShape(shape))
			.map((shape) => shape.id),
	);

	return () => {
		removeAfterCreateHandler?.();
		removeAfterChangeHandler?.();
		removeAfterDeleteHandler?.();
		removeOperationCompleteHandler?.();
	};
}

function BoardspaceContextMenuContent() {
	const editor = useEditor();
	const shouldShowAddCaption = useValue(
		"boardspace-context-menu-add-caption",
		() => {
			const selectedMediaShape = getBoardspaceSelectedMediaCaptionTarget(editor);
			if (!selectedMediaShape) {
				return false;
			}

			return !getBoardspaceMediaCaptionShape(editor, selectedMediaShape.id);
		},
		[editor],
	);
	const shouldShowRemoveCaption = useValue(
		"boardspace-context-menu-remove-caption",
		() => {
			const selectedMediaShape = getBoardspaceSelectedMediaCaptionTarget(editor);
			if (!selectedMediaShape) {
				return false;
			}

			return Boolean(getBoardspaceMediaCaptionShape(editor, selectedMediaShape.id));
		},
		[editor],
	);

	return (
		<>
			{shouldShowAddCaption ? (
				<TldrawUiMenuActionItem
					actionId={BOARDSPACE_MEDIA_CAPTION_ACTION_ID}
				/>
			) : null}
			{shouldShowRemoveCaption ? (
				<TldrawUiMenuActionItem
					actionId={BOARDSPACE_MEDIA_REMOVE_CAPTION_ACTION_ID}
				/>
			) : null}
			<DefaultContextMenuContent />
		</>
	);
}

function ensureBoardspaceMediaCaption(
	editor: Editor,
	mediaShape: BoardspaceMediaShape,
) {
	const existingCaptionShape = getBoardspaceMediaCaptionShape(editor, mediaShape.id);
	if (existingCaptionShape) {
		return existingCaptionShape;
	}

	const captionId = createShapeId();
	const nextColor = editor.getStyleForNextShape(BoardspaceColorStyle);
	const nextCustomColor = editor.getStyleForNextShape(BoardspaceCustomColorStyle);

	editor.createShape({
		id: captionId,
		parentId: mediaShape.id,
		type: "board-note",
		x: 0,
		y: mediaShape.props.h,
		meta: {
			[BOARDSPACE_MEDIA_CAPTION_META_KEY]: true,
		},
		props: {
			color: nextColor,
			customColor: nextCustomColor,
			dash: "solid",
			fill: "semi",
			h: BOARD_NOTE_MIN_HEIGHT,
			minH: BOARD_NOTE_MIN_HEIGHT,
			richText: toRichText(""),
			size: editor.getStyleForNextShape(DefaultSizeStyle),
			topBarColor: BOARDSPACE_TRANSPARENT_TOP_BAR_COLOR,
			topBarCustomColor: editor.getStyleForNextShape(
				BoardNoteTopBarCustomColorStyle,
			),
			w: mediaShape.props.w,
		},
	});

	normalizeBoardspaceMediaCaptions(editor, [mediaShape.id]);

	const nextCaptionShape = editor.getShape(captionId);
	return nextCaptionShape && nextCaptionShape.type === "board-note"
		? nextCaptionShape
		: null;
}

export function removeBoardspaceMediaCaption(
	editor: Editor,
	mediaId: TLShapeId,
) {
	const captionShape = getBoardspaceMediaCaptionShape(editor, mediaId);
	if (!captionShape) {
		return false;
	}

	editor.run(() => {
		editor.setEditingShape(null);
		editor.deleteShapes([captionShape.id]);
		editor.select(mediaId);
		editor.setCurrentTool("select");
	});

	return true;
}

function normalizeBoardspaceMediaCaptions(
	editor: Editor,
	mediaIds: BoardspaceMediaShape["id"][],
) {
	const updates: TLShapePartial[] = [];

	for (const mediaId of mediaIds) {
		const mediaShape = editor.getShape(mediaId);
		if (!isBoardspaceMediaShape(mediaShape)) {
			continue;
		}

		const captionShape = getBoardspaceMediaCaptionShape(editor, mediaShape.id);
		if (!captionShape) {
			continue;
		}

		const captionHeight = getBoardspaceMediaCaptionHeight(
			editor,
			mediaShape,
			captionShape,
		);

		const needsPositionUpdate =
			Math.abs(captionShape.x) >= 1 ||
			Math.abs(captionShape.y - mediaShape.props.h) >= 1;
		const needsWidthUpdate = Math.abs(captionShape.props.w - mediaShape.props.w) >= 1;
		const needsHeightUpdate =
			Math.abs(captionShape.props.h - captionHeight) >= 1 ||
			Math.abs(captionShape.props.minH - BOARD_NOTE_MIN_HEIGHT) >= 1;

		if (!needsPositionUpdate && !needsWidthUpdate && !needsHeightUpdate) {
			continue;
		}

		updates.push({
			id: captionShape.id,
			type: captionShape.type,
			x: 0,
			y: mediaShape.props.h,
			props: {
				h: captionHeight,
				minH: BOARD_NOTE_MIN_HEIGHT,
				w: mediaShape.props.w,
			},
		});
	}

	if (updates.length === 0) {
		return;
	}

	editor.run(() => {
		editor.updateShapes(updates);
	}, { history: "ignore" });
}

function getBoardspaceCaptionStyleUpdate<S extends StyleProp<any>>(
	captionShape: BoardNoteShape,
	style: S,
	value: S extends StyleProp<infer TValue> ? TValue : never,
): TLShapePartial<BoardNoteShape> | null {
	switch (style.id) {
		case BoardspaceColorStyle.id:
			return {
				id: captionShape.id,
				type: captionShape.type,
				props: {
					color: value as BoardNoteShape["props"]["color"],
				},
			};
		case BoardspaceCustomColorStyle.id:
			return {
				id: captionShape.id,
				type: captionShape.type,
				props: {
					customColor: value as BoardNoteShape["props"]["customColor"],
				},
			};
		case DefaultDashStyle.id:
			return {
				id: captionShape.id,
				type: captionShape.type,
				props: {
					dash: value as BoardNoteShape["props"]["dash"],
				},
			};
		case DefaultFillStyle.id:
			return {
				id: captionShape.id,
				type: captionShape.type,
				props: {
					fill: value as BoardNoteShape["props"]["fill"],
				},
			};
		case DefaultSizeStyle.id:
			return {
				id: captionShape.id,
				type: captionShape.type,
				props: {
					size: value as BoardNoteShape["props"]["size"],
				},
			};
		case BoardNoteTopBarColorStyle.id:
			return {
				id: captionShape.id,
				type: captionShape.type,
				props: {
					topBarColor: value as BoardNoteShape["props"]["topBarColor"],
				},
			};
		case BoardNoteTopBarCustomColorStyle.id:
			return {
				id: captionShape.id,
				type: captionShape.type,
				props: {
					topBarCustomColor: value as BoardNoteShape["props"]["topBarCustomColor"],
				},
			};
		default:
			return null;
	}
}
