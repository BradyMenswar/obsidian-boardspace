import {
	BaseBoxShapeUtil,
	DefaultDashStyle,
	DefaultFillStyle,
	DefaultSizeStyle,
	HTMLContainer,
	LABEL_FONT_SIZES,
	Rectangle2d,
	resizeBox,
	T,
	TLResizeInfo,
	TLShape,
	useEditor,
	useValue,
} from "tldraw";
import { CSSProperties, useMemo } from "react";
import {
	BOARDSPACE_DEFAULT_CUSTOM_COLOR,
	BOARDSPACE_TRANSPARENT_TOP_BAR_COLOR,
	BoardNoteTopBarCustomColorStyle,
	BoardNoteTopBarColorStyle,
	BoardspaceColorStyle,
	BoardspaceCustomColorStyle,
	getBoardNoteBarStyles,
	getBoardNoteCardStyles,
	getBoardNoteTextColor,
} from "./board-note-shape";

export interface BoardTableColumn {
	id: string;
	title: string;
}

export interface BoardTableCell {
	columnId: string;
	value: string;
}

export interface BoardTableRow {
	id: string;
	cells: BoardTableCell[];
}

export type BoardTableShape = Extract<TLShape, { type: "board-table" }>;

const tableColumnValidator = T.object<BoardTableColumn>({ id: T.string, title: T.string });
const tableCellValidator = T.object<BoardTableCell>({ columnId: T.string, value: T.string });
const tableRowValidator = T.object<BoardTableRow>({
	id: T.string,
	cells: T.arrayOf(tableCellValidator),
});

export class BoardTableShapeUtil extends BaseBoxShapeUtil<BoardTableShape> {
	static override type = "board-table" as const;

	static override props = {
		color: BoardspaceColorStyle,
		columns: T.arrayOf(tableColumnValidator),
		customColor: BoardspaceCustomColorStyle,
		dash: DefaultDashStyle,
		fill: DefaultFillStyle,
		h: T.number,
		rows: T.arrayOf(tableRowValidator),
		size: DefaultSizeStyle,
		title: T.string,
		topBarColor: BoardNoteTopBarColorStyle,
		topBarCustomColor: BoardNoteTopBarCustomColorStyle,
		w: T.number,
	};

	override canResize() {
		return true;
	}

	override getDefaultProps(): BoardTableShape["props"] {
		const columns = [createBoardTableColumn("Column 1"), createBoardTableColumn("Column 2")];
		return {
			color: "black",
			columns,
			customColor: BOARDSPACE_DEFAULT_CUSTOM_COLOR,
			dash: "solid",
			fill: "semi",
			h: 220,
			rows: [createBoardTableRow(columns)],
			size: "m",
			title: "",
			topBarColor: BOARDSPACE_TRANSPARENT_TOP_BAR_COLOR,
			topBarCustomColor: BOARDSPACE_DEFAULT_CUSTOM_COLOR,
			w: 480,
		};
	}

	override getGeometry(shape: BoardTableShape) {
		return new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: true });
	}

	override getText(shape: BoardTableShape) {
		return [
			shape.props.title,
			...shape.props.columns.map((column) => column.title),
			...shape.props.rows.flatMap((row) => row.cells.map((cell) => cell.value)),
		].filter(Boolean).join("\n");
	}

	override hideRotateHandle() {
		return true;
	}

	override onResize(shape: BoardTableShape, info: TLResizeInfo<BoardTableShape>) {
		return resizeBox(shape, info, { minWidth: 280, minHeight: 140 });
	}

	override component(shape: BoardTableShape) {
		return <BoardTableShapeView shape={shape} />;
	}

	override indicator(shape: BoardTableShape) {
		return <rect width={shape.props.w} height={shape.props.h} />;
	}
}

