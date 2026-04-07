import { TFile } from "obsidian";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useApp } from "hooks/use-app";
import {
	ArrowShapeTool,
	DefaultHelperButtonsContent,
	DefaultImageToolbar,
	DefaultNavigationPanel,
	DefaultRichTextToolbar,
	DefaultStylePanel,
	DefaultDashStyle,
	DrawShapeTool,
	EraserTool,
	HandTool,
	getColorValue,
	getDefaultColorTheme,
	kickoutOccludedShapes,
	StylePanelArrowheadPicker,
	StylePanelArrowKindPicker,
	StylePanelColorPicker,
	StylePanelDashPicker,
	StylePanelFillPicker,
	StylePanelFontPicker,
	StylePanelGeoShapePicker,
	StylePanelLabelAlignPicker,
	StylePanelOpacityPicker,
	StylePanelSection,
	StylePanelSizePicker,
	StylePanelSplinePicker,
	StylePanelTextAlignPicker,
	Editor,
	SelectTool,
	TLParentId,
	TLShape,
	TLShapePartial,
	TLEditorSnapshot,
	TLComponents,
	TldrawUiButtonIcon,
	TldrawUiGrid,
	TldrawUiMenuContextProvider,
	TLUiStylePanelProps,
	TldrawUiToolbar,
	TldrawUiToolbarButton,
	TldrawUiToolbarToggleGroup,
	TldrawUiToolbarToggleItem,
	TLUiOverrides,
	TLUiToolsContextType,
	Tldraw,
	unwrapLabel,
	useStylePanelContext,
	useActions,
	useCanRedo,
	useCanUndo,
	useEditor,
	useValue,
} from "tldraw";
import {
	BoardColumnShape,
	BoardColumnShapeUtil,
} from "./board-column-shape";
import { BoardColumnTool } from "./board-column-tool";
import {
	getAffectedBoardColumnIdsForShapeChange,
	getBoardColumnReorderUpdates,
	getBoardColumnLayoutResult,
	getBoardColumnVisualOrder,
} from "./board-column-layout";
import {
	BOARDSPACE_CUSTOM_COLOR,
	BOARDSPACE_TRANSPARENT_TOP_BAR_COLOR,
	BoardNoteShape,
	BoardNoteTopBarCustomColorStyle,
	BoardNoteTopBarColorStyle,
	BoardspaceColorStyle,
	BoardspaceCustomColorStyle,
	normalizeBoardspaceCustomColor,
} from "./board-note-shape";
import { BoardNoteTool } from "./board-note-tool";
import { BoardNoteShapeUtil } from "./board-note-shape";
import {
	BOARD_SWATCH_DEFAULT_COLOR,
	BoardSwatchColorValueStyle,
	BoardSwatchLabelModeStyle,
	BoardSwatchShape,
	BoardSwatchShapeUtil,
	normalizeBoardSwatchColor,
} from "./board-swatch-shape";
import { BoardSwatchTool } from "./board-swatch-tool";
import { BoardTodoShape, BoardTodoShapeUtil } from "./board-todo-shape";
import { BoardTodoTool } from "./board-todo-tool";
import {
	BoardspaceCanvasToneProvider,
	useBoardspaceCanvasTone,
} from "./boardspace-canvas-tone";
import {
	addBoardspaceMediaCaptionActions,
	BoardspaceContextMenu,
	BoardspaceMediaCaptionStylePanel,
	BOARDSPACE_MEDIA_CAPTION_TRANSLATIONS,
	registerBoardspaceMediaCaptionNormalization,
	useSelectedBoardspaceMediaCaption,
} from "./boardspace-media-caption";
import { BoardspaceToolbar } from "./boardspace-toolbar";
import { BoardspaceZoomMenu } from "./boardspace-zoom-menu";
import { createBoardspaceAssetStore } from "./boardspace-asset-store";
import {
	preventTldrawCanvasesCausingObsidianGestures,
	replaceCanvasDoubleClickWithBoardNote,
	syncTldrawThemeWithObsidian,
	watchObsidianThemeChanges,
} from "./tldraw-helpers";

interface BoardspaceEditorProps {
	file: TFile | null;
	isActive: boolean;
	loadKey: string;
	onSnapshotChange?: (snapshot: TLEditorSnapshot) => void;
	snapshot?: TLEditorSnapshot;
}

