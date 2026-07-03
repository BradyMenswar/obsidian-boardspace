import { App, Notice, SuggestModal, TFile, normalizePath } from "obsidian";
import {
	BaseBoxShapeUtil,
	DefaultDashStyle,
	DefaultFillStyle,
	DefaultSizeStyle,
	Editor,
	HTMLContainer,
	LABEL_FONT_SIZES,
	Rectangle2d,
	StyleProp,
	T,
	TLResizeInfo,
	TLShape,
	createShapePropsMigrationIds,
	createShapePropsMigrationSequence,
	resizeBox,
	useEditor,
	useIsEditing,
	useValue,
} from "tldraw";
import {
	CSSProperties,
	PointerEvent as ReactPointerEvent,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { getUniqueBoardspacePath } from "commands/create-new-boardspace";
import { activateBoardView } from "commands/util";
import { useBoardspaceFilePath } from "context/boardspace-file-context";
import { parseBoardspaceFile, serializeBoardspaceFile } from "files/boardspace-file";
import { isBoardspaceFile } from "files/boardspace-frontmatter";
import { useApp } from "hooks/use-app";
import {
	clearBoardColumnDrag,
	getBoardColumnDragState,
	startBoardColumnDrag,
	useBoardColumnDragState,
} from "./board-column-drag-state";
import { doesShapeOverlapBoardColumnBody } from "./board-column-overlap";
import {
	BOARDSPACE_DEFAULT_CUSTOM_COLOR,
	BOARDSPACE_TRANSPARENT_TOP_BAR_COLOR,
	BoardNoteTopBarColorStyle,
	BoardNoteTopBarCustomColorStyle,
	BoardspaceColorStyle,
	BoardspaceCustomColorStyle,
	getBoardspaceColorValue,
	normalizeBoardspaceCustomColor,
} from "./board-note-shape";
import {
	BoardLinkCounts,
	formatBoardLinkCounts,
	getBoardLinkCountsFromSnapshot,
} from "./board-link-counts";

export type BoardLinkShape = Extract<TLShape, { type: "board-link" }>;

export const BOARD_LINK_DEFAULT_WIDTH = 176;
export const BOARD_LINK_DEFAULT_HEIGHT = 220;
export const BOARD_LINK_COLUMN_HEIGHT = 108;
export const BOARD_LINK_STANDALONE_WIDTH = 210;
export const BOARD_LINK_STANDALONE_HEIGHT = 168;
export const BOARD_LINK_MIN_WIDTH = 132;
export const BOARD_LINK_MIN_HEIGHT = BOARD_LINK_COLUMN_HEIGHT;

const BOARD_LINK_ICON_VALUES = [
	"board",
	"bookmark",
	"folder",
	"lightbulb",
	"layers",
	"sparkle",
] as const;

export type BoardLinkIcon = (typeof BOARD_LINK_ICON_VALUES)[number];

export const BoardLinkIconStyle = StyleProp.defineEnum(
	"boardspace:board-link-icon",
	{
		defaultValue: "board",
		values: BOARD_LINK_ICON_VALUES,
	},
);

const boardLinkShapeVersions = createShapePropsMigrationIds("board-link", {
	Initial: 1,
});

const boardLinkShapeMigrations = createShapePropsMigrationSequence({
	sequence: [
		{
			id: boardLinkShapeVersions.Initial,
			up: (props) => {
				props.boardCount ??= 0;
				props.cardCount ??= 0;
				props.color ??= "grey";
				props.customColor ??= BOARDSPACE_DEFAULT_CUSTOM_COLOR;
				props.dash ??= "solid";
				props.filePath ??= "";
				props.fill ??= "semi";
				props.h ??= BOARD_LINK_DEFAULT_HEIGHT;
				props.icon ??= "board";
				props.size ??= "m";
				props.title ??= "Untitled board";
				props.topBarColor ??= BOARDSPACE_TRANSPARENT_TOP_BAR_COLOR;
				props.topBarCustomColor ??= "#f8fafc";
				props.w ??= BOARD_LINK_DEFAULT_WIDTH;
			},
			down: ({
				boardCount: _boardCount,
				cardCount: _cardCount,
				color: _color,
				customColor: _customColor,
				dash: _dash,
				filePath: _filePath,
				fill: _fill,
				icon: _icon,
				size: _size,
				topBarColor: _topBarColor,
				topBarCustomColor: _topBarCustomColor,
				...props
			}) => props,
		},
	],
});

export class BoardLinkShapeUtil extends BaseBoxShapeUtil<BoardLinkShape> {
	static override type = "board-link" as const;

	static override props = {
		boardCount: T.number,
		cardCount: T.number,
		color: BoardspaceColorStyle,
		customColor: BoardspaceCustomColorStyle,
		dash: DefaultDashStyle,
		filePath: T.string,
		fill: DefaultFillStyle,
		h: T.number,
		icon: BoardLinkIconStyle,
		size: DefaultSizeStyle,
		title: T.string,
		topBarColor: BoardNoteTopBarColorStyle,
		topBarCustomColor: BoardNoteTopBarCustomColorStyle,
		w: T.number,
	};

	static override migrations = boardLinkShapeMigrations;

	override canEdit() {
		return true;
	}

	override canResize() {
		return false;
	}

	override getDefaultProps(): BoardLinkShape["props"] {
		return {
			boardCount: 0,
			cardCount: 0,
			color: "grey",
			customColor: BOARDSPACE_DEFAULT_CUSTOM_COLOR,
			dash: "solid",
			filePath: "",
			fill: "semi",
			h: BOARD_LINK_STANDALONE_HEIGHT,
			icon: "board",
			size: "m",
			title: "Untitled board",
			topBarColor: BOARDSPACE_TRANSPARENT_TOP_BAR_COLOR,
			topBarCustomColor: "#f8fafc",
			w: BOARD_LINK_STANDALONE_WIDTH,
		};
	}

	override getGeometry(shape: BoardLinkShape) {
		return new Rectangle2d({
			width: shape.props.w,
			height: shape.props.h,
			isFilled: true,
		});
	}

	override getText(shape: BoardLinkShape) {
		return shape.props.title;
	}

	override hideRotateHandle() {
		return true;
	}

	override hideResizeHandles() {
		return true;
	}

	override onBeforeCreate(shape: BoardLinkShape) {
		return getBoardLinkFixedSizeShape(this.editor, shape);
	}

	override onBeforeUpdate(_prev: BoardLinkShape, next: BoardLinkShape) {
		return getBoardLinkFixedSizeShape(this.editor, next);
	}

	override onResize(shape: BoardLinkShape, info: TLResizeInfo<BoardLinkShape>) {
		return resizeBox(shape, info, {
			minHeight: BOARD_LINK_MIN_HEIGHT,
			minWidth: BOARD_LINK_MIN_WIDTH,
		});
	}

	override onTranslateStart(shape: BoardLinkShape) {
		const selectedShapeIds = this.editor.getSelectedShapeIds();
		if (selectedShapeIds.length !== 1 || selectedShapeIds[0] !== shape.id) {
			clearBoardColumnDrag(shape.id);
			return;
		}

		const parent = this.editor.getShape(shape.parentId);
		const sourceColumnId = parent?.type === "board-column" ? parent.id : null;
		startBoardColumnDrag(
			shape.id,
			sourceColumnId,
			shape.index,
			shape.y,
			shape.props.h,
		);

		if (sourceColumnId) {
			this.editor.updateShape({
				id: shape.id,
				type: shape.type,
				index: this.editor.getHighestIndexForParent(sourceColumnId),
			});
		}
	}

	override onTranslateEnd(shape: BoardLinkShape) {
		clearBoardColumnDrag(shape.id);

		let nextShape = this.editor.getShape(shape.id);
		if (!nextShape || nextShape.type !== "board-link") {
			return;
		}

		let parent = this.editor.getShape(nextShape.parentId);
		if (
			parent?.type === "board-column" &&
			!doesShapeOverlapBoardColumnBody(this.editor, parent, nextShape)
		) {
			this.editor.reparentShapes([nextShape], this.editor.getCurrentPageId());
			nextShape = this.editor.getShape(shape.id);
			if (!nextShape || nextShape.type !== "board-link") {
				return;
			}
			parent = this.editor.getShape(nextShape.parentId);
		}

		if (
			parent?.type === "board-column" ||
			(
				nextShape.props.h === BOARD_LINK_STANDALONE_HEIGHT &&
				nextShape.props.w === BOARD_LINK_STANDALONE_WIDTH
			)
		) {
			return;
		}

		this.editor.updateShape({
			id: nextShape.id,
			type: nextShape.type,
			props: {
				h: BOARD_LINK_STANDALONE_HEIGHT,
				w: BOARD_LINK_STANDALONE_WIDTH,
			},
		});
	}

	override onTranslateCancel(shape: BoardLinkShape) {
		const dragState = getBoardColumnDragState();
		if (
			dragState.draggedShapeId === shape.id &&
			dragState.sourceColumnId === shape.parentId &&
			dragState.sourceIndex
		) {
			this.editor.updateShape({
				id: shape.id,
				type: shape.type,
				index: dragState.sourceIndex,
			});
		}

		clearBoardColumnDrag(shape.id);
	}

	override component(shape: BoardLinkShape) {
		return <BoardLinkShapeView shape={shape} />;
	}

	override indicator(shape: BoardLinkShape) {
		return (
			<rect
				width={shape.props.w}
				height={shape.props.h}
			/>
		);
	}
}

function BoardLinkShapeView({ shape }: { shape: BoardLinkShape }) {
	const app = useApp();
	const boardspaceFilePath = useBoardspaceFilePath();
	const editor = useEditor();
	const isEditing = useIsEditing(shape.id);
	const dragState = useBoardColumnDragState();
	const titleInputRef = useRef<HTMLInputElement>(null);
	const cancelTitleEditRef = useRef(false);
	const draftTitleRef = useRef(shape.props.title);
	const wasEditingTitleRef = useRef(false);
	const [draftTitle, setDraftTitle] = useState(shape.props.title);
	const parentColumn = useValue(
		"board-link-parent-column",
		() => {
			const parent = editor.getShape(shape.parentId);
			return parent?.type === "board-column" ? parent : null;
		},
		[editor, shape.parentId],
	);
	const isInColumn = Boolean(parentColumn);
	const isInCollapsedColumn = Boolean(parentColumn?.props.collapsed);
	const isDraggedBoardColumnLink =
		dragState.draggedShapeId === shape.id && editor.isIn("select.translating");
	const isDarkMode = useValue(
		"board-link-dark-mode",
		() => editor.user.getIsDarkMode(),
		[editor],
	);
	const isSelected = useValue(
		"board-link-selected",
		() => editor.getSelectedShapeIds().includes(shape.id),
		[editor, shape.id],
	);
	const iconBlockStyles = useMemo(
		() =>
			getBoardLinkIconBlockStyles(
				shape.props.color,
				shape.props.customColor,
				shape.props.fill,
				isDarkMode,
			),
		[
			isDarkMode,
			shape.props.color,
			shape.props.customColor,
			shape.props.fill,
		],
	);
	const textColor = useMemo(
		() =>
			getBoardLinkIconTextColor(
				shape.props.topBarColor,
				shape.props.topBarCustomColor,
				isDarkMode,
			),
		[
			isDarkMode,
			shape.props.topBarColor,
			shape.props.topBarCustomColor,
		],
	);
	const countsLabel = useMemo(
		() =>
			formatBoardLinkCounts({
				boardCount: shape.props.boardCount,
				cardCount: shape.props.cardCount,
			}),
		[shape.props.boardCount, shape.props.cardCount],
	);
	const titleFontSize = useMemo(
		() => LABEL_FONT_SIZES[shape.props.size],
		[shape.props.size],
	);
	const titleStyles = useMemo(
		() =>
			({
				color: textColor,
				fontSize: titleFontSize,
			}) satisfies CSSProperties,
		[titleFontSize, textColor],
	);
	const countStyles = useMemo(
		() =>
			({
				color: textColor,
				fontSize: Math.max(11, Math.round(titleFontSize * 0.62)),
			}) satisfies CSSProperties,
		[titleFontSize, textColor],
	);
	const commitTitle = (
		value = titleInputRef.current?.value ?? draftTitleRef.current,
		options: { exitEditing?: boolean } = {},
	) => {
		const nextTitle = value.trim() || "Untitled board";
		draftTitleRef.current = nextTitle;
		setDraftTitle(nextTitle);
		editor.updateShape({
			id: shape.id,
			type: shape.type,
			props: {
				title: nextTitle,
			},
		});

		if (options.exitEditing ?? true) {
			editor.setEditingShape(null);
		}
	};

	useEffect(() => {
		if (isEditing || wasEditingTitleRef.current) {
			return;
		}

		draftTitleRef.current = shape.props.title;
		setDraftTitle(shape.props.title);
	}, [isEditing, shape.props.title]);

	useEffect(() => {
		if (isEditing) {
			wasEditingTitleRef.current = true;
			cancelTitleEditRef.current = false;
			draftTitleRef.current = shape.props.title;
			setDraftTitle(shape.props.title);
			return;
		}

		if (!wasEditingTitleRef.current) {
			return;
		}

		wasEditingTitleRef.current = false;

		if (cancelTitleEditRef.current) {
			cancelTitleEditRef.current = false;
			draftTitleRef.current = shape.props.title;
			setDraftTitle(shape.props.title);
			return;
		}

		commitTitle(draftTitleRef.current, { exitEditing: false });
	}, [isEditing, shape.props.title]);

	useEffect(() => {
		if (!isEditing) {
			return;
		}

		titleInputRef.current?.focus();
		titleInputRef.current?.select();
	}, [isEditing]);

	useEffect(() => {
		let isCancelled = false;

		void refreshBoardLinkCounts(app, shape.props.filePath).then((counts) => {
			if (isCancelled || !counts) {
				return;
			}

			const latestShape = editor.getShape(shape.id);
			if (!latestShape || latestShape.type !== "board-link") {
				return;
			}

			if (
				latestShape.props.boardCount === counts.boardCount &&
				latestShape.props.cardCount === counts.cardCount
			) {
				return;
			}

			editor.updateShape({
				id: latestShape.id,
				type: latestShape.type,
				props: counts,
			});
		});

		return () => {
			isCancelled = true;
		};
	}, [app, editor, shape.id, shape.props.filePath]);

	useEffect(() => {
		if (isInColumn) {
			return;
		}

		if (
			shape.props.w === BOARD_LINK_STANDALONE_WIDTH &&
			shape.props.h === BOARD_LINK_STANDALONE_HEIGHT
		) {
			return;
		}

		editor.updateShape({
			id: shape.id,
			type: shape.type,
			props: {
				h: BOARD_LINK_STANDALONE_HEIGHT,
				w: BOARD_LINK_STANDALONE_WIDTH,
			},
		});
	}, [editor, isInColumn, shape.id, shape.props.h, shape.props.w, shape.type]);

	const chooseTarget = async () => {
		const file = await chooseBoardspaceFile(app, {
			currentPath: shape.props.filePath,
			sourcePath: boardspaceFilePath,
		});

		if (!file) {
			return;
		}

		const counts = await refreshBoardLinkCounts(app, file.path);
		const latestShape = editor.getShape(shape.id);
		if (!latestShape || latestShape.type !== "board-link") {
			return;
		}

		editor.updateShape({
			id: latestShape.id,
			type: latestShape.type,
			props: {
				...(counts ?? { boardCount: 0, cardCount: 0 }),
				filePath: file.path,
				title:
					latestShape.props.title.trim().length > 0 &&
					latestShape.props.title !== "Untitled board"
						? latestShape.props.title
						: file.basename,
			},
		});
	};

	const openLinkedBoard = async () => {
		const file = app.vault.getAbstractFileByPath(shape.props.filePath);
		if (!(file instanceof TFile)) {
			await chooseTarget();
			return;
		}

		await activateBoardView(app, file, app.workspace.getLeaf(false), {
			history: true,
		});
	};

	return (
		<HTMLContainer
			className="boardspace-board-link-shape"
			data-in-column={isInColumn ? "true" : "false"}
			data-dragging={isDraggedBoardColumnLink ? "true" : "false"}
			style={{
				height: shape.props.h,
				opacity: isInCollapsedColumn ? 0 : isDraggedBoardColumnLink ? 0.8 : 1,
				pointerEvents: isInCollapsedColumn ? "none" : "all",
				position: "relative",
				visibility: isInCollapsedColumn ? "hidden" : "visible",
				width: shape.props.w,
				zIndex: isDraggedBoardColumnLink ? 10 : undefined,
			}}
		>
			<div
				className="boardspace-board-link-shape__inner"
				data-in-column={isInColumn ? "true" : "false"}
				data-selected={isSelected ? "true" : "false"}
			>
				<button
					type="button"
					className="boardspace-board-link-shape__icon"
					title={
						shape.props.filePath ? "Open linked board" : "Choose linked board"
					}
					style={{
						...iconBlockStyles,
						color: textColor,
					}}
					onPointerDown={(event) => stopBoardLinkButtonEvent(editor, event)}
					onClick={(event) => {
						event.stopPropagation();
						editor.markEventAsHandled(event);
						void openLinkedBoard();
					}}
				>
					<BoardLinkIconGlyph icon={shape.props.icon} />
				</button>
				<div className="boardspace-board-link-shape__copy">
					{isEditing ? (
						<input
							ref={titleInputRef}
							className="boardspace-board-link-shape__title-input"
							style={titleStyles}
							value={draftTitle}
							onChange={(event) => {
								draftTitleRef.current = event.currentTarget.value;
								setDraftTitle(event.currentTarget.value);
							}}
							onPointerDown={(event) => stopBoardLinkButtonEvent(editor, event)}
							onBlur={(event) => {
								if (cancelTitleEditRef.current) {
									return;
								}

								commitTitle(event.currentTarget.value);
							}}
							onKeyDown={(event) => {
								if (event.key === "Enter") {
									event.preventDefault();
									commitTitle(event.currentTarget.value);
								}

								if (event.key === "Escape") {
									event.preventDefault();
									cancelTitleEditRef.current = true;
									draftTitleRef.current = shape.props.title;
									setDraftTitle(shape.props.title);
									editor.setEditingShape(null);
								}
							}}
						/>
					) : (
						<button
							type="button"
							className="boardspace-board-link-shape__title"
							style={titleStyles}
							title="Rename board link"
							onPointerDown={(event) => stopBoardLinkButtonEvent(editor, event)}
							onClick={(event) => {
								event.stopPropagation();
								editor.markEventAsHandled(event);
								editor.setEditingShape(shape.id);
							}}
						>
							{shape.props.title}
						</button>
					)}
					<div
						className="boardspace-board-link-shape__counts"
						style={countStyles}
					>
						{countsLabel}
					</div>
					{shape.props.filePath ? null : (
						<button
							type="button"
							className="boardspace-board-link-shape__target"
							style={{ color: isInColumn ? undefined : textColor }}
							onPointerDown={(event) => stopBoardLinkButtonEvent(editor, event)}
							onClick={(event) => {
								event.stopPropagation();
								editor.markEventAsHandled(event);
								void chooseTarget();
							}}
						>
							Choose board
						</button>
					)}
				</div>
			</div>
		</HTMLContainer>
	);
}

export function BoardLinkIconGlyph({ icon }: { icon: BoardLinkIcon }) {
	switch (icon) {
		case "bookmark":
			return (
				<svg viewBox="0 0 24 24" aria-hidden="true">
					<path d="M7 4.8A2.8 2.8 0 0 1 9.8 2h4.4A2.8 2.8 0 0 1 17 4.8V21l-5-3.2L7 21V4.8Z" />
				</svg>
			);
		case "folder":
			return (
				<svg viewBox="0 0 24 24" aria-hidden="true">
					<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h5.2l2 2H19A2.5 2.5 0 0 1 21.5 9.5v7A2.5 2.5 0 0 1 19 19H5.5A2.5 2.5 0 0 1 3 16.5v-9Z" />
				</svg>
			);
		case "layers":
			return (
				<svg viewBox="0 0 24 24" aria-hidden="true">
					<path d="m12 3 9 5-9 5-9-5 9-5Z" />
					<path d="m4.8 12 7.2 4 7.2-4 1.8 1-9 5-9-5 1.8-1Z" />
					<path d="m4.8 16 7.2 4 7.2-4 1.8 1-9 5-9-5 1.8-1Z" />
				</svg>
			);
		case "lightbulb":
			return (
				<svg viewBox="0 0 24 24" aria-hidden="true">
					<path d="M9 20h6v-2H9v2Zm3-18a7 7 0 0 0-4 12.7V16h8v-1.3A7 7 0 0 0 12 2Zm0 3a4 4 0 0 1 2.3 7.3l-1.3.9V14h-2v-.8l-1.3-.9A4 4 0 0 1 12 5Z" />
				</svg>
			);
		case "sparkle":
			return (
				<svg viewBox="0 0 24 24" aria-hidden="true">
					<path d="m12 2 2.2 6.1L20 10.5l-5.8 2.4L12 19l-2.2-6.1L4 10.5l5.8-2.4L12 2Z" />
					<path d="m19 15 1 2.6 2.5 1-2.5 1-1 2.4-1-2.4-2.5-1 2.5-1 1-2.6Z" />
				</svg>
			);
		case "board":
		default:
			return (
				<svg viewBox="0 0 24 24" aria-hidden="true">
					<path d="M5 4h11l3 3v13H5V4Zm10 1.8V8h2.2L15 5.8Z" />
					<path d="M8 11h8v1.8H8V11Zm0 4h6v1.8H8V15Z" />
				</svg>
			);
	}
}

function getBoardLinkIconTextColor(
	color: BoardLinkShape["props"]["topBarColor"],
	customColor: string,
	isDarkMode: boolean,
) {
	if (color === BOARDSPACE_TRANSPARENT_TOP_BAR_COLOR) {
		return "var(--text-normal)";
	}

	if (color === "custom") {
		return normalizeBoardspaceCustomColor(customColor);
	}

	return getBoardspaceColorValue(color, customColor, isDarkMode, "solid");
}

function getBoardLinkIconBlockStyles(
	color: BoardLinkShape["props"]["color"],
	customColor: string,
	fill: BoardLinkShape["props"]["fill"],
	isDarkMode: boolean,
): CSSProperties {
	const baseFill =
		fill === "none" || fill === "pattern" || fill === "lined-fill"
			? "semi"
			: fill;
	const patternColor = getBoardspaceColorValue(
		color,
		customColor,
		isDarkMode,
		"pattern",
	);

	return {
		backgroundColor:
			fill === "none"
				? "transparent"
				: getBoardspaceColorValue(color, customColor, isDarkMode, baseFill),
		backgroundImage:
			fill === "pattern"
				? `linear-gradient(45deg, ${patternColor} 12.5%, transparent 12.5%, transparent 50%, ${patternColor} 50%, ${patternColor} 62.5%, transparent 62.5%, transparent 100%)`
				: fill === "lined-fill"
					? `linear-gradient(0deg, transparent, transparent 11px, ${patternColor} 11px, ${patternColor} 12px)`
					: "none",
		backgroundSize:
			fill === "pattern"
				? "12px 12px"
				: fill === "lined-fill"
					? "100% 12px"
					: undefined,
	};
}

export function getBoardLinkIconValues() {
	return BOARD_LINK_ICON_VALUES;
}

export async function refreshBoardLinkCounts(
	app: App,
	filePath: string,
): Promise<BoardLinkCounts | null> {
	if (!filePath) {
		return { boardCount: 0, cardCount: 0 };
	}

	const file = app.vault.getAbstractFileByPath(filePath);
	if (!(file instanceof TFile)) {
		return null;
	}

	try {
		const contents = await app.vault.cachedRead(file);
		return getBoardLinkCountsFromSnapshot(parseBoardspaceFile(contents));
	} catch (error) {
		console.error("Boardspace failed to read linked board.", error);
		return null;
	}
}

export function chooseBoardspaceFile(
	app: App,
	options: { currentPath?: string; sourcePath?: string } = {},
) {
	return new Promise<TFile | null>((resolve) => {
		new BoardspaceFileSuggestModal(
			app,
			resolve,
			options.currentPath,
			options.sourcePath,
		).open();
	});
}

function stopBoardLinkButtonEvent(
	editor: Editor,
	event: ReactPointerEvent<HTMLElement>,
) {
	event.stopPropagation();
	editor.markEventAsHandled(event);
}

type BoardspaceFileSuggestion =
	| {
			type: "create";
	  }
	| {
			type: "file";
			file: TFile;
	  };

class BoardspaceFileSuggestModal extends SuggestModal<BoardspaceFileSuggestion> {
	private readonly currentPath: string | undefined;
	private readonly resolve: (file: TFile | null) => void;
	private readonly sourcePath: string | undefined;
	private settled = false;
	private files: TFile[] = [];
	private isChoosing = false;
	private readonly loadFilesPromise: Promise<void>;

	constructor(
		app: App,
		resolve: (file: TFile | null) => void,
		currentPath: string | undefined,
		sourcePath: string | undefined,
	) {
		super(app);
		this.currentPath = currentPath;
		this.resolve = resolve;
		this.sourcePath = sourcePath;
		this.emptyStateText = "No boardspace files found";
		this.setPlaceholder("Choose a board or create one");
		this.setInstructions([
			{ command: "Enter", purpose: "Select board" },
			{ command: "Esc", purpose: "Cancel" },
		]);
		this.loadFilesPromise = this.loadFiles();
	}

	async getSuggestions(query: string) {
		await this.loadFilesPromise;

		const normalizedQuery = query.trim().toLowerCase();
		const fileSuggestions = this.files
			.filter((file) => {
				if (!normalizedQuery) {
					return true;
				}

				return (
					file.basename.toLowerCase().includes(normalizedQuery) ||
					file.path.toLowerCase().includes(normalizedQuery)
				);
			})
			.slice(0, 24)
			.map((file) => ({ type: "file", file }) satisfies BoardspaceFileSuggestion);

		return [{ type: "create" } satisfies BoardspaceFileSuggestion, ...fileSuggestions];
	}

	renderSuggestion(value: BoardspaceFileSuggestion, el: HTMLElement) {
		el.empty();

		if (value.type === "create") {
			el.createDiv({
				cls: "boardspace-board-link-suggest__title",
				text: "Create new board",
			});
			el.createDiv({
				cls: "boardspace-board-link-suggest__path",
				text: "Create a linked Boardspace note in the current folder",
			});
			return;
		}

		el.createDiv({
			cls: "boardspace-board-link-suggest__title",
			text: value.file.basename,
		});
		el.createDiv({
			cls: "boardspace-board-link-suggest__path",
			text: value.file.path,
		});
	}

	async onChooseSuggestion(item: BoardspaceFileSuggestion) {
		this.isChoosing = true;

		if (item.type === "file") {
			this.finish(item.file);
			return;
		}

		try {
			const folderPath = getNewBoardFolderPath(this.app, this.sourcePath);
			const filePath = getUniqueBoardspacePath(this.app, folderPath);
			const file = await this.app.vault.create(
				filePath,
				serializeBoardspaceFile(undefined),
			);
			this.finish(file);
		} catch (error) {
			console.error("Boardspace failed to create linked board.", error);
			new Notice("Boardspace could not create the linked board.");
			this.finish(null);
		}
	}

	onClose() {
		window.setTimeout(() => {
			if (!this.settled && !this.isChoosing) {
				this.finish(null);
			}
		});

		super.onClose();
	}

	private async loadFiles() {
		const files = await Promise.all(
			this.app.vault
				.getMarkdownFiles()
				.map(async (file) => {
					try {
						return (await isBoardspaceFile(this.app, file)) ? file : null;
					} catch {
						return null;
					}
				}),
		);

		this.files = files
			.filter((file): file is TFile => Boolean(file))
			.sort((a, b) => a.path.localeCompare(b.path));
	}

	private finish(file: TFile | null) {
		if (this.settled) {
			return;
		}

		this.settled = true;
		this.resolve(file);
		this.close();
	}
}

function getBoardLinkFixedSizeShape(editor: Editor, shape: BoardLinkShape) {
	const parent = editor.getShape(shape.parentId);
	const isInColumn = parent?.type === "board-column";
	const width = isInColumn ? shape.props.w : BOARD_LINK_STANDALONE_WIDTH;
	const height = isInColumn ? BOARD_LINK_COLUMN_HEIGHT : BOARD_LINK_STANDALONE_HEIGHT;

	if (shape.props.w === width && shape.props.h === height) {
		return;
	}

	return {
		...shape,
		props: {
			...shape.props,
			h: height,
			w: width,
		},
	};
}

function getNewBoardFolderPath(app: App, currentPath: string | undefined) {
	if (currentPath) {
		const currentFile = app.vault.getAbstractFileByPath(currentPath);
		if (currentFile instanceof TFile && currentFile.parent) {
			return currentFile.parent.path;
		}

		const slashIndex = currentPath.lastIndexOf("/");
		if (slashIndex > 0) {
			return normalizePath(currentPath.slice(0, slashIndex));
		}
	}

	return app.fileManager.getNewFileParent(
		app.workspace.getActiveFile()?.path ?? "",
	).path;
}
