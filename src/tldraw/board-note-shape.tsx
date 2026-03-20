import {
	BaseBoxShapeUtil,
	createShapePropsMigrationIds,
	createShapePropsMigrationSequence,
	DefaultColorStyle,
	Editor,
	getColorValue,
	getDefaultColorTheme,
	HTMLContainer,
	isEqual,
	resizeBox,
	T,
	TLResizeInfo,
	TLShape,
	useEditor,
	useIsEditing,
	useValue,
} from "@tldraw/editor";
import {
	DefaultFillStyle,
	DefaultSizeStyle,
	StyleProp,
	TLDefaultColorStyle,
	TLDefaultFillStyle,
	TLDefaultSizeStyle,
	TLRichText,
	defaultColorNames,
	richTextValidator,
	toRichText,
} from "@tldraw/tlschema";
import {
	CSSProperties,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
} from "react";
import {
	FONT_FAMILIES,
	LABEL_FONT_SIZES,
	RichTextLabel,
	TEXT_PROPS,
	renderHtmlFromRichTextForMeasurement,
	renderPlaintextFromRichText,
} from "tldraw";
import {
	BOARD_NOTE_DEFAULT_WIDTH,
	BOARD_NOTE_MIN_HEIGHT,
	BOARD_NOTE_MIN_WIDTH,
	snapBoardNoteWidth,
} from "./board-note-config";

export type BoardNoteShape = Extract<TLShape, { type: "board-note" }>;

const BOARD_NOTE_PADDING = 16;
const BOARD_NOTE_MEASUREMENT_FUZZ = 1;

export const BoardNoteTopBarColorStyle = StyleProp.defineEnum(
	"boardspace:top-bar-color",
	{
		defaultValue: "black",
		values: defaultColorNames,
	},
);

const boardNoteShapeVersions = createShapePropsMigrationIds("board-note", {
	AddColor: 1,
	AddMinHeight: 2,
	AddTopBar: 3,
	UseRichText: 4,
});

const boardNoteShapeMigrations = createShapePropsMigrationSequence({
	sequence: [
		{
			id: boardNoteShapeVersions.AddColor,
			up: (props) => {
				props.color = "black";
			},
			down: ({ color: _color, ...props }) => props,
		},
		{
			id: boardNoteShapeVersions.AddMinHeight,
			up: (props) => {
				props.minH = typeof props.h === "number" ? props.h : BOARD_NOTE_MIN_HEIGHT;
			},
			down: ({ minH: _minH, ...props }) => props,
		},
		{
			id: boardNoteShapeVersions.AddTopBar,
			up: (props) => {
				props.topBarColor =
					typeof props.color === "string" ? props.color : "black";
				props.topBarEnabled = false;
			},
			down: ({ topBarColor: _topBarColor, topBarEnabled: _topBarEnabled, ...props }) =>
				props,
		},
		{
			id: boardNoteShapeVersions.UseRichText,
			up: (props) => {
				props.fill = "semi";
				props.richText = toRichText(
					typeof props.markdown === "string" ? props.markdown : "",
				);
				props.size = "m";
				delete props.markdown;
			},
			down: ({ fill: _fill, richText, size: _size, ...props }) => {
				props.markdown = getLegacyMarkdownFromRichText(richText);
				return props;
			},
		},
	],
});

export class BoardNoteShapeUtil extends BaseBoxShapeUtil<BoardNoteShape> {
	static override type = "board-note" as const;

	static override props = {
		color: DefaultColorStyle,
		fill: DefaultFillStyle,
		h: T.number,
		minH: T.number,
		richText: richTextValidator,
		size: DefaultSizeStyle,
		topBarColor: BoardNoteTopBarColorStyle,
		topBarEnabled: T.boolean,
		w: T.number,
	};

	static override migrations = boardNoteShapeMigrations;

	override canEdit() {
		return true;
	}

	override getDefaultProps(): BoardNoteShape["props"] {
		return {
			color: "black",
			fill: "semi",
			h: BOARD_NOTE_MIN_HEIGHT,
			minH: BOARD_NOTE_MIN_HEIGHT,
			richText: toRichText(""),
			size: "m",
			topBarColor: "black",
			topBarEnabled: false,
			w: BOARD_NOTE_DEFAULT_WIDTH,
		};
	}

