import { TFile } from "obsidian";
import { useState } from "react";
import {
	ArrowShapeTool,
	DefaultHelperButtonsContent,
	DefaultNavigationPanel,
	DefaultRichTextToolbar,
	DefaultStylePanel,
	DefaultColorStyle,
	DefaultDashStyle,
	DrawShapeTool,
	EraserTool,
	HandTool,
	getColorValue,
	getDefaultColorTheme,
	kickoutOccludedShapes,
	StylePanelArrowheadPicker,
	StylePanelArrowKindPicker,
	StylePanelButtonPicker,
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
	BoardNoteShape,
	BoardNoteTopBarColorStyle,
} from "./board-note-shape";
import { BoardNoteTool } from "./board-note-tool";
import { BoardNoteShapeUtil } from "./board-note-shape";
import { BoardTodoShape, BoardTodoShapeUtil } from "./board-todo-shape";
import { BoardTodoTool } from "./board-todo-tool";
import { BoardspaceToolbar } from "./boardspace-toolbar";
import { BoardspaceZoomMenu } from "./boardspace-zoom-menu";
import {
	preventTldrawCanvasesCausingObsidianGestures,
	replaceCanvasDoubleClickWithBoardNote,
	syncTldrawThemeWithObsidian,
	watchObsidianThemeChanges,
} from "./tldraw-helpers";

interface BoardspaceEditorProps {
	file: TFile | null;
	loadKey: string;
	onSnapshotChange?: (snapshot: TLEditorSnapshot) => void;
	snapshot?: TLEditorSnapshot;
}