const BOARDSPACE_COMPONENTS: TLComponents = {
	ActionsMenu: null,
	ContextMenu: BoardspaceContextMenu,
	CursorChatBubble: null,
	DebugMenu: null,
	DebugPanel: null,
	Dialogs: null,
	FollowingIndicator: null,
	HelpMenu: null,
	HelperButtons: BoardspaceHelperButtons,
	ImageToolbar: DefaultImageToolbar,
	KeyboardShortcutsDialog: null,
	MainMenu: null,
	MenuPanel: null,
	Minimap: null,
	NavigationPanel: DefaultNavigationPanel,
	PageMenu: null,
	QuickActions: null,
	RichTextToolbar: DefaultRichTextToolbar,
	SharePanel: null,
	StylePanel: BoardspaceStylePanel,
	Toasts: null,
	TopPanel: null,
	Toolbar: BoardspaceToolbar,
	VideoToolbar: null,
	ZoomMenu: BoardspaceZoomMenu,
};

const BOARDSPACE_OVERRIDES: TLUiOverrides = {
	actions(editor, actions, helpers) {
		return addBoardspaceMediaCaptionActions(editor, actions, helpers);
	},
	tools(editor, tools) {
		return pickBoardspaceTools(editor, tools);
	},
	translations: BOARDSPACE_MEDIA_CAPTION_TRANSLATIONS,
};

const BOARDSPACE_TOOLS = [
	SelectTool,
	HandTool,
	DrawShapeTool,
	ArrowShapeTool,
	EraserTool,
	BoardNoteTool,
	BoardTodoTool,
	BoardColumnTool,
	BoardSwatchTool,
] as const;
const BOARDSPACE_SHAPES = [
	BoardNoteShapeUtil,
	BoardTodoShapeUtil,
	BoardColumnShapeUtil,
	BoardSwatchShapeUtil,
] as const;
const BOARDSPACE_OPTIONS = {
	actionShortcutsLocation: "menu",
	createTextOnCanvasDoubleClick: false,
} as const;
const BOARDSPACE_COLOR_VALUES = [
	"black",
	"grey",
	"light-violet",
	"violet",
	"blue",
	"light-blue",
	"yellow",
	"orange",
	"green",
	"light-green",
	"light-red",
	"red",
] as const;

export function BoardspaceEditor({
	file,
	isActive,
	loadKey,
	onSnapshotChange,
	snapshot,
}: BoardspaceEditorProps) {
	return (
		<BoardspaceCanvasToneProvider>
			<BoardspaceEditorInner
				file={file}
				isActive={isActive}
				loadKey={loadKey}
				onSnapshotChange={onSnapshotChange}
				snapshot={snapshot}
			/>
		</BoardspaceCanvasToneProvider>
	);
}

function BoardspaceEditorInner({
	file,
	isActive,
	loadKey,
	onSnapshotChange,
	snapshot,
}: BoardspaceEditorProps) {
	const app = useApp();
	const { currentTone } = useBoardspaceCanvasTone();
	const [editor, setEditor] = useState<Editor | null>(null);
	const assetStore = useMemo(
		() => createBoardspaceAssetStore(app, file),
		[app, file],
	);

	useLayoutEffect(() => {
		if (!editor) {
			return;
		}

		if (isActive) {
			editor.focus();
			return;
		}

		editor.blur();
	}, [editor, isActive]);

	const handleMount = (editor: Editor) => {
		setEditor(editor);
		normalizeToSinglePage(editor);
		syncTldrawThemeWithObsidian();
		editor.updateInstanceState({ isGridMode: true });

		const stopWatchingTheme = watchObsidianThemeChanges(
			syncTldrawThemeWithObsidian,
		);
		const cleanupGestures =
			preventTldrawCanvasesCausingObsidianGestures(editor);
		const cleanupDoubleClick =
			replaceCanvasDoubleClickWithBoardNote(editor);
		const cleanupColumnLayout = registerBoardColumnAutoLayout(editor);
		const cleanupMediaCaptions =
			registerBoardspaceMediaCaptionNormalization(editor);
		const removeSnapshotListener = editor.store.listen(
			() => {
				onSnapshotChange?.(editor.getSnapshot());
			},
			{ source: "user", scope: "document" },
		);

		return () => {
			setEditor((currentEditor) =>
				currentEditor === editor ? null : currentEditor,
			);
			stopWatchingTheme();
			cleanupGestures?.();
			cleanupDoubleClick?.();
			cleanupColumnLayout?.();
			cleanupMediaCaptions?.();
			removeSnapshotListener();
		};
	};

	return (
		<div
			className="boardspace-editor"
			data-board-file={file?.path ?? ""}
			data-canvas-tone={currentTone}
		>
			<Tldraw
				assets={assetStore}
				autoFocus={isActive}
				components={BOARDSPACE_COMPONENTS}
				initialState="select"
				key={loadKey}
				onMount={handleMount}
				options={BOARDSPACE_OPTIONS}
				overrides={BOARDSPACE_OVERRIDES}
				shapeUtils={BOARDSPACE_SHAPES}
				snapshot={snapshot}
				tools={BOARDSPACE_TOOLS}
			/>
		</div>
	);
}