function BoardTableShapeView({ shape }: { shape: BoardTableShape }) {
	const editor = useEditor();
	const isDarkMode = useValue("board-table-dark-mode", () => editor.user.getIsDarkMode(), [editor]);
	const cardStyles = useMemo(() => getBoardNoteCardStyles(
		shape.props.color,
		shape.props.customColor,
		shape.props.dash,
		shape.props.fill,
		isDarkMode,
	), [isDarkMode, shape.props.color, shape.props.customColor, shape.props.dash, shape.props.fill]);
	const topBarStyles = useMemo(() => getBoardNoteBarStyles(
		shape.props.topBarColor,
		shape.props.topBarCustomColor,
		isDarkMode,
	), [isDarkMode, shape.props.topBarColor, shape.props.topBarCustomColor]);
	const textColor = useMemo(() => getBoardNoteTextColor(
		shape.props.color,
		shape.props.customColor,
		shape.props.fill,
		isDarkMode,
	), [isDarkMode, shape.props.color, shape.props.customColor, shape.props.fill]);
	const textStyles = {
		color: textColor,
		fontFamily: "var(--tl-font-sans)",
		fontSize: LABEL_FONT_SIZES[shape.props.size],
	} as CSSProperties;
	const update = (props: Partial<BoardTableShape["props"]>) => editor.updateShape({
		id: shape.id,
		type: shape.type,
		props,
	});

	return (
		<HTMLContainer className="boardspace-table-shape" style={{ height: shape.props.h, width: shape.props.w }}>
			<div className="boardspace-table-shape__inner" style={cardStyles}>
				<div className="boardspace-table-shape__top-bar" style={topBarStyles} />
				<input
					className="boardspace-table-shape__title"
					style={textStyles}
					value={shape.props.title}
					placeholder="Table title"
					onPointerDown={(event) => event.stopPropagation()}
					onChange={(event) => update({ title: event.currentTarget.value })}
				/>
				<div className="boardspace-table-shape__scroll">
					<table style={textStyles}>
						<thead>
							<tr>
								{shape.props.columns.map((column) => (
									<th key={column.id}>
										<input
											value={column.title}
											onPointerDown={(event) => event.stopPropagation()}
											onChange={(event) => update({ columns: shape.props.columns.map((item) => item.id === column.id ? { ...item, title: event.currentTarget.value } : item) })}
										/>
									</th>
								))}
								<th className="boardspace-table-shape__action-cell">
									<button type="button" title="Add column" onPointerDown={(event) => event.stopPropagation()} onClick={() => {
										const column = createBoardTableColumn(`Column ${shape.props.columns.length + 1}`);
										update({
											columns: [...shape.props.columns, column],
											rows: shape.props.rows.map((row) => ({ ...row, cells: [...row.cells, { columnId: column.id, value: "" }] })),
										});
									}}>+</button>
								</th>
							</tr>
						</thead>
						<tbody>
							{shape.props.rows.map((row) => (
								<tr key={row.id}>
									{shape.props.columns.map((column) => {
										const cell = row.cells.find((item) => item.columnId === column.id);
										return <td key={column.id}><input value={cell?.value ?? ""} onPointerDown={(event) => event.stopPropagation()} onChange={(event) => update({ rows: shape.props.rows.map((item) => item.id === row.id ? { ...item, cells: item.cells.map((value) => value.columnId === column.id ? { ...value, value: event.currentTarget.value } : value) } : item) })} /></td>;
									})}
									<td className="boardspace-table-shape__action-cell" />
								</tr>
							))}
						</tbody>
					</table>
					<button className="boardspace-table-shape__add-row" type="button" onPointerDown={(event) => event.stopPropagation()} onClick={() => update({ rows: [...shape.props.rows, createBoardTableRow(shape.props.columns)] })}>Add row</button>
				</div>
			</div>
		</HTMLContainer>
	);
}

export function createBoardTableColumn(title = ""): BoardTableColumn {
	return { id: createBoardTableNestedIdentity("table-column"), title };
}

export function createBoardTableRow(columns: BoardTableColumn[]): BoardTableRow {
	return {
		id: createBoardTableNestedIdentity("table-row"),
		cells: columns.map((column) => ({ columnId: column.id, value: "" })),
	};
}

export function createBoardTableNestedIdentity(prefix: "table-column" | "table-row") {
	return `${prefix}:${crypto.randomUUID()}`;
}