const BOARDSPACE_COMPONENTS: TLComponents = {
	ActionsMenu: null,
	ContextMenu: null,
	CursorChatBubble: null,
	DebugMenu: null,
	DebugPanel: null,
	Dialogs: null,
	FollowingIndicator: null,
	HelpMenu: null,
	HelperButtons: BoardspaceHelperButtons,
	ImageToolbar: null,
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
	tools(editor, tools) {
		return pickBoardspaceTools(editor, tools);
	},
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
] as const;
const BOARDSPACE_SHAPES = [
	BoardNoteShapeUtil,
	BoardTodoShapeUtil,
	BoardColumnShapeUtil,
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
	loadKey,
	onSnapshotChange,
	snapshot,
}: BoardspaceEditorProps) {
	const handleMount = (editor: Editor) => {
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
		const removeSnapshotListener = editor.store.listen(
			() => {
				onSnapshotChange?.(editor.getSnapshot());
			},
			{ source: "user", scope: "document" },
		);

		return () => {
			stopWatchingTheme();
			cleanupGestures?.();
			cleanupDoubleClick?.();
			cleanupColumnLayout?.();
			removeSnapshotListener();
		};
	};

	return (
		<div className="boardspace-editor" data-board-file={file?.path ?? ""}>
			<Tldraw
				autoFocus={false}
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

function BoardspaceStylePanel(props: TLUiStylePanelProps) {
	return (
		<DefaultStylePanel {...props}>
			<BoardspaceStylePanelContent />
		</DefaultStylePanel>
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
						shape.type === "board-todo",
				),
		[editor],
	);

	if (selectedStylableShapes.length === 0) {
		return <BoardspaceDefaultStylePanelContent />;
	}

	return (
		<>
			<StylePanelSection>
				<BoardspaceColorSection selectedShapes={selectedStylableShapes} />
				<StylePanelOpacityPicker />
			</StylePanelSection>
			<BoardspaceDefaultStylePanelContent
				omitFirstSection={true}
				useBoardspaceDashPicker={true}
			/>
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

type BoardspaceStylableShape = BoardNoteShape | BoardColumnShape | BoardTodoShape;

function BoardspaceColorSection({
	selectedShapes,
}: {
	selectedShapes: BoardspaceStylableShape[];
}) {
	const editor = useEditor();
	const [colorTarget, setColorTarget] = useState<"background" | "topBar">(
		"background",
	);
	const { styles, onHistoryMark, onValueChange } = useStylePanelContext();

	const allTopBarsEnabled = selectedShapes.every(
		(shape) => shape.props.topBarEnabled,
	);
	const pickerStyle =
		colorTarget === "topBar" ? BoardNoteTopBarColorStyle : DefaultColorStyle;
	const pickerValue = styles.get(pickerStyle);

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
					data-enabled={allTopBarsEnabled ? "true" : "false"}
					aria-pressed={colorTarget === "topBar"}
					title={
						allTopBarsEnabled
							? "Apply colors to the top strip"
							: "Turn on the top strip and apply colors to it"
					}
					onClick={() =>
						setColorTarget((currentTarget) => {
							const shouldDisableTopBar =
								currentTarget === "topBar" && allTopBarsEnabled;

							updateSelectedBoardspaceShapes(editor, {
								topBarEnabled: shouldDisableTopBar ? false : true,
							});

							return shouldDisableTopBar ? "background" : "topBar";
						})
					}
				>
					<span className="boardspace-style-panel__target-icon boardspace-style-panel__target-icon--top-bar" />
				</button>
			</div>
			<div
				key={colorTarget}
				className="boardspace-style-panel__note-color-picker"
			>
				{colorTarget === "topBar" ? (
					<BoardNoteTopBarColorPicker
						value={pickerValue}
						onHistoryMark={onHistoryMark}
						onValueChange={(value) => {
							onValueChange(BoardNoteTopBarColorStyle, value);
							updateSelectedBoardspaceShapes(editor, {
								topBarEnabled: true,
							});
						}}
					/>
				) : (
					<StylePanelButtonPicker
						title="Background color"
						uiType="color"
						style={pickerStyle}
						items={BOARDSPACE_COLOR_VALUES.map((color) => ({
							value: color,
							icon: "color",
						}))}
						value={pickerValue}
						onHistoryMark={onHistoryMark}
						onValueChange={onValueChange}
					/>
				)}
				<button
					type="button"
					className="tlui-button boardspace-style-panel__clear"
					title={
						colorTarget === "topBar"
							? "Clear top strip color"
							: "Clear background color"
					}
					onClick={() => {
						onHistoryMark("clear note color");

						if (colorTarget === "topBar") {
							updateSelectedBoardspaceShapes(editor, {
								topBarEnabled: false,
							});
							return;
						}

						updateSelectedBoardspaceShapes(editor, {
							fill: "none",
						});
					}}
				>
					<span className="tlui-button__label">Clear</span>
				</button>
			</div>
		</>
	);
}

function BoardNoteTopBarColorPicker({
	onHistoryMark,
	onValueChange,
	value,
}: {
	onHistoryMark: (id: string) => void;
	onValueChange: (value: string) => void;
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

	return (
		<TldrawUiToolbar label="Top strip color">
			<TldrawUiToolbarToggleGroup
				type="single"
				value={value?.type === "shared" ? value.value : null}
				asChild
			>
				<TldrawUiGrid>
					{BOARDSPACE_COLOR_VALUES.map((color) => {
						const isActive = value?.type === "shared" && value.value === color;

						return (
							<TldrawUiToolbarToggleItem
								key={color}
								type="icon"
								value={color}
								data-isactive={isActive ? "true" : "false"}
								title={`Top strip color - ${color}`}
								onClick={() => {
									onHistoryMark("point picker item");
									onValueChange(color);
								}}
								style={{
									color: getColorValue(theme, color, "solid"),
								}}
							>
								<TldrawUiButtonIcon icon="color" />
							</TldrawUiToolbarToggleItem>
						);
					})}
				</TldrawUiGrid>
			</TldrawUiToolbarToggleGroup>
		</TldrawUiToolbar>
	);
}

function updateSelectedBoardspaceShapes(
	editor: Editor,
	props: Partial<BoardspaceStylableShape["props"]>,
) {
	const selectedShapes = editor
		.getSelectedShapes()
		.filter(
			(shape): shape is BoardspaceStylableShape =>
				shape.type === "board-note" ||
				shape.type === "board-column" ||
				shape.type === "board-todo",
		);

	if (selectedShapes.length === 0) {
		return;
	}

	editor.updateShapes(
		selectedShapes.map((shape) => ({
			id: shape.id,
			type: shape.type,
			props,
		})),
	);
}
