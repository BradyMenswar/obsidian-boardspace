import {
	BaseBoxShapeUtil,
	HTMLContainer,
	Rectangle2d,
	StyleProp,
	T,
	TLResizeInfo,
	TLShape,
	createShapePropsMigrationIds,
	createShapePropsMigrationSequence,
	resizeBox,
	useEditor,
	useValue,
} from "tldraw";
import { CSSProperties, useMemo } from "react";
import {
	BOARD_SWATCH_DEFAULT_HEIGHT,
	BOARD_SWATCH_DEFAULT_WIDTH,
	BOARD_SWATCH_MIN_HEIGHT,
	BOARD_SWATCH_MIN_WIDTH,
} from "./board-swatch-config";
import {
	clearBoardColumnDrag,
	getBoardColumnDragState,
	startBoardColumnDrag,
	useBoardColumnDragState,
} from "./board-column-drag-state";

export type BoardSwatchShape = Extract<TLShape, { type: "board-swatch" }>;

export const BOARD_SWATCH_DEFAULT_COLOR = "#6b7280";
const BOARD_SWATCH_LABEL_MODE_VALUES = [
	"none",
	"hex",
	"rgb",
	"hsl",
] as const;

export const BoardSwatchColorValueStyle = StyleProp.define(
	"boardspace:swatch-color-value",
	{
		defaultValue: BOARD_SWATCH_DEFAULT_COLOR,
		type: T.string,
	},
);

export const BoardSwatchLabelModeStyle = StyleProp.defineEnum(
	"boardspace:swatch-label-mode",
	{
		defaultValue: "none",
		values: BOARD_SWATCH_LABEL_MODE_VALUES,
	},
);

const boardSwatchShapeVersions = createShapePropsMigrationIds("board-swatch", {
	AddLabelMode: 1,
});

const boardSwatchShapeMigrations = createShapePropsMigrationSequence({
	sequence: [
		{
			id: boardSwatchShapeVersions.AddLabelMode,
			up: (props) => {
				props.colorValue ??= BOARD_SWATCH_DEFAULT_COLOR;
				props.labelMode ??= "none";
			},
			down: ({ labelMode: _labelMode, ...props }) => props,
		},
	],
});

export class BoardSwatchShapeUtil extends BaseBoxShapeUtil<BoardSwatchShape> {
	static override type = "board-swatch" as const;

	static override props = {
		colorValue: BoardSwatchColorValueStyle,
		h: T.number,
		labelMode: BoardSwatchLabelModeStyle,
		w: T.number,
	};

	static override migrations = boardSwatchShapeMigrations;

	override canEdit() {
		return false;
	}

	override canResize() {
		return true;
	}

	override getDefaultProps(): BoardSwatchShape["props"] {
		return {
			colorValue: BOARD_SWATCH_DEFAULT_COLOR,
			h: BOARD_SWATCH_DEFAULT_HEIGHT,
			labelMode: "none",
			w: BOARD_SWATCH_DEFAULT_WIDTH,
		};
	}

	override getGeometry(shape: BoardSwatchShape) {
		return new Rectangle2d({
			width: shape.props.w,
			height: shape.props.h,
			isFilled: true,
		});
	}

	override getText(shape: BoardSwatchShape) {
		return formatBoardSwatchLabel(shape.props.colorValue, shape.props.labelMode);
	}

	override hideRotateHandle() {
		return true;
	}

	override onResize(shape: BoardSwatchShape, info: TLResizeInfo<BoardSwatchShape>) {
		return resizeBox(shape, info, {
			minHeight: BOARD_SWATCH_MIN_HEIGHT,
			minWidth: BOARD_SWATCH_MIN_WIDTH,
		});
	}