	override hideResizeHandles() {
		return false;
	}

	override hideRotateHandle() {
		return true;
	}

	override onResize(shape: BoardNoteShape, info: TLResizeInfo<BoardNoteShape>) {
		const resized = resizeBox(shape, info, {
			minHeight: BOARD_NOTE_MIN_HEIGHT,
			minWidth: BOARD_NOTE_MIN_WIDTH,
		});
		const snappedWidth = shouldSnapBoardNoteWidth(info)
			? snapBoardNoteWidth(resized.props.w)
			: resized.props.w;
		const nextMinHeight = Math.max(BOARD_NOTE_MIN_HEIGHT, resized.props.h);

		return {
			...resized,
			props: {
				...resized.props,
				h: nextMinHeight,
				minH: nextMinHeight,
				w: snappedWidth,
			},
		};
	}

	override component(shape: BoardNoteShape) {
		return <BoardNoteShapeView shape={shape} />;
	}

	override getText(shape: BoardNoteShape) {
		return renderPlaintextFromRichText(this.editor, shape.props.richText);
	}

	override onBeforeCreate(shape: BoardNoteShape) {
		return getBoardNoteSizeAdjustments(this.editor, shape);
	}

	override onBeforeUpdate(prev: BoardNoteShape, next: BoardNoteShape) {
		if (
			prev.props.minH === next.props.minH &&
			prev.props.size === next.props.size &&
			prev.props.w === next.props.w &&
			isEqual(prev.props.richText, next.props.richText)
		) {
			return;
		}

		return getBoardNoteSizeAdjustments(this.editor, next);
	}

	override indicator(shape: BoardNoteShape) {
		return (
			<rect
				width={shape.props.w}
				height={shape.props.h}
			/>
		);
	}
}

function BoardNoteShapeView({ shape }: { shape: BoardNoteShape }) {
	const editor = useEditor();
	const isEditing = useIsEditing(shape.id);
	const isDarkMode = useValue(
		"board-note-dark-mode",
		() => editor.user.getIsDarkMode(),
		[editor],
	);
	const isSelected = useValue(
		"board-note-selected",
		() => editor.getSelectedShapeIds().includes(shape.id),
		[editor, shape.id],
	);
	const text = useMemo(
		() => renderPlaintextFromRichText(editor, shape.props.richText),
		[editor, shape.props.richText],
	);
	const hasContent = text.trim().length > 0;
	const cardStyles = useMemo(
		() =>
			getBoardNoteCardStyles(
				shape.props.color,
				shape.props.fill,
				isDarkMode,
			),
		[isDarkMode, shape.props.color, shape.props.fill],
	);
	const topBarStyles = useMemo(
		() => getBoardNoteBarStyles(shape.props.topBarColor, isDarkMode),
		[isDarkMode, shape.props.topBarColor],
	);
	const textColor = useMemo(
		() => getBoardNoteTextColor(shape.props.color, isDarkMode),
		[isDarkMode, shape.props.color],
	);
	const placeholderStyles = useMemo(
		() =>
			({
				fontFamily: "var(--tl-font-sans)",
				fontSize: LABEL_FONT_SIZES[shape.props.size],
				lineHeight: TEXT_PROPS.lineHeight.toString(),
			}) as CSSProperties,
		[shape.props.size],
	);

	return (
		<HTMLContainer
			className="boardspace-note-shape"
			style={{
				height: shape.props.h,
				width: shape.props.w,
			}}
			onDoubleClick={() => editor.setEditingShape(shape.id)}
		>
			<div
				className="boardspace-note-shape__inner"
				data-editing={isEditing ? "true" : "false"}
				style={cardStyles}
			>
				{shape.props.topBarEnabled ? (
					<div
						className="boardspace-note-shape__top-bar"
						style={topBarStyles}
					/>
				) : null}
				{!hasContent && !isEditing ? (
					<div
						className="boardspace-note-shape__placeholder"
						style={placeholderStyles}
					>
						Start typing...
					</div>
				) : (
					<div className="boardspace-note-shape__text-shell">
						<RichTextLabel
							shapeId={shape.id}
							type={shape.type}
							richText={shape.props.richText}
							font="sans"
							fontSize={LABEL_FONT_SIZES[shape.props.size]}
							lineHeight={TEXT_PROPS.lineHeight}
							align="start"
							verticalAlign="middle"
							wrap={true}
							isSelected={isSelected}
							labelColor={textColor}
							padding={0}
							classNamePrefix="boardspace-note-shape__text"
							showTextOutline={false}
						/>
					</div>
				)}
			</div>
		</HTMLContainer>
	);
}