function pickBoardspaceTools(
	editor: Editor,
	tools: TLUiToolsContextType,
): TLUiToolsContextType {
	const nextTools: TLUiToolsContextType = {};

	if (tools.hand) {
		nextTools.hand = tools.hand;
	}

	if (tools.select) {
		nextTools.select = tools.select;
	}

	if (tools.draw) {
		nextTools.draw = tools.draw;
	}

	if (tools.arrow) {
		nextTools.arrow = tools.arrow;
	}

	if (tools.eraser) {
		nextTools.eraser = tools.eraser;
	}

	if (tools.note) {
		nextTools.note = tools.note;
	}

	if (tools.asset) {
		nextTools.asset = tools.asset;
	}

	nextTools.todo = {
		id: "todo",
		icon: <TodoToolIcon />,
		kbd: "t",
		label: "To-do",
		onSelect() {
			editor.setCurrentTool("todo");
		},
	};

	nextTools.column = {
		id: "column",
		icon: <ColumnToolIcon />,
		kbd: "c",
		label: "Column",
		onSelect() {
			editor.setCurrentTool("column");
		},
	};

	nextTools.swatch = {
		id: "swatch",
		icon: <SwatchToolIcon />,
		kbd: "w",
		label: "Color swatch",
		onSelect() {
			editor.setCurrentTool("swatch");
		},
	};

	return nextTools;
}

function normalizeToSinglePage(editor: Editor) {
	const currentPageId = editor.getCurrentPageId();

	for (const page of editor.getPages()) {
		if (page.id !== currentPageId) {
			editor.deletePage(page.id);
		}
	}

	editor.setCurrentPage(currentPageId);
}

function registerBoardColumnAutoLayout(editor: Editor) {
	const pendingColumnIds = new Set<BoardColumnShape["id"]>();
	let isNormalizing = false;

	const queueColumnId = (columnId: TLParentId) => {
		const shape = editor.getShape(columnId);
		if (shape?.type === "board-column") {
			pendingColumnIds.add(shape.id);
		}
	};

	const removeAfterCreateHandler = editor.sideEffects.registerAfterCreateHandler(
		"shape",
		(shape) => {
			if (isNormalizing) {
				return;
			}

			if (shape.type === "board-column") {
				pendingColumnIds.add(shape.id);
			}
		},
	);
	const removeAfterChangeHandler = editor.sideEffects.registerAfterChangeHandler(
		"shape",
		(from, to) => {
			if (isNormalizing) {
				return;
			}

			for (const columnId of getAffectedBoardColumnIdsForShapeChange(editor, from, to)) {
				queueColumnId(columnId);
			}
		},
	);
	const removeAfterDeleteHandler = editor.sideEffects.registerAfterDeleteHandler(
		"shape",
		(shape) => {
			if (isNormalizing) {
				return;
			}

			queueColumnId(shape.parentId);
		},
	);
	const removeOperationCompleteHandler =
		editor.sideEffects.registerOperationCompleteHandler(() => {
			if (isNormalizing) {
				return;
			}

			if (editor.isIn("select.translating")) {
				return;
			}

			if (pendingColumnIds.size === 0) {
				return;
			}

			const nextColumnIds = Array.from(pendingColumnIds);
			pendingColumnIds.clear();
			isNormalizing = true;

			try {
				normalizeBoardColumns(editor, nextColumnIds);
			} finally {
				isNormalizing = false;
			}
		});

	normalizeBoardColumns(
		editor,
		editor
			.getCurrentPageShapes()
			.filter((shape): shape is BoardColumnShape => shape.type === "board-column")
			.map((shape) => shape.id),
	);

	return () => {
		removeAfterCreateHandler?.();
		removeAfterChangeHandler?.();
		removeAfterDeleteHandler?.();
		removeOperationCompleteHandler?.();
	};
}

function normalizeBoardColumns(editor: Editor, columnIds: BoardColumnShape["id"][]) {
	const updates: TLShapePartial[] = [];

	for (const columnId of columnIds) {
		const shape = editor.getShape(columnId);
		if (!shape || shape.type !== "board-column") {
			continue;
		}

		const orderedChildren = getBoardColumnVisualOrder(editor, shape.id);
		const reorderUpdates = getBoardColumnReorderUpdates(
			editor,
			shape.id,
			orderedChildren,
		);

		for (const reorderUpdate of reorderUpdates) {
			if (!hasMeaningfulShapeChange(editor, reorderUpdate)) {
				continue;
			}

			updates.push(reorderUpdate);
		}

		const { columnHeight, updates: childUpdates } = getBoardColumnLayoutResult(
			editor,
			shape.id,
			shape.props.w,
			shape.props.size,
			shape.props.minH,
			orderedChildren,
		);

		for (const childUpdate of childUpdates) {
			if (!hasMeaningfulShapeChange(editor, childUpdate)) {
				continue;
			}

			updates.push(childUpdate);
		}

		if (Math.abs(shape.props.h - columnHeight) >= 1) {
			updates.push({
				id: shape.id,
				type: shape.type,
				props: {
					h: columnHeight,
				},
			});
		}
	}

	if (updates.length === 0) {
		return;
	}

	editor.run(() => {
		editor.updateShapes(updates);
	}, { history: "ignore" });
}

