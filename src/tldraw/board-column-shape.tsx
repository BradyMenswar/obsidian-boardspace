import {
	BaseBoxShapeUtil,
	createShapePropsMigrationIds,
	createShapePropsMigrationSequence,
	DefaultDashStyle,
	DefaultFillStyle,
	DefaultSizeStyle,
	Editor,
	getIndexAbove,
	HTMLContainer,
	Rectangle2d,
	T,
	TLDefaultFillStyle,
	TLDefaultSizeStyle,
	TLDragShapesOutInfo,
	TLDragShapesOverInfo,
	TLResizeInfo,
	TLShape,
	Vec,
	LABEL_FONT_SIZES,
	resizeBox,
	useEditor,
	useIsEditing,
	useValue,
} from "tldraw";
import { CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import {
	BOARD_COLUMN_DEFAULT_HEIGHT,
	BOARD_COLUMN_DEFAULT_WIDTH,
	BOARD_COLUMN_MIN_HEIGHT,
	BOARD_COLUMN_MIN_WIDTH,
	BOARD_COLUMN_PADDING,
	BOARD_COLUMN_SHELL_PADDING_TOP,
	BOARD_COLUMN_SHELL_PADDING_BOTTOM,
	getBoardColumnBodyTop,
	getBoardColumnCollapsedHeight,
	getBoardColumnHeaderHeight,
} from "./board-column-config";
import {
	formatBoardColumnCounts,
	getBoardColumnInsertionIndicatorY,
	getBoardColumnInnerWidth,
	isColumnAllowedShape,
	isColumnAllowedShapeType,
} from "./board-column-layout";
import {
	getBoardColumnDragState,
	updateBoardColumnDrag,
	useBoardColumnDragState,
} from "./board-column-drag-state";
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

export type BoardColumnShape = Extract<TLShape, { type: "board-column" }>;

const boardColumnShapeVersions = createShapePropsMigrationIds("board-column", {
	AddStyleProps: 1,
	AddDash: 2,
});

const boardColumnShapeMigrations = createShapePropsMigrationSequence({
	sequence: [
		{
			id: boardColumnShapeVersions.AddStyleProps,
			up: (props) => {
				props.color = "black";
				props.customColor = BOARDSPACE_DEFAULT_CUSTOM_COLOR;
				props.fill = "semi";
				props.size = "m";
				props.topBarColor = BOARDSPACE_TRANSPARENT_TOP_BAR_COLOR;
				props.topBarCustomColor = BOARDSPACE_DEFAULT_CUSTOM_COLOR;
			},
			down: ({
				color: _color,
				customColor: _customColor,
				fill: _fill,
				size: _size,
				topBarColor: _topBarColor,
				topBarCustomColor: _topBarCustomColor,
				...props
			}) => props,
		},
		{
			id: boardColumnShapeVersions.AddDash,
			up: (props) => {
				props.dash = "solid";
				props.customColor ??= BOARDSPACE_DEFAULT_CUSTOM_COLOR;
				props.topBarCustomColor ??= BOARDSPACE_DEFAULT_CUSTOM_COLOR;
			},
			down: ({ dash: _dash, ...props }) => props,
		},
	],
});

const pendingCollapsedColumnRestores = new Map<
	BoardColumnShape["id"],
	{ childIds: TLShape["id"][]; childIndices: Map<TLShape["id"], TLShape["index"]> }
>();

export class BoardColumnShapeUtil extends BaseBoxShapeUtil<BoardColumnShape> {
	static override type = "board-column" as const;

	static override props = {
		color: BoardspaceColorStyle,
		customColor: BoardspaceCustomColorStyle,
		dash: DefaultDashStyle,
		h: T.number,
		fill: DefaultFillStyle,
		minH: T.number,
		size: DefaultSizeStyle,
		title: T.string,
		collapsed: T.boolean,
		topBarColor: BoardNoteTopBarColorStyle,
		topBarCustomColor: BoardNoteTopBarCustomColorStyle,
		w: T.number,
	};

	static override migrations = boardColumnShapeMigrations;

	override canEdit() {
		return true;
	}

	override canResize() {
		return true;
	}

	override canResizeChildren() {
		return false;
	}

	providesBackgroundForChildren(_shape: BoardColumnShape) {
		return true;
	}

	override canReceiveNewChildrenOfType(shape: BoardColumnShape, type: TLShape["type"]) {
		return !shape.props.collapsed && isColumnAllowedShapeType(type);
	}

	override getDefaultProps(): BoardColumnShape["props"] {
		return {
			color: "black",
			customColor: BOARDSPACE_DEFAULT_CUSTOM_COLOR,
			dash: "solid",
			fill: "semi",
			h: BOARD_COLUMN_DEFAULT_HEIGHT,
			minH: BOARD_COLUMN_MIN_HEIGHT,
			size: "m",
			title: "Untitled column",
			collapsed: false,
			topBarColor: BOARDSPACE_TRANSPARENT_TOP_BAR_COLOR,
			topBarCustomColor: BOARDSPACE_DEFAULT_CUSTOM_COLOR,
			w: BOARD_COLUMN_DEFAULT_WIDTH,
		};
	}

	override getGeometry(shape: BoardColumnShape) {
		return new Rectangle2d({
			width: shape.props.w,
			height: getBoardColumnVisibleHeight(shape),
			isFilled: true,
		});
	}

	override getText(shape: BoardColumnShape) {
		return shape.props.title;
	}

	override hideRotateHandle() {
		return true;
	}

	override hideResizeHandles(shape: BoardColumnShape) {
		return shape.props.collapsed;
	}

	override getClipPath(shape: BoardColumnShape) {
		const top = getBoardColumnBodyTop(shape.props.size);
		const bottom = getBoardColumnVisibleHeight(shape) - BOARD_COLUMN_PADDING;

		if (bottom <= top) {
			return [
				new Vec(BOARD_COLUMN_PADDING, top),
				new Vec(shape.props.w - BOARD_COLUMN_PADDING, top),
				new Vec(shape.props.w - BOARD_COLUMN_PADDING, top),
				new Vec(BOARD_COLUMN_PADDING, top),
			];
		}

		return [
			new Vec(BOARD_COLUMN_PADDING, top),
			new Vec(shape.props.w - BOARD_COLUMN_PADDING, top),
			new Vec(shape.props.w - BOARD_COLUMN_PADDING, bottom),
			new Vec(BOARD_COLUMN_PADDING, bottom),
		];
	}

	override onResize(shape: BoardColumnShape, info: TLResizeInfo<BoardColumnShape>) {
		const resized = resizeBox(shape, info, {
			minWidth: BOARD_COLUMN_MIN_WIDTH,
			minHeight: shape.props.h,
		});
		const nextWidth = Math.max(BOARD_COLUMN_MIN_WIDTH, resized.props.w);
		const isLeftHandle = info.handle === "left" || info.handle === "top_left" || info.handle === "bottom_left";
		const shouldResizeWidth = isLeftHandle || info.handle === "right" || info.handle === "top_right" || info.handle === "bottom_right";

		return {
			...shape,
			x: isLeftHandle ? resized.x : shape.x,
			y: shape.y,
			props: {
				...shape.props,
				h: shape.props.h,
				minH: shape.props.minH,
				w: shouldResizeWidth ? nextWidth : shape.props.w,
			},
		};
	}

	override component(shape: BoardColumnShape) {
		return <BoardColumnShapeView shape={shape} />;
	}

	override indicator(shape: BoardColumnShape) {
		return (
			<rect
				width={shape.props.w}
				height={getBoardColumnVisibleHeight(shape)}
			/>
		);
	}

	override onTranslateStart(shape: BoardColumnShape) {
		if (!shape.props.collapsed) {
			pendingCollapsedColumnRestores.delete(shape.id);
			return;
		}

		const childIds = this.editor
			.getSortedChildIdsForParent(shape.id)
			.map((childId) => this.editor.getShape(childId))
			.filter((child): child is TLShape => Boolean(child))
			.filter(isColumnAllowedShape)
			.map((child) => child.id);
		const childIndices = new Map<TLShape["id"], TLShape["index"]>();

		for (const childId of childIds) {
			const child = this.editor.getShape(childId);
			if (child) {
				childIndices.set(child.id, child.index);
			}
		}

		pendingCollapsedColumnRestores.set(shape.id, {
			childIds,
			childIndices,
		});
	}

	override onTranslateEnd(initial: BoardColumnShape, _current: BoardColumnShape) {
		const snapshot = pendingCollapsedColumnRestores.get(initial.id);
		if (!snapshot) {
			return;
		}

		const editor = this.editor;
		requestAnimationFrame(() => {
			restoreCollapsedColumnChildrenFor(editor, initial.id);
		});
	}

	override onTranslateCancel(initial: BoardColumnShape, _current: BoardColumnShape) {
		pendingCollapsedColumnRestores.delete(initial.id);
	}

	override onDragShapesIn(
		shape: BoardColumnShape,
		draggingShapes: TLShape[],
		{ initialParentIds, initialIndices }: TLDragShapesOverInfo,
	) {
		if (shape.props.collapsed) {
			return;
		}

		const nextShapes = draggingShapes.filter((draggingShape) => {
			if (!isColumnAllowedShape(draggingShape)) {
				return false;
			}

			return !this.editor.hasAncestor(shape, draggingShape.id);
		});

		if (nextShapes.length === 0 || nextShapes.every((child) => child.parentId === shape.id)) {
			return;
		}

		let canRestoreOriginalIndices = false;
		const previousChildren = nextShapes.filter(
			(child) => shape.id === initialParentIds.get(child.id),
		);

		if (previousChildren.length > 0) {
			const currentChildren = this.editor
				.getSortedChildIdsForParent(shape)
				.map((childId) => this.editor.getShape(childId))
				.filter((child): child is TLShape => Boolean(child));

			if (previousChildren.every((child) => !currentChildren.find((currentChild: TLShape) => currentChild.index === child.index))) {
				canRestoreOriginalIndices = true;
			}
		}

		this.editor.reparentShapes(nextShapes, shape.id);
		let nextIndex = this.editor.getHighestIndexForParent(shape.id);
		this.editor.updateShapes(
			nextShapes.map((child) => {
				const childIndex = nextIndex;
				nextIndex = getIndexAbove(nextIndex);
				return {
					id: child.id,
					type: child.type,
					index: childIndex,
				};
			}),
		);

		const draggedShape = nextShapes.find(isColumnAllowedShape);
		if (canRestoreOriginalIndices) {
			for (const child of previousChildren) {
				this.editor.updateShape({
					id: child.id,
					type: child.type,
					index: initialIndices.get(child.id),
				});
			}
		}

		if (draggedShape) {
			updateBoardColumnDrag({
				targetColumnId: shape.id,
				indicatorY: getBoardColumnInsertionIndicatorY(
					this.editor,
					shape.id,
					draggedShape.id,
					shape.props.size,
				),
			});
		}
	}

	override onDragShapesOver(
		shape: BoardColumnShape,
		draggingShapes: TLShape[],
	) {
		if (shape.props.collapsed) {
			return;
		}

		const draggedShape = draggingShapes.find(isColumnAllowedShape);
		if (!draggedShape) {
			return;
		}

		updateBoardColumnDrag({
			targetColumnId: shape.id,
			indicatorY: getBoardColumnInsertionIndicatorY(
				this.editor,
				shape.id,
				draggedShape.id,
				shape.props.size,
			),
		});
	}

	override onDragShapesOut(
		shape: BoardColumnShape,
		draggingShapes: TLShape[],
		info: TLDragShapesOutInfo,
	) {
		const dragState = getBoardColumnDragState();
		if (dragState.targetColumnId === shape.id) {
			updateBoardColumnDrag({
				targetColumnId: null,
				indicatorY: null,
			});
		}

		if (info.nextDraggingOverShapeId) {
			return;
		}

		this.editor.reparentShapes(
			draggingShapes.filter(
				(draggingShape) => draggingShape.parentId === shape.id && isColumnAllowedShape(draggingShape),
			),
			this.editor.getCurrentPageId(),
		);
	}
}

function BoardColumnShapeView({ shape }: { shape: BoardColumnShape }) {
	const editor = useEditor();
	const isEditing = useIsEditing(shape.id);
	const dragState = useBoardColumnDragState();
	const inputRef = useRef<HTMLInputElement>(null);
	const [draftTitle, setDraftTitle] = useState(shape.props.title);
	const childShapes = useValue(
		"board-column-children",
		() =>
			editor
				.getSortedChildIdsForParent(shape.id)
				.map((childId) => editor.getShape(childId))
				.filter((child): child is TLShape => Boolean(child))
				.filter(isColumnAllowedShape),
		[editor, shape.id],
	);
	const countLabel = useMemo(
		() => formatBoardColumnCounts(childShapes),
		[childShapes],
	);
	const visibleHeight = getBoardColumnVisibleHeight(shape);
	const headerHeight = useMemo(
		() => getBoardColumnHeaderHeight(shape.props.size),
		[shape.props.size],
	);
	const bodyHeight = Math.max(
		0,
		visibleHeight -
			getBoardColumnBodyTop(shape.props.size) -
			BOARD_COLUMN_SHELL_PADDING_BOTTOM,
	);
	const isDarkMode = useValue(
		"board-column-dark-mode",
		() => editor.user.getIsDarkMode(),
		[editor],
	);
	const isSelected = useValue(
		"board-column-selected",
		() => editor.getSelectedShapeIds().includes(shape.id),
		[editor, shape.id],
	);
	const containerStyles = useMemo(
		() =>
			getBoardNoteCardStyles(
				shape.props.color,
				shape.props.customColor,
				shape.props.dash,
				shape.props.fill,
				isDarkMode,
			),
		[
			isDarkMode,
			shape.props.color,
			shape.props.customColor,
			shape.props.dash,
			shape.props.fill,
		],
	);
	const topBarStyles = useMemo(
		() =>
			getBoardNoteBarStyles(
				shape.props.topBarColor,
				shape.props.topBarCustomColor,
				isDarkMode,
			),
		[isDarkMode, shape.props.topBarColor, shape.props.topBarCustomColor],
	);
	const textColor = useMemo(
		() =>
			getBoardNoteTextColor(
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
	const isSourceColumn = dragState.sourceColumnId === shape.id;
	const isTargetColumn = dragState.targetColumnId === shape.id;
	const showsEmptyState =
		!shape.props.collapsed &&
		childShapes.length === 0 &&
		!isSourceColumn;

	useEffect(() => {
		setDraftTitle(shape.props.title);
	}, [shape.props.title]);

	useEffect(() => {
		if (!isEditing) {
			return;
		}

		inputRef.current?.focus();
		inputRef.current?.select();
	}, [isEditing]);

	const bodyStyles = useMemo(
		() =>
			({
				height: bodyHeight,
			}) as CSSProperties,
		[bodyHeight],
	);
	const innerStyles = useMemo(
		() =>
			({
				...containerStyles,
				paddingTop: BOARD_COLUMN_SHELL_PADDING_TOP,
				paddingRight: BOARD_COLUMN_PADDING,
				paddingBottom: BOARD_COLUMN_SHELL_PADDING_BOTTOM,
				paddingLeft: BOARD_COLUMN_PADDING,
			}) as CSSProperties,
		[containerStyles],
	);
	const headerStyles = useMemo(
		() =>
			({
				minHeight: headerHeight,
			}) as CSSProperties,
		[headerHeight],
	);
	const titleStyles = useMemo(
		() =>
			({
				color: textColor,
				fontFamily: "var(--tl-font-sans)",
				fontSize: LABEL_FONT_SIZES[shape.props.size],
				lineHeight: 1.3,
			}) as CSSProperties,
		[shape.props.size, textColor],
	);
	const countStyles = useMemo(
		() =>
			({
				color: textColor,
				fontFamily: "var(--tl-font-sans)",
				fontSize: Math.max(11, LABEL_FONT_SIZES[shape.props.size] - 2),
				opacity: 0.82,
			}) as CSSProperties,
		[shape.props.size, textColor],
	);

	return (
		<HTMLContainer
			className="boardspace-column-shape"
			style={{
				height: visibleHeight,
				width: shape.props.w,
			}}
		>
			<div
				className="boardspace-column-shape__inner"
				data-collapsed={shape.props.collapsed ? "true" : "false"}
				data-selected={isSelected ? "true" : "false"}
				style={innerStyles}
			>
				<div
					className="boardspace-column-shape__top-bar"
					style={topBarStyles}
				/>
				<div className="boardspace-column-shape__header" style={headerStyles}>
					<button
						type="button"
						className="boardspace-column-shape__collapse"
						title={shape.props.collapsed ? "Expand column" : "Collapse column"}
						onPointerDown={(event) => {
							event.stopPropagation();
							editor.markEventAsHandled(event);
						}}
						onClick={(event) => {
							event.stopPropagation();
							editor.markEventAsHandled(event);
							editor.updateShape({
								id: shape.id,
								type: shape.type,
								props: {
									collapsed: !shape.props.collapsed,
								},
							});
							editor.setEditingShape(null);
						}}
					>
						{shape.props.collapsed ? "+" : "-"}
					</button>
					<div
						className="boardspace-column-shape__title-wrap"
						onDoubleClick={(event) => {
							event.stopPropagation();
							editor.markEventAsHandled(event);
							editor.setEditingShape(shape.id);
						}}
					>
						{isEditing ? (
							<input
								ref={inputRef}
								className="boardspace-column-shape__title-input"
								style={titleStyles}
								value={draftTitle}
								onChange={(event) => {
									const nextTitle = event.currentTarget.value;
									setDraftTitle(nextTitle);
									editor.updateShape({
										id: shape.id,
										type: shape.type,
										props: {
											title: nextTitle,
										},
									});
								}}
								onBlur={() => editor.setEditingShape(null)}
								onKeyDown={(event) => {
									if (event.key === "Enter" && !event.nativeEvent.isComposing) {
										editor.markEventAsHandled(event);
										event.currentTarget.blur();
									}

									if (event.key === "Escape") {
										editor.markEventAsHandled(event);
										setDraftTitle(shape.props.title);
										editor.setEditingShape(null);
									}
								}}
								onPointerDown={(event) => {
									event.stopPropagation();
									editor.markEventAsHandled(event);
								}}
								draggable={false}
							/>
						) : (
							<div className="boardspace-column-shape__title" style={titleStyles}>
								{shape.props.title || "Untitled column"}
							</div>
						)}
						<div className="boardspace-column-shape__count" style={countStyles}>
							{countLabel}
						</div>
					</div>
				</div>
				{showsEmptyState ? (
					<div
						className="boardspace-column-shape__body"
						style={bodyStyles}
						data-empty="true"
					>
						<div className="boardspace-column-shape__empty" />
					</div>
				) : null}
			</div>
			{shape.props.collapsed ? null : (
				<div className="boardspace-column-shape__drag-overlay">
					{isSourceColumn &&
					dragState.placeholderY !== null &&
					dragState.placeholderHeight !== null ? (
						<div
							className="boardspace-column-shape__drag-placeholder"
							style={{
								height: dragState.placeholderHeight,
								top: dragState.placeholderY,
								width: getBoardColumnInnerWidth(shape.props.w),
							}}
						/>
					) : null}
					{isTargetColumn && dragState.indicatorY !== null ? (
						<div
							className="boardspace-column-shape__drag-indicator"
							style={{
								top: dragState.indicatorY,
								width: getBoardColumnInnerWidth(shape.props.w),
							}}
						/>
					) : null}
				</div>
			)}
		</HTMLContainer>
	);
}

function getBoardColumnVisibleHeight(shape: BoardColumnShape) {
	return shape.props.collapsed
		? getBoardColumnCollapsedHeight(shape.props.size)
		: shape.props.h;
}

function restoreCollapsedColumnChildrenFor(
	editor: Editor,
	columnId: BoardColumnShape["id"],
) {
	const snapshot = pendingCollapsedColumnRestores.get(columnId);
	if (!snapshot) {
		return;
	}

	const column = editor.getShape(columnId);
	if (!column || column.type !== "board-column" || !column.props.collapsed) {
		pendingCollapsedColumnRestores.delete(columnId);
		return;
	}

	const childIdsToRestore = snapshot.childIds.filter((childId) => {
		const child = editor.getShape(childId);
		return child && child.parentId !== column.id;
	});

	if (childIdsToRestore.length === 0) {
		pendingCollapsedColumnRestores.delete(columnId);
		return;
	}

	editor.reparentShapes(childIdsToRestore, column.id);
	editor.updateShapes(
		childIdsToRestore
			.map((childId) => {
				const child = editor.getShape(childId);
				if (!child) {
					return null;
				}

				return {
					id: childId,
					type: child.type,
					index: snapshot.childIndices.get(childId),
				};
			})
			.filter(
				(
					update,
				): update is {
					id: TLShape["id"];
					type: TLShape["type"];
					index: TLShape["index"] | undefined;
				} => Boolean(update),
			),
	);

	pendingCollapsedColumnRestores.delete(columnId);
}