function getBoardNoteCardStyles(
	color: TLDefaultColorStyle,
	fill: TLDefaultFillStyle,
	isDarkMode: boolean,
) : CSSProperties {
	const theme = getDefaultColorTheme({ isDarkMode });
	const patternColor = getColorValue(theme, color, "pattern");
	const baseFill =
		fill === "none" || fill === "pattern" || fill === "lined-fill"
			? "semi"
			: fill;

	return {
		backgroundColor:
			fill === "none" ? "transparent" : getColorValue(theme, color, baseFill),
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
		"--boardspace-note-placeholder-color": "var(--text-faint)",
	} as CSSProperties;
}

function getBoardNoteTextColor(
	color: TLDefaultColorStyle,
	isDarkMode: boolean,
) {
	const theme = getDefaultColorTheme({ isDarkMode });
	return getColorValue(theme, color, "noteText");
}

function shouldSnapBoardNoteWidth(info: TLResizeInfo<BoardNoteShape>) {
	return (
		info.handle === "right" ||
		info.handle === "top_right" ||
		info.handle === "bottom_right"
	);
}

function getBoardNoteBarStyles(
	color: TLDefaultColorStyle,
	isDarkMode: boolean,
): CSSProperties {
	const theme = getDefaultColorTheme({ isDarkMode });

	return {
		backgroundColor: getColorValue(theme, color, "solid"),
	};
}

function getBoardNoteSizeAdjustments(
	editor: Editor,
	shape: BoardNoteShape,
): BoardNoteShape | undefined {
	const measuredHeight = getBoardNoteMeasuredHeight(editor, shape);
	const nextHeight = Math.max(BOARD_NOTE_MIN_HEIGHT, shape.props.minH, measuredHeight);

	if (Math.abs(shape.props.h - nextHeight) < 1) {
		return;
	}

	return {
		...shape,
		props: {
			...shape.props,
			h: nextHeight,
		},
	};
}

function getBoardNoteMeasuredHeight(editor: Editor, shape: BoardNoteShape) {
	const fontSize = LABEL_FONT_SIZES[shape.props.size];
	const minTextHeight = Math.ceil(fontSize * TEXT_PROPS.lineHeight);
	const availableWidth = Math.max(
		1,
		shape.props.w - BOARD_NOTE_PADDING * 2 - BOARD_NOTE_MEASUREMENT_FUZZ,
	);

	const plainText = renderPlaintextFromRichText(editor, shape.props.richText);
	if (!plainText.trim()) {
		return minTextHeight + BOARD_NOTE_PADDING * 2;
	}

	const html = renderHtmlFromRichTextForMeasurement(editor, shape.props.richText);
	const textSize = editor.textMeasure.measureHtml(html, {
		...TEXT_PROPS,
		fontFamily: FONT_FAMILIES.sans,
		fontSize,
		maxWidth: availableWidth,
	});

	return Math.ceil(textSize.h) + BOARD_NOTE_PADDING * 2;
}

function getLegacyMarkdownFromRichText(richText: TLRichText | undefined) {
	if (!richText || !Array.isArray(richText.content)) {
		return "";
	}

	return richText.content
		.map((node) => getPlainTextFromRichTextNode(node))
		.filter((value) => value.length > 0)
		.join("\n");
}

function getPlainTextFromRichTextNode(node: unknown): string {
	if (!node || typeof node !== "object") {
		return "";
	}

	const value = node as {
		content?: unknown[];
		text?: string;
		type?: string;
	};

	if (value.type === "hardBreak") {
		return "\n";
	}

	if (typeof value.text === "string") {
		return value.text;
	}

	if (!Array.isArray(value.content)) {
		return "";
	}

	return value.content.map((child) => getPlainTextFromRichTextNode(child)).join("");
}
