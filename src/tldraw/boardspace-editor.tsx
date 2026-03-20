import { TFile } from "obsidian";
import { useState } from "react";
import {
	ArrowShapeTool,
	DefaultHelperButtonsContent,
	DefaultNavigationPanel,
	DefaultRichTextToolbar,
	DefaultStylePanel,
	DrawShapeTool,
	EraserTool,
	HandTool,
	DefaultColorStyle,
	getColorValue,
	getDefaultColorTheme,
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
	DefaultToolbar,
	DefaultZoomMenu,
	Editor,
	SelectTool,
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
	BoardNoteShape,
	BoardNoteTopBarColorStyle,
} from "./board-note-shape";
import { BoardNoteTool } from "./board-note-tool";
import { BoardNoteShapeUtil } from "./board-note-shape";
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
	VideoToolbar: null,
	ZoomMenu: DefaultZoomMenu,
	Toolbar: DefaultToolbar,
};

const BOARDSPACE_OVERRIDES: TLUiOverrides = {
	tools(_editor, tools) {
		return pickBoardspaceTools(tools);
	},
};

const BOARDSPACE_TOOLS = [
	SelectTool,
	HandTool,
	DrawShapeTool,
	ArrowShapeTool,
	EraserTool,
	BoardNoteTool,
] as const;
const BOARDSPACE_SHAPES = [BoardNoteShapeUtil] as const;
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

		const stopWatchingTheme = watchObsidianThemeChanges(
			syncTldrawThemeWithObsidian,
		);
		const cleanupGestures =
			preventTldrawCanvasesCausingObsidianGestures(editor);
		const cleanupDoubleClick =
			replaceCanvasDoubleClickWithBoardNote(editor);
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

function pickBoardspaceTools(tools: TLUiToolsContextType): TLUiToolsContextType {
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

function BoardspaceStylePanel(props: TLUiStylePanelProps) {
	return (
		<DefaultStylePanel {...props}>
			<BoardspaceStylePanelContent />
		</DefaultStylePanel>
	);
}

function BoardspaceStylePanelContent() {
	const editor = useEditor();
	const selectedNotes = useValue(
		"selected-board-notes-style-panel",
		() =>
			editor
				.getSelectedShapes()
				.filter((shape): shape is BoardNoteShape => shape.type === "board-note"),
		[editor],
	);

	if (selectedNotes.length === 0) {
		return <BoardspaceDefaultStylePanelContent />;
	}

	return (
		<>
			<StylePanelSection>
				<BoardNoteColorSection selectedNotes={selectedNotes} />
				<StylePanelOpacityPicker />
			</StylePanelSection>
			<BoardspaceDefaultStylePanelContent omitFirstSection={true} />
		</>
	);
}

function BoardspaceDefaultStylePanelContent({
	omitFirstSection = false,
}: {
	omitFirstSection?: boolean;
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
				<StylePanelDashPicker />
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

function BoardNoteColorSection({
	selectedNotes,
}: {
	selectedNotes: BoardNoteShape[];
}) {
	const editor = useEditor();
	const [colorTarget, setColorTarget] = useState<"background" | "topBar">(
		"background",
	);
	const { styles, onHistoryMark, onValueChange } = useStylePanelContext();

	const allTopBarsEnabled = selectedNotes.every(
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

							updateSelectedBoardNotes(editor, {
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
							updateSelectedBoardNotes(editor, {
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
							updateSelectedBoardNotes(editor, {
								topBarEnabled: false,
							});
							return;
						}

						updateSelectedBoardNotes(editor, {
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

function updateSelectedBoardNotes(
	editor: Editor,
	props: Partial<BoardNoteShape["props"]>,
) {
	const selectedNotes = editor
		.getSelectedShapes()
		.filter((shape): shape is BoardNoteShape => shape.type === "board-note");

	if (selectedNotes.length === 0) {
		return;
	}

	editor.updateShapes(
		selectedNotes.map((shape) => ({
			id: shape.id,
			type: shape.type,
			props,
		})),
	);
}