function hasMeaningfulShapeChange(editor: Editor, update: TLShapePartial) {
	if (!update.id || !update.type) {
		return false;
	}

	const currentShape = editor.getShape(update.id);
	if (!currentShape || currentShape.type !== update.type) {
		return false;
	}

	if (typeof update.x === "number" && Math.abs(currentShape.x - update.x) >= 1) {
		return true;
	}

	if (typeof update.y === "number" && Math.abs(currentShape.y - update.y) >= 1) {
		return true;
	}

	if ("index" in update && typeof update.index === "string" && currentShape.index !== update.index) {
		return true;
	}

	if (update.props && typeof update.props === "object") {
		for (const [key, value] of Object.entries(update.props)) {
			const currentValue = (currentShape.props as Record<string, unknown>)[key];
			if (typeof value === "number" && typeof currentValue === "number") {
				if (Math.abs(currentValue - value) >= 1) {
					return true;
				}
				continue;
			}

			if (currentValue !== value) {
				return true;
			}
		}
	}

	return false;
}

function ColumnToolIcon() {
	return (
		<svg
			viewBox="0 0 16 16"
			aria-hidden="true"
			fill="none"
			stroke="currentColor"
			strokeLinecap="round"
			strokeLinejoin="round"
			strokeWidth="1.2"
		>
			<rect x="2.2" y="2.2" width="11.6" height="11.6" rx="1.4" />
			<path d="M4.5 5.3h7" />
			<path d="M4.5 8h7" opacity="0.58" />
			<path d="M4.5 10.7h7" opacity="0.58" />
		</svg>
	);
}

function TodoToolIcon() {
	return (
		<svg
			viewBox="0 0 16 16"
			aria-hidden="true"
			fill="none"
			stroke="currentColor"
			strokeLinecap="round"
			strokeLinejoin="round"
			strokeWidth="1.2"
		>
			<rect x="2.4" y="3" width="2.6" height="2.6" rx="0.5" />
			<path d="M6.8 4.3h6" />
			<rect x="2.4" y="8.4" width="2.6" height="2.6" rx="0.5" />
			<path d="M6.8 9.7h6" />
		</svg>
	);
}

function SwatchToolIcon() {
	return (
		<svg
			viewBox="0 0 16 16"
			aria-hidden="true"
			fill="none"
			stroke="currentColor"
			strokeLinecap="round"
			strokeLinejoin="round"
			strokeWidth="1.2"
		>
			<rect x="2.4" y="3.2" width="11.2" height="9.6" rx="1.2" />
			<path d="M4.6 10.6h6.8" opacity="0.78" />
		</svg>
	);
}

function BoardspaceStylePanel(props: TLUiStylePanelProps) {
	const selectedMediaCaption = useSelectedBoardspaceMediaCaption();

	if (selectedMediaCaption) {
		return (
			<BoardspaceMediaCaptionStylePanel
				captionShape={selectedMediaCaption}
				props={props}
			>
				<BoardspaceMediaCaptionStylePanelContent
					captionShape={selectedMediaCaption}
				/>
			</BoardspaceMediaCaptionStylePanel>
		);
	}

	return (
		<DefaultStylePanel {...props}>
			<BoardspaceStylePanelContent />
		</DefaultStylePanel>
	);
}

function BoardspaceMediaCaptionStylePanelContent({
	captionShape,
}: {
	captionShape: BoardNoteShape;
}) {
	return (
		<>
			<StylePanelSection>
				<BoardspaceColorSection selectedShapes={[captionShape]} />
				<StylePanelOpacityPicker />
			</StylePanelSection>
			<BoardspaceDefaultStylePanelContent
				omitFirstSection={true}
				useBoardspaceDashPicker={true}
			/>
		</>
	);
}