	override onTranslateStart(shape: BoardSwatchShape) {
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

	override onTranslateEnd(shape: BoardSwatchShape) {
		clearBoardColumnDrag(shape.id);
	}

	override onTranslateCancel(shape: BoardSwatchShape) {
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

	override component(shape: BoardSwatchShape) {
		return <BoardSwatchShapeView shape={shape} />;
	}

	override indicator(shape: BoardSwatchShape) {
		return (
			<rect
				width={shape.props.w}
				height={shape.props.h}
			/>
		);
	}
}

function BoardSwatchShapeView({ shape }: { shape: BoardSwatchShape }) {
	const editor = useEditor();
	const dragState = useBoardColumnDragState();
	const parentColumn = useValue(
		"board-swatch-parent-column",
		() => {
			const parent = editor.getShape(shape.parentId);
			return parent?.type === "board-column" ? parent : null;
		},
		[editor, shape.parentId],
	);
	const isInColumn = Boolean(parentColumn);
	const isInCollapsedColumn = Boolean(parentColumn?.props.collapsed);
	const isDraggedBoardColumnSwatch =
		dragState.draggedShapeId === shape.id && editor.isIn("select.translating");
	const label = useMemo(
		() => formatBoardSwatchLabel(shape.props.colorValue, shape.props.labelMode),
		[shape.props.colorValue, shape.props.labelMode],
	);
	const labelStyles = useMemo(
		() =>
			({
				color: getBoardSwatchTextColor(shape.props.colorValue),
				fontSize: getBoardSwatchLabelFontSize(shape.props.w, shape.props.h),
			}) satisfies CSSProperties,
		[shape.props.colorValue, shape.props.h, shape.props.w],
	);

	return (
		<HTMLContainer
			className="boardspace-swatch-shape"
			data-in-column={isInColumn ? "true" : "false"}
			data-dragging={isDraggedBoardColumnSwatch ? "true" : "false"}
			style={{
				height: shape.props.h,
				opacity: isInCollapsedColumn ? 0 : isDraggedBoardColumnSwatch ? 0.8 : 1,
				pointerEvents: isInCollapsedColumn ? "none" : "all",
				position: "relative",
				visibility: isInCollapsedColumn ? "hidden" : "visible",
				width: shape.props.w,
				zIndex: isDraggedBoardColumnSwatch ? 10 : undefined,
			}}
		>
			<div
				className="boardspace-swatch-shape__inner"
				style={{
					backgroundColor: normalizeBoardSwatchColor(shape.props.colorValue),
				}}
			>
				{label ? (
					<div
						className="boardspace-swatch-shape__label"
						style={labelStyles}
					>
						{label}
					</div>
				) : null}
			</div>
		</HTMLContainer>
	);
}

export function normalizeBoardSwatchColor(value: string | undefined) {
	return /^#[0-9a-f]{6}$/i.test(value ?? "")
		? value!.toLowerCase()
		: BOARD_SWATCH_DEFAULT_COLOR;
}

export function formatBoardSwatchLabel(
	colorValue: string,
	labelMode: BoardSwatchShape["props"]["labelMode"],
) {
	const normalized = normalizeBoardSwatchColor(colorValue);

	switch (labelMode) {
		case "hex":
			return normalized.toUpperCase();
		case "rgb": {
			const { r, g, b } = getBoardSwatchRgb(normalized);
			return `${r}, ${g}, ${b}`;
		}
		case "hsl": {
			const { h, s, l } = getBoardSwatchHsl(normalized);
			return `${h}, ${s}%, ${l}%`;
		}
		default:
			return "";
	}
}

function getBoardSwatchRgb(colorValue: string) {
	const normalized = normalizeBoardSwatchColor(colorValue).slice(1);

	return {
		r: Number.parseInt(normalized.slice(0, 2), 16),
		g: Number.parseInt(normalized.slice(2, 4), 16),
		b: Number.parseInt(normalized.slice(4, 6), 16),
	};
}

function getBoardSwatchHsl(colorValue: string) {
	const { r, g, b } = getBoardSwatchRgb(colorValue);
	const red = r / 255;
	const green = g / 255;
	const blue = b / 255;
	const max = Math.max(red, green, blue);
	const min = Math.min(red, green, blue);
	const lightness = (max + min) / 2;
	const delta = max - min;

	if (delta === 0) {
		return {
			h: 0,
			s: 0,
			l: Math.round(lightness * 100),
		};
	}

	const saturation =
		lightness > 0.5
			? delta / (2 - max - min)
			: delta / (max + min);
	let hue = 0;

	switch (max) {
		case red:
			hue = (green - blue) / delta + (green < blue ? 6 : 0);
			break;
		case green:
			hue = (blue - red) / delta + 2;
			break;
		default:
			hue = (red - green) / delta + 4;
			break;
	}

	return {
		h: Math.round(hue * 60),
		s: Math.round(saturation * 100),
		l: Math.round(lightness * 100),
	};
}

function getBoardSwatchTextColor(colorValue: string) {
	const { r, g, b } = getBoardSwatchRgb(colorValue);
	const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

	return luminance > 0.6 ? "#10141b" : "#f8fafc";
}

function getBoardSwatchLabelFontSize(width: number, height: number) {
	return Math.max(12, Math.min(22, Math.round(Math.min(width, height) * 0.18)));
}