function BoardspaceStylePanelContent() {
	const editor = useEditor();
	const selectedStylableShapes = useValue(
		"selected-boardspace-style-shapes",
		() =>
			editor
				.getSelectedShapes()
				.filter(
					(shape): shape is BoardspaceStylableShape =>
						shape.type === "board-note" ||
						shape.type === "board-column" ||
						shape.type === "board-swatch" ||
						shape.type === "board-todo",
				),
		[editor],
	);
	const selectedSwatches = selectedStylableShapes.filter(
		(shape): shape is BoardSwatchShape => shape.type === "board-swatch",
	);
	const selectedColorTargetShapes = selectedStylableShapes.filter(
		(shape): shape is BoardspaceColorTargetShape => shape.type !== "board-swatch",
	);

	if (selectedStylableShapes.length === 0) {
		return <BoardspaceDefaultStylePanelContent />;
	}

	if (selectedSwatches.length === selectedStylableShapes.length) {
		return <BoardspaceSwatchStylePanelContent />;
	}

	if (selectedSwatches.length > 0) {
		return <BoardspaceDefaultStylePanelContent />;
	}

	return (
		<>
			<StylePanelSection>
				<BoardspaceColorSection selectedShapes={selectedColorTargetShapes} />
				<StylePanelOpacityPicker />
			</StylePanelSection>
			<BoardspaceDefaultStylePanelContent
				omitFirstSection={true}
				useBoardspaceDashPicker={true}
			/>
		</>
	);
}

function BoardspaceSwatchStylePanelContent() {
	return (
		<>
			<StylePanelSection>
				<BoardspaceSwatchColorPicker />
			</StylePanelSection>
			<StylePanelSection>
				<BoardspaceSwatchLabelModePicker />
			</StylePanelSection>
		</>
	);
}

function BoardspaceDefaultStylePanelContent({
	omitFirstSection = false,
	useBoardspaceDashPicker = false,
}: {
	omitFirstSection?: boolean;
	useBoardspaceDashPicker?: boolean;
}) {
	return (
		<>
			{omitFirstSection ? null : (
				<StylePanelSection>
					<StylePanelColorPicker />
					<StylePanelOpacityPicker />
				</StylePanelSection>
			)}
			<StylePanelSection>
				<StylePanelFillPicker />
				{useBoardspaceDashPicker ? <BoardspaceDashPicker /> : <StylePanelDashPicker />}
				<StylePanelSizePicker />
			</StylePanelSection>
			<StylePanelSection>
				<StylePanelFontPicker />
				<StylePanelTextAlignPicker />
				<StylePanelLabelAlignPicker />
			</StylePanelSection>
			<StylePanelSection>
				<StylePanelGeoShapePicker />
				<StylePanelArrowKindPicker />
				<StylePanelArrowheadPicker />
				<StylePanelSplinePicker />
			</StylePanelSection>
		</>
	);
}

function BoardspaceDashPicker() {
	const editor = useEditor();
	const { styles, onHistoryMark, onValueChange } = useStylePanelContext();
	const dash = styles.get(DefaultDashStyle);

	if (!dash) {
		return null;
	}

	const items = [
		{ value: "draw", icon: "dash-draw", label: "No border" },
		{ value: "dashed", icon: "dash-dashed", label: "Dashed border" },
		{ value: "dotted", icon: "dash-dotted", label: "Dotted border" },
		{ value: "solid", icon: "dash-solid", label: "Solid border" },
	] as const;

	const sharedValue = dash.type === "shared" ? dash.value : null;

	return (
		<TldrawUiToolbar label="Border style">
			<TldrawUiToolbarToggleGroup
				data-testid="style.dash"
				type="single"
				value={sharedValue}
				asChild
			>
				<TldrawUiGrid>
					{items.map((item) => {
						const isActive = dash.type === "shared" && dash.value === item.value;

						return (
							<TldrawUiToolbarToggleItem
								type="icon"
								key={item.value}
								value={item.value}
								data-testid={`style.dash.${item.value}`}
								aria-label={item.label}
								title={item.label}
								data-state={isActive ? "on" : "off"}
								data-isactive={isActive}
								onPointerDown={() => {
									onHistoryMark("set border style");
									onValueChange(DefaultDashStyle, item.value);
								}}
								onClick={() => {
									onValueChange(DefaultDashStyle, item.value);
									const selectedShapeIds = editor.getSelectedShapeIds();
									if (selectedShapeIds.length > 0) {
										kickoutOccludedShapes(editor, selectedShapeIds);
									}
								}}
							>
								<TldrawUiButtonIcon icon={item.icon} />
							</TldrawUiToolbarToggleItem>
						);
					})}
				</TldrawUiGrid>
			</TldrawUiToolbarToggleGroup>
		</TldrawUiToolbar>
	);
}

function BoardspaceHelperButtons() {
	const actions = useActions();
	const canUndo = useCanUndo();
	const canRedo = useCanRedo();
	const undoAction = actions.undo;
	const redoAction = actions.redo;

	return (
		<div className="tlui-helper-buttons boardspace-helper-buttons">
			{undoAction && redoAction ? (
				<TldrawUiToolbar
					className="boardspace-helper-buttons__history"
					orientation="horizontal"
					label="History controls"
				>
					<TldrawUiToolbarButton
						type="icon"
						title={unwrapLabel(undoAction.label) ?? "Undo"}
						disabled={!canUndo}
						onClick={() => undoAction.onSelect("helper-buttons")}
					>
						<TldrawUiButtonIcon small icon="undo" />
					</TldrawUiToolbarButton>
					<TldrawUiToolbarButton
						type="icon"
						title={unwrapLabel(redoAction.label) ?? "Redo"}
						disabled={!canRedo}
						onClick={() => redoAction.onSelect("helper-buttons")}
					>
						<TldrawUiButtonIcon small icon="redo" />
					</TldrawUiToolbarButton>
				</TldrawUiToolbar>
			) : null}
			<TldrawUiMenuContextProvider type="helper-buttons" sourceId="helper-buttons">
				<DefaultHelperButtonsContent />
			</TldrawUiMenuContextProvider>
		</div>
	);
}

type BoardspaceStylableShape =
	| BoardNoteShape
	| BoardColumnShape
	| BoardSwatchShape
	| BoardTodoShape;
type BoardspaceColorTargetShape =
	| BoardNoteShape
	| BoardColumnShape
	| BoardTodoShape;

function BoardspaceColorSection({
	selectedShapes,
}: {
	selectedShapes: BoardspaceColorTargetShape[];
}) {
	const editor = useEditor();
	const [colorTarget, setColorTarget] = useState<"background" | "topBar">(
		"background",
	);
	const { styles, onHistoryMark, onValueChange } = useStylePanelContext();

	const allBackgroundsTransparent = selectedShapes.every(
		(shape) => shape.props.fill === "none",
	);
	const allTopBarsTransparent = selectedShapes.every(
		(shape) =>
			shape.props.topBarColor === BOARDSPACE_TRANSPARENT_TOP_BAR_COLOR,
	);
	const backgroundCustomColor = styles.get(BoardspaceCustomColorStyle);
	const topBarCustomColor = styles.get(BoardNoteTopBarCustomColorStyle);
	const pickerStyle =
		colorTarget === "topBar" ? BoardNoteTopBarColorStyle : BoardspaceColorStyle;
	const pickerValue = styles.get(pickerStyle);
	const customColorValue =
		colorTarget === "topBar" ? topBarCustomColor : backgroundCustomColor;

	if (!pickerValue) {
		return null;
	}

	return (
		<>
			<div
				className="boardspace-style-panel__target-toggle"
				role="tablist"
				aria-label="Note color target"
			>
				<button
					type="button"
					className="boardspace-style-panel__target-button"
					data-active={colorTarget === "background" ? "true" : "false"}
					aria-pressed={colorTarget === "background"}
					title="Apply colors to the card background"
					onClick={() => setColorTarget("background")}
				>
					<span className="boardspace-style-panel__target-icon boardspace-style-panel__target-icon--background" />
				</button>
				<button
					type="button"
					className="boardspace-style-panel__target-button"
					data-active={colorTarget === "topBar" ? "true" : "false"}
					aria-pressed={colorTarget === "topBar"}
					title="Apply colors to the top strip"
					onClick={() => setColorTarget("topBar")}
				>
					<span className="boardspace-style-panel__target-icon boardspace-style-panel__target-icon--top-bar" />
				</button>
			</div>
			<div
				key={colorTarget}
				className="boardspace-style-panel__note-color-picker"
			>
				<BoardspaceNoteColorPicker
					title={colorTarget === "topBar" ? "Top strip color" : "Background color"}
					value={pickerValue}
					customColor={
						customColorValue?.type === "shared"
							? customColorValue.value
							: undefined
					}
					onHistoryMark={onHistoryMark}
					transparentActive={
						colorTarget === "topBar"
							? allTopBarsTransparent
							: allBackgroundsTransparent
					}
					transparentLabel={
						colorTarget === "topBar"
							? "No top strip color"
							: "No background color"
					}
					onTransparentSelect={() => {
						if (colorTarget === "topBar") {
							onValueChange(
								BoardNoteTopBarColorStyle,
								BOARDSPACE_TRANSPARENT_TOP_BAR_COLOR,
							);
							return;
						}

						updateSelectedBoardspaceShapes(editor, {
							fill: "none",
						});
					}}
					onColorSelect={(value) => {
						if (colorTarget === "topBar") {
							onValueChange(BoardNoteTopBarColorStyle, value);
							return;
						}

						onValueChange(BoardspaceColorStyle, value);
						updateSelectedBoardspaceShapes(editor, (shape) =>
							shape.props.fill === "none" ? { fill: "semi" } : null,
						);
					}}
					onCustomColorSelect={(value) => {
						if (colorTarget === "topBar") {
							onValueChange(BoardNoteTopBarCustomColorStyle, value);
							onValueChange(BoardNoteTopBarColorStyle, BOARDSPACE_CUSTOM_COLOR);
							return;
						}

						onValueChange(BoardspaceCustomColorStyle, value);
						onValueChange(BoardspaceColorStyle, BOARDSPACE_CUSTOM_COLOR);
						updateSelectedBoardspaceShapes(editor, (shape) =>
							shape.props.fill === "none" ? { fill: "semi" } : null,
						);
					}}
				/>
			</div>
		</>
	);
}

function BoardspaceNoteColorPicker({
	title,
	transparentActive,
	transparentLabel,
	customColor,
	onHistoryMark,
	onColorSelect,
	onCustomColorSelect,
	onTransparentSelect,
	value,
}: {
	title: string;
	transparentActive: boolean;
	transparentLabel: string;
	customColor?: string;
	onHistoryMark: (id: string) => void;
	onColorSelect: (value: (typeof BOARDSPACE_COLOR_VALUES)[number]) => void;
	onCustomColorSelect: (value: string) => void;
	onTransparentSelect: () => void;
	value:
		| {
				type: "mixed";
		  }
		| {
				type: "shared";
				value: string;
		  }
		| undefined;
}) {
	const editor = useEditor();
	const theme = getDefaultColorTheme({
		isDarkMode: editor.user.getIsDarkMode(),
	});
	const customInputRef = useRef<HTMLInputElement>(null);
	const customActive =
		!transparentActive &&
		value?.type === "shared" &&
		value.value === BOARDSPACE_CUSTOM_COLOR;
	const customPreviewColor =
		value?.type === "shared" &&
		BOARDSPACE_COLOR_VALUES.includes(
			value.value as (typeof BOARDSPACE_COLOR_VALUES)[number],
		)
			? getColorValue(
					theme,
					value.value as (typeof BOARDSPACE_COLOR_VALUES)[number],
					"solid",
				)
			: normalizeBoardspaceCustomColor(customColor);
	const selectedValue = transparentActive
		? BOARDSPACE_TRANSPARENT_TOP_BAR_COLOR
		: value?.type === "shared"
			? value.value
			: null;

	return (
		<TldrawUiToolbar label={title}>
			<TldrawUiToolbarToggleGroup
				type="single"
				value={selectedValue}
				data-testid="style.color"
				asChild
			>
				<TldrawUiGrid>
					<TldrawUiToolbarToggleItem
						type="icon"
						value={BOARDSPACE_TRANSPARENT_TOP_BAR_COLOR}
						data-testid="style.color.transparent"
						data-isactive={transparentActive ? "true" : "false"}
						title={transparentLabel}
						aria-label={transparentLabel}
						onClick={() => {
							onHistoryMark("clear note color");
							onTransparentSelect();
						}}
					>
						<span
							className="boardspace-style-panel__color-swatch boardspace-style-panel__color-swatch--transparent"
							aria-hidden="true"
						/>
					</TldrawUiToolbarToggleItem>
					{BOARDSPACE_COLOR_VALUES.map((color) => {
						const isActive =
							!transparentActive &&
							value?.type === "shared" &&
							value.value === color;

						return (
							<TldrawUiToolbarToggleItem
								key={color}
								type="icon"
								value={color}
								data-isactive={isActive ? "true" : "false"}
								data-testid={`style.color.${color}`}
								title={`${title} - ${color}`}
								onClick={() => {
									onHistoryMark("point picker item");
									onColorSelect(color);
								}}
							>
								<span
									className="boardspace-style-panel__color-swatch"
									style={{
										color: getColorValue(theme, color, "solid"),
									}}
									aria-hidden="true"
								/>
							</TldrawUiToolbarToggleItem>
						);
					})}
					<TldrawUiToolbarToggleItem
						type="icon"
						value={BOARDSPACE_CUSTOM_COLOR}
						data-testid="style.color.custom"
						data-isactive={customActive ? "true" : "false"}
						title={`${title} - custom color`}
						aria-label={`${title} - custom color`}
						onClick={() => {
							const input = customInputRef.current;
							if (!input) {
								return;
							}

							if (typeof input.showPicker === "function") {
								input.showPicker();
								return;
							}

							input.click();
						}}
					>
						<span
							className="boardspace-style-panel__color-swatch boardspace-style-panel__color-swatch--custom"
							aria-hidden="true"
						>
							<span
								className="boardspace-style-panel__color-swatch-preview"
								style={{ backgroundColor: customPreviewColor }}
							/>
						</span>
						<input
							ref={customInputRef}
							className="boardspace-style-panel__color-input"
							type="color"
							value={normalizeBoardspaceCustomColor(customPreviewColor)}
							onChange={(event) => {
								onHistoryMark("pick custom note color");
								onCustomColorSelect(event.currentTarget.value);
							}}
						/>
					</TldrawUiToolbarToggleItem>
				</TldrawUiGrid>
			</TldrawUiToolbarToggleGroup>
		</TldrawUiToolbar>
	);
}

function BoardspaceSwatchColorPicker() {
	const { styles, onHistoryMark, onValueChange } = useStylePanelContext();
	const inputRef = useRef<HTMLInputElement>(null);
	const colorValue = styles.get(BoardSwatchColorValueStyle);
	const previewColor =
		colorValue?.type === "shared"
			? normalizeBoardSwatchColor(colorValue.value)
			: BOARD_SWATCH_DEFAULT_COLOR;

	return (
		<TldrawUiToolbar label="Swatch color">
			<button
				type="button"
				className="boardspace-style-panel__swatch-color-button"
				title="Choose swatch color"
				onClick={() => {
					const input = inputRef.current;
					if (!input) {
						return;
					}

					if (typeof input.showPicker === "function") {
						input.showPicker();
						return;
					}

					input.click();
				}}
			>
				<span
					className="boardspace-style-panel__swatch-color-preview"
					style={{ backgroundColor: previewColor }}
					aria-hidden="true"
				/>
				<span className="boardspace-style-panel__swatch-color-value">
					{colorValue?.type === "mixed" ? "Mixed colors" : previewColor.toUpperCase()}
				</span>
				<input
					ref={inputRef}
					className="boardspace-style-panel__color-input"
					type="color"
					value={previewColor}
					onChange={(event) => {
						onHistoryMark("pick swatch color");
						onValueChange(
							BoardSwatchColorValueStyle,
							normalizeBoardSwatchColor(event.currentTarget.value),
						);
					}}
				/>
			</button>
		</TldrawUiToolbar>
	);
}

function BoardspaceSwatchLabelModePicker() {
	const { styles, onHistoryMark, onValueChange } = useStylePanelContext();
	const labelMode = styles.get(BoardSwatchLabelModeStyle);

	if (!labelMode) {
		return null;
	}

	const items = [
		{ value: "none", label: "Off" },
		{ value: "hex", label: "Hex" },
		{ value: "rgb", label: "RGB" },
		{ value: "hsl", label: "HSL" },
	] as const;

	return (
		<TldrawUiToolbar label="Color label">
			<TldrawUiToolbarToggleGroup
				type="single"
				value={labelMode.type === "shared" ? labelMode.value : null}
				data-testid="style.swatch-label-mode"
				asChild
			>
				<TldrawUiGrid>
					{items.map((item) => {
						const isActive =
							labelMode.type === "shared" && labelMode.value === item.value;

						return (
							<TldrawUiToolbarToggleItem
								key={item.value}
								type="icon"
								value={item.value}
								data-isactive={isActive ? "true" : "false"}
								title={`Label format: ${item.label}`}
								onClick={() => {
									onHistoryMark("set swatch label mode");
									onValueChange(BoardSwatchLabelModeStyle, item.value);
								}}
							>
								<span className="boardspace-style-panel__text-toggle-label">
									{item.label}
								</span>
							</TldrawUiToolbarToggleItem>
						);
					})}
				</TldrawUiGrid>
			</TldrawUiToolbarToggleGroup>
		</TldrawUiToolbar>
	);
}

function getSelectedBoardspaceShapes(editor: Editor) {
	return editor
		.getSelectedShapes()
		.filter(
			(shape): shape is BoardspaceColorTargetShape =>
				shape.type === "board-note" ||
				shape.type === "board-column" ||
				shape.type === "board-todo",
		);
}

function updateSelectedBoardspaceShapes(
	editor: Editor,
	props:
		| Partial<BoardspaceColorTargetShape["props"]>
		| ((
				shape: BoardspaceColorTargetShape,
		  ) => Partial<BoardspaceColorTargetShape["props"]> | null),
) {
	const selectedShapes = getSelectedBoardspaceShapes(editor);

	if (selectedShapes.length === 0) {
		return;
	}

	editor.updateShapes(
		selectedShapes.flatMap((shape) => {
			const nextProps = typeof props === "function" ? props(shape) : props;

			if (!nextProps) {
				return [];
			}

			return {
				id: shape.id,
				type: shape.type,
				props: nextProps,
			};
		}),
	);
}
