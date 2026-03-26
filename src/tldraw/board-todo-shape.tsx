import {
	BaseBoxShapeUtil,
	createShapePropsMigrationIds,
	createShapePropsMigrationSequence,
	DefaultDashStyle,
	DefaultFillStyle,
	DefaultSizeStyle,
	FONT_FAMILIES,
	HTMLContainer,
	LABEL_FONT_SIZES,
	Rectangle2d,
	T,
	TLDefaultFillStyle,
	TLDefaultSizeStyle,
	TLResizeInfo,
	TLShape,
	createShapeId,
	resizeBox,
	useEditor,
	useValue,
} from "tldraw";
import {
	CSSProperties,
	PointerEvent as ReactPointerEvent,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	BOARD_TODO_DEFAULT_WIDTH,
	BOARD_TODO_MIN_HEIGHT,
	BOARD_TODO_MIN_WIDTH,
	BOARD_TODO_TOP_BAR_HEIGHT,
	getBoardTodoAutoHeight,
	getBoardTodoCheckboxSize,
	getBoardTodoDragHandleWidth,
	getBoardTodoHorizontalPadding,
	getBoardTodoRowGap,
	getBoardTodoRowHeight,
	getBoardTodoVerticalPadding,
} from "./board-todo-config";
import {
	clearBoardTodoDrag,
	getBoardTodoDragState,
	startBoardTodoDrag,
	updateBoardTodoDrag,
	useBoardTodoDragState,
} from "./board-todo-drag-state";
import {
	clearBoardTodoTaskTransferDrag,
	getBoardTodoTaskTransferDragState,
	startBoardTodoTaskTransferDrag,
	updateBoardTodoTaskTransferDrag,
	useBoardTodoTaskTransferDragState,
} from "./board-todo-task-drag-state";
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

export interface BoardTodoTask {
	checked: boolean;
	id: string;
	text: string;
}

export type BoardTodoShape = Extract<TLShape, { type: "board-todo" }>;

const BOARD_TODO_TEXT_LINE_HEIGHT = 1.35;
const BOARD_TODO_ROW_ITEM_GAP = 10;

type TodoTaskDragState = {
	currentClientX: number;
	currentClientY: number;
	height: number;
	id: string;
	indicatorIndex: number | null;
	indicatorY: number | null;
	offsetY: number;
	sourceIndex: number;
	width: number;
};

const boardTodoTaskValidator = T.object<BoardTodoTask>({
	checked: T.boolean,
	id: T.string,
	text: T.string,
});

const boardTodoShapeVersions = createShapePropsMigrationIds("board-todo", {
	AddDash: 1,
});

const boardTodoShapeMigrations = createShapePropsMigrationSequence({
	sequence: [
		{
			id: boardTodoShapeVersions.AddDash,
			up: (props) => {
				props.dash = "solid";
				props.customColor ??= BOARDSPACE_DEFAULT_CUSTOM_COLOR;
				props.topBarColor ??= BOARDSPACE_TRANSPARENT_TOP_BAR_COLOR;
				props.topBarCustomColor ??= BOARDSPACE_DEFAULT_CUSTOM_COLOR;
			},
			down: ({ dash: _dash, ...props }) => props,
		},
	],
});

export class BoardTodoShapeUtil extends BaseBoxShapeUtil<BoardTodoShape> {
	static override type = "board-todo" as const;

	static override props = {
		color: BoardspaceColorStyle,
		customColor: BoardspaceCustomColorStyle,
		dash: DefaultDashStyle,
		fill: DefaultFillStyle,
		h: T.number,
		size: DefaultSizeStyle,
		tasks: T.arrayOf(boardTodoTaskValidator),
		title: T.string,
		topBarColor: BoardNoteTopBarColorStyle,
		topBarCustomColor: BoardNoteTopBarCustomColorStyle,
		w: T.number,
	};

	static override migrations = boardTodoShapeMigrations;

	override canEdit() {
		return true;
	}

	override canResize() {
		return true;
	}

	override getDefaultProps(): BoardTodoShape["props"] {
		return {
			color: "black",
			customColor: BOARDSPACE_DEFAULT_CUSTOM_COLOR,
			dash: "solid",
			fill: "semi",
			h: getBoardTodoAutoHeight(1, "m", false),
			size: "m",
			tasks: [createBoardTodoTask()],
			title: "",
			topBarColor: BOARDSPACE_TRANSPARENT_TOP_BAR_COLOR,
			topBarCustomColor: BOARDSPACE_DEFAULT_CUSTOM_COLOR,
			w: BOARD_TODO_DEFAULT_WIDTH,
		};
	}

	override getGeometry(shape: BoardTodoShape) {
		return new Rectangle2d({
			width: shape.props.w,
			height: shape.props.h,
			isFilled: true,
		});
	}

	override getText(shape: BoardTodoShape) {
		return shape.props.tasks
			.map((task) => task.text)
			.filter((value) => value.trim().length > 0)
			.join("\n");
	}

	override hideRotateHandle() {
		return true;
	}

	override onBeforeCreate(shape: BoardTodoShape) {
		return getBoardTodoSizeAdjustments(this.editor, shape);
	}

	override onBeforeUpdate(prev: BoardTodoShape, next: BoardTodoShape) {
		if (
			prev.props.size === next.props.size &&
			prev.props.w === next.props.w &&
			areBoardTodoTasksEqual(prev.props.tasks, next.props.tasks)
		) {
			return;
		}

		return getBoardTodoSizeAdjustments(this.editor, next);
	}

	override onResize(shape: BoardTodoShape, info: TLResizeInfo<BoardTodoShape>) {
		const resized = resizeBox(shape, info, {
			minHeight: shape.props.h,
			minWidth: BOARD_TODO_MIN_WIDTH,
		});
		const nextWidth = Math.max(BOARD_TODO_MIN_WIDTH, resized.props.w);
		const isLeftHandle =
			info.handle === "left" ||
			info.handle === "top_left" ||
			info.handle === "bottom_left";
		const shouldResizeWidth =
			isLeftHandle ||
			info.handle === "right" ||
			info.handle === "top_right" ||
			info.handle === "bottom_right";

		return {
			...shape,
			x: isLeftHandle ? resized.x : shape.x,
			y: shape.y,
			props: {
				...shape.props,
				h: shape.props.h,
				w: shouldResizeWidth ? nextWidth : shape.props.w,
			},
		};
	}

	override onTranslateStart(shape: BoardTodoShape) {
		const selectedShapeIds = this.editor.getSelectedShapeIds();
		if (
			selectedShapeIds.length !== 1 ||
			selectedShapeIds[0] !== shape.id ||
			!shouldMergeBoardTodoShapeOnDrop(this.editor, shape)
		) {
			clearBoardTodoDrag(shape.id);
			return;
		}

		startBoardTodoDrag(shape.id);
	}

	override onTranslate(_initial: BoardTodoShape, current: BoardTodoShape) {
		const dragState = getBoardTodoDragState();
		if (dragState.draggedShapeId !== current.id) {
			return;
		}

		const pagePoint = this.editor.inputs.getCurrentPagePoint();
		const targetShape = this.editor
			.getShapesAtPoint(pagePoint, { hitInside: true })
			.find(
				(shape): shape is BoardTodoShape =>
					shape.id !== current.id && shape.type === "board-todo",
			);

		if (!targetShape) {
			updateBoardTodoDrag({
				indicatorIndex: null,
				indicatorY: null,
				targetShapeId: null,
			});
			return;
		}

		const indicator = getBoardTodoMergeIndicator(this.editor, targetShape, pagePoint.y);
		updateBoardTodoDrag({
			indicatorIndex: indicator.index,
			indicatorY: indicator.y,
			targetShapeId: targetShape.id,
		});
	}

	override onTranslateEnd(_initial: BoardTodoShape, current: BoardTodoShape) {
		mergeBoardTodoShapeIntoDropTarget(this.editor, current);
		clearBoardTodoDrag(current.id);
	}

	override onTranslateCancel(_initial: BoardTodoShape, current: BoardTodoShape) {
		clearBoardTodoDrag(current.id);
	}

	override component(shape: BoardTodoShape) {
		return <BoardTodoShapeView shape={shape} />;
	}

	override indicator(shape: BoardTodoShape) {
		return (
			<rect
				width={shape.props.w}
				height={shape.props.h}
			/>
		);
	}
}

function BoardTodoShapeView({ shape }: { shape: BoardTodoShape }) {
	const editor = useEditor();
	const listRef = useRef<HTMLDivElement>(null);
	const taskInputRefs = useRef(new Map<string, HTMLTextAreaElement>());
	const [pendingFocusTaskId, setPendingFocusTaskId] = useState<string | null>(null);
	const [taskDrag, setTaskDrag] = useState<TodoTaskDragState | null>(null);
	const mergeDragState = useBoardTodoDragState();
	const taskTransferDragState = useBoardTodoTaskTransferDragState();
	const isDarkMode = useValue(
		"board-todo-dark-mode",
		() => editor.user.getIsDarkMode(),
		[editor],
	);
	const cardStyles = useMemo(
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
	const taskTextStyles = useMemo(
		() =>
			({
				color: textColor,
				fontFamily: "var(--tl-font-sans)",
				fontSize: LABEL_FONT_SIZES[shape.props.size],
				lineHeight: BOARD_TODO_TEXT_LINE_HEIGHT,
			}) as CSSProperties,
		[shape.props.size, textColor],
	);
	const metrics = useMemo(
		() => ({
			checkboxSize: getBoardTodoCheckboxSize(shape.props.size),
			dragHandleWidth: getBoardTodoDragHandleWidth(shape.props.size),
			horizontalPadding: getBoardTodoHorizontalPadding(shape.props.size),
			rowGap: getBoardTodoRowGap(shape.props.size),
			rowHeight: getBoardTodoRowHeight(shape.props.size),
			verticalPadding: getBoardTodoVerticalPadding(shape.props.size),
		}),
		[shape.props.size],
	);
	const dragTask = taskDrag
		? shape.props.tasks.find((task) => task.id === taskDrag.id) ?? null
		: null;
	const isDraggedTodoCard = mergeDragState.draggedShapeId === shape.id;
	const isMergeTarget =
		mergeDragState.targetShapeId === shape.id &&
		mergeDragState.draggedShapeId !== shape.id &&
		mergeDragState.indicatorY !== null;
	const isTaskTransferTarget =
		taskTransferDragState.targetShapeId === shape.id &&
		taskTransferDragState.sourceShapeId !== shape.id &&
		taskTransferDragState.indicatorY !== null;

	useEffect(() => {
		if (!pendingFocusTaskId) {
			return;
		}

		const nextInput = taskInputRefs.current.get(pendingFocusTaskId);
		if (!nextInput) {
			return;
		}

		nextInput.focus();
		nextInput.select();
		setPendingFocusTaskId(null);
	}, [pendingFocusTaskId, shape.props.tasks]);

	useLayoutEffect(() => {
		for (const input of taskInputRefs.current.values()) {
			input.style.height = "0px";
			input.style.height = `${input.scrollHeight}px`;
		}
	}, [shape.props.size, shape.props.tasks]);

	useEffect(() => {
		if (!taskDrag) {
			return;
		}

		const handlePointerMove = (event: PointerEvent) => {
			setTaskDrag((current) => {
				if (!current) {
					return current;
				}

				const localIndicator = getBoardTodoTaskIndicator(
					listRef.current,
					taskInputRefs.current,
					shape.props.tasks,
					current.sourceIndex,
					shape.props.size,
					event.clientX,
					event.clientY,
				);
				const pagePoint = editor.screenToPage({
					x: event.clientX,
					y: event.clientY,
				});
				const targetShape = getBoardTodoShapeAtPagePoint(editor, shape.id, pagePoint);

				if (targetShape) {
					const transferIndicator = getBoardTodoMergeIndicator(
						editor,
						targetShape,
						pagePoint.y,
					);
					updateBoardTodoTaskTransferDrag({
						indicatorIndex: transferIndicator.index,
						indicatorY: transferIndicator.y,
						targetShapeId: targetShape.id,
					});
				} else {
					updateBoardTodoTaskTransferDrag({
						indicatorIndex: null,
						indicatorY: null,
						targetShapeId: null,
					});
				}

				return {
					...current,
					currentClientX: event.clientX,
					currentClientY: event.clientY,
					indicatorIndex: localIndicator.index,
					indicatorY: localIndicator.y,
				};
			});
		};

		const finishDrag = (event: PointerEvent) => {
			const currentDrag = taskDrag;
			setTaskDrag(null);

			if (!currentDrag) {
				return;
			}

			const sourceTask = shape.props.tasks[currentDrag.sourceIndex];
			if (!sourceTask) {
				return;
			}

			if (isPointerInsideElement(listRef.current, event.clientX, event.clientY)) {
				if (currentDrag.indicatorIndex === null) {
					clearBoardTodoTaskTransferDrag(shape.id);
					return;
				}

				const nextTasks = reorderBoardTodoTasks(
					shape.props.tasks,
					currentDrag.sourceIndex,
					currentDrag.indicatorIndex,
				);

				if (!areBoardTodoTasksEqual(shape.props.tasks, nextTasks)) {
					updateTodoShape(editor, shape, { tasks: nextTasks });
				}

				clearBoardTodoTaskTransferDrag(shape.id);
				return;
			}

			const transferDragState = getBoardTodoTaskTransferDragState();
			const pagePoint = editor.screenToPage({
				x: event.clientX,
				y: event.clientY,
			});
			const hoveredTargetShape = getBoardTodoShapeAtPagePoint(
				editor,
				shape.id,
				pagePoint,
			);
			const targetShape =
				hoveredTargetShape ??
				(transferDragState.targetShapeId &&
				transferDragState.sourceShapeId === shape.id
					? editor.getShape(transferDragState.targetShapeId)
					: null);
			if (targetShape?.type === "board-todo") {
				const indicator =
					hoveredTargetShape?.id === targetShape.id
						? getBoardTodoMergeIndicator(editor, targetShape, pagePoint.y)
						: {
								index: transferDragState.indicatorIndex,
						  };
				if (indicator.index !== null && indicator.index !== undefined) {
					const targetTasks = getBoardTodoTasksForMergedDrop(
						targetShape.props.tasks,
						sourceTask,
						indicator.index,
					);
					editor.updateShape({
						id: targetShape.id,
						type: targetShape.type,
						props: {
							tasks: targetTasks,
						},
					});
					if (shape.props.tasks.length <= 1) {
						editor.deleteShapes([shape.id]);
					} else {
						updateTodoShape(editor, shape, {
							tasks: removeBoardTodoTask(shape.props.tasks, currentDrag.sourceIndex),
						});
					}
					editor.select(targetShape.id);
					clearBoardTodoTaskTransferDrag(shape.id);
					return;
				}
			}

			if (
				shape.props.tasks.length > 1 &&
				sourceTask.text.trim().length > 0 &&
				isPointerInsideElement(editor.getContainer(), event.clientX, event.clientY)
			) {
				createBoardTodoShapeFromTaskDrop(editor, shape, sourceTask, {
					x: event.clientX,
					y: event.clientY,
				});
				updateTodoShape(editor, shape, {
					tasks: removeBoardTodoTask(shape.props.tasks, currentDrag.sourceIndex),
				});
			}

			clearBoardTodoTaskTransferDrag(shape.id);
		};

		const cancelDrag = () => {
			setTaskDrag(null);
			clearBoardTodoTaskTransferDrag(shape.id);
		};

		window.addEventListener("pointermove", handlePointerMove);
		window.addEventListener("pointerup", finishDrag, { once: true });
		window.addEventListener("pointercancel", cancelDrag, { once: true });

		return () => {
			window.removeEventListener("pointermove", handlePointerMove);
			window.removeEventListener("pointerup", finishDrag);
			window.removeEventListener("pointercancel", cancelDrag);
		};
	}, [editor, shape, taskDrag]);

	const updateTaskText = (taskId: string, text: string) => {
		updateTodoShape(editor, shape, {
			tasks: shape.props.tasks.map((task) =>
				task.id === taskId
					? {
							...task,
							text,
					  }
					: task,
			),
		});
	};

	const toggleTaskChecked = (taskId: string) => {
		updateTodoShape(editor, shape, {
			tasks: shape.props.tasks.map((task) =>
				task.id === taskId
					? {
							...task,
							checked: !task.checked,
					  }
					: task,
			),
		});
	};

	const insertTaskAfter = (taskIndex: number) => {
		const nextTask = createBoardTodoTask();
		const nextTasks = [...shape.props.tasks];
		nextTasks.splice(taskIndex + 1, 0, nextTask);
		updateTodoShape(editor, shape, { tasks: nextTasks });
		setPendingFocusTaskId(nextTask.id);
	};

	const removeTaskAt = (taskIndex: number) => {
		const nextTasks = removeBoardTodoTask(shape.props.tasks, taskIndex);
		const nextFocusTask = nextTasks[Math.max(0, taskIndex - 1)] ?? nextTasks[0];
		updateTodoShape(editor, shape, { tasks: nextTasks });
		if (nextFocusTask) {
			setPendingFocusTaskId(nextFocusTask.id);
		}
	};

	const handleTaskKeyDown = (
		event: React.KeyboardEvent<HTMLTextAreaElement>,
		task: BoardTodoTask,
		taskIndex: number,
	) => {
		event.stopPropagation();

		if (event.key === "Enter" && !event.nativeEvent.isComposing) {
			event.preventDefault();
			insertTaskAfter(taskIndex);
			return;
		}

		if (
			event.key === "Backspace" &&
			event.currentTarget.selectionStart === 0 &&
			event.currentTarget.selectionEnd === 0 &&
			task.text.length === 0
		) {
			event.preventDefault();
			removeTaskAt(taskIndex);
		}
	};

	const handleTaskDragStart = (
		event: ReactPointerEvent<HTMLButtonElement>,
		task: BoardTodoTask,
		taskIndex: number,
	) => {
		const rowElement = taskInputRefs.current.get(task.id)?.closest(
			".boardspace-todo-shape__task-row",
		) as HTMLElement | null;
		const listElement = listRef.current;
		if (!rowElement || !listElement) {
			return;
		}

		event.preventDefault();
		event.stopPropagation();
		editor.markEventAsHandled(event);
		editor.select(shape.id);

		const rowRect = rowElement.getBoundingClientRect();
		const indicator = getBoardTodoTaskIndicator(
			listElement,
			taskInputRefs.current,
			shape.props.tasks,
			taskIndex,
			shape.props.size,
			event.clientX,
			event.clientY,
		);
		startBoardTodoTaskTransferDrag(shape.id);

		setTaskDrag({
			currentClientX: event.clientX,
			currentClientY: event.clientY,
			height: rowRect.height,
			id: task.id,
			indicatorIndex: indicator.index,
			indicatorY: indicator.y,
			offsetY: event.clientY - rowRect.top,
			sourceIndex: taskIndex,
			width: rowRect.width,
		});
	};

	return (
		<HTMLContainer
			className="boardspace-todo-shape"
			style={{
				height: shape.props.h,
				opacity: isDraggedTodoCard ? 0.8 : 1,
				position: "relative",
				width: shape.props.w,
				zIndex: isDraggedTodoCard ? 10 : undefined,
			}}
		>
			<div
				className="boardspace-todo-shape__inner"
				style={{
					...cardStyles,
					"--boardspace-todo-checkbox-size": `${metrics.checkboxSize}px`,
					"--boardspace-todo-drag-handle-width": `${metrics.dragHandleWidth}px`,
					"--boardspace-todo-padding-x": `${metrics.horizontalPadding}px`,
					"--boardspace-todo-padding-y": `${metrics.verticalPadding}px`,
					"--boardspace-todo-row-gap": `${metrics.rowGap}px`,
					"--boardspace-todo-row-height": `${metrics.rowHeight}px`,
				} as CSSProperties}
			>
				<div
					className="boardspace-todo-shape__top-bar"
					style={topBarStyles}
				/>
				<div
					ref={listRef}
					className="boardspace-todo-shape__task-list"
				>
					{shape.props.tasks.map((task, taskIndex) => {
						const isDraggedTask = taskDrag?.id === task.id;
						const canDragTask = true;
						if (isDraggedTask) {
							return (
								<div
									key={task.id}
									className="boardspace-todo-shape__task-placeholder"
									style={{
										height: taskDrag?.height ?? metrics.rowHeight,
									}}
								/>
							);
						}

						return (
							<div
								key={task.id}
								className="boardspace-todo-shape__task-row"
								data-checked={task.checked ? "true" : "false"}
							>
								<button
									type="button"
									className="boardspace-todo-shape__checkbox"
									aria-pressed={task.checked}
									aria-label={
										task.checked ? "Mark task incomplete" : "Mark task complete"
									}
									onPointerDown={(event) => {
										event.stopPropagation();
									}}
									onClick={(event) => {
										event.stopPropagation();
										editor.select(shape.id);
										toggleTaskChecked(task.id);
									}}
								>
									{task.checked ? (
										<span className="boardspace-todo-shape__checkbox-mark">✓</span>
									) : null}
								</button>
								<textarea
									ref={(element) => {
										if (element) {
											taskInputRefs.current.set(task.id, element);
											return;
										}

										taskInputRefs.current.delete(task.id);
									}}
									className="boardspace-todo-shape__task-input"
									style={taskTextStyles}
									value={task.text}
									rows={1}
									wrap="soft"
									placeholder="Add a task..."
									onChange={(event) =>
										updateTaskText(task.id, event.currentTarget.value)
									}
									onKeyDown={(event) => handleTaskKeyDown(event, task, taskIndex)}
									onPointerDown={(event) => {
										event.stopPropagation();
									}}
									onFocus={() => {
										editor.select(shape.id);
									}}
								/>
								<button
									type="button"
									className="boardspace-todo-shape__drag-handle"
									aria-label="Reorder task"
									data-disabled={canDragTask ? "false" : "true"}
									onPointerDown={(event) => handleTaskDragStart(event, task, taskIndex)}
								>
									<span className="boardspace-todo-shape__drag-dots" />
								</button>
							</div>
						);
					})}
					{taskDrag || isMergeTarget || isTaskTransferTarget ? (
						<div className="boardspace-todo-shape__drag-layer">
							{taskDrag && taskDrag.indicatorY !== null ? (
								<div
									className="boardspace-todo-shape__drag-indicator"
									style={{
										top: taskDrag.indicatorY,
									}}
								/>
							) : isMergeTarget ? (
								<div
									className="boardspace-todo-shape__drag-indicator"
									style={{
										top: mergeDragState.indicatorY ?? 0,
									}}
								/>
							) : isTaskTransferTarget ? (
								<div
									className="boardspace-todo-shape__drag-indicator"
									style={{
										top: taskTransferDragState.indicatorY ?? 0,
									}}
								/>
							) : null}
							{taskDrag && dragTask ? (
								<div
									className="boardspace-todo-shape__drag-preview"
									style={{
										top:
											taskDrag.currentClientY -
											(listRef.current?.getBoundingClientRect().top ?? 0) -
											taskDrag.offsetY,
										width: taskDrag.width,
									}}
								>
									<div
										className="boardspace-todo-shape__task-row boardspace-todo-shape__task-row--drag-preview"
										data-checked={dragTask.checked ? "true" : "false"}
										style={{
											height: taskDrag.height,
										}}
									>
										<div className="boardspace-todo-shape__checkbox" aria-hidden="true">
											{dragTask.checked ? (
												<span className="boardspace-todo-shape__checkbox-mark">✓</span>
											) : null}
										</div>
										<div
											className="boardspace-todo-shape__task-input boardspace-todo-shape__task-input--drag-preview"
											style={taskTextStyles}
										>
											{dragTask.text || "Add a task..."}
										</div>
										<div className="boardspace-todo-shape__drag-handle" aria-hidden="true">
											<span className="boardspace-todo-shape__drag-dots" />
										</div>
									</div>
								</div>
							) : null}
						</div>
					) : null}
				</div>
			</div>
		</HTMLContainer>
	);
}

function getBoardTodoSizeAdjustments(
	editor: BoardTodoShapeUtil["editor"],
	shape: BoardTodoShape,
) {
	const tasks = normalizeBoardTodoTasks(shape.props.tasks);
	const nextHeight = getBoardTodoMeasuredHeight(editor, {
		...shape,
		props: {
			...shape.props,
			tasks,
		},
	});

	if (tasks === shape.props.tasks && Math.abs(shape.props.h - nextHeight) < 1) {
		return;
	}

	return {
		...shape,
		props: {
			...shape.props,
			h: nextHeight,
			title: "",
			tasks,
		},
	};
}

export function getBoardTodoMeasuredHeight(
	editor: BoardTodoShapeUtil["editor"],
	shape: BoardTodoShape,
) {
	const normalizedTasks = normalizeBoardTodoTasks(shape.props.tasks);
	const rowGap = getBoardTodoRowGap(shape.props.size);
	const verticalPadding = getBoardTodoVerticalPadding(shape.props.size);
	const taskHeights = normalizedTasks.map((task) =>
		getBoardTodoTaskMeasuredHeight(editor, shape, task.text),
	);
	const taskHeight =
		taskHeights.reduce((sum, height) => sum + height, 0) +
		Math.max(0, taskHeights.length - 1) * rowGap;

	return Math.max(
		BOARD_TODO_MIN_HEIGHT,
		BOARD_TODO_TOP_BAR_HEIGHT + verticalPadding + taskHeight + verticalPadding,
	);
}

function getBoardTodoTaskMeasuredHeight(
	editor: BoardTodoShapeUtil["editor"],
	shape: BoardTodoShape,
	text: string,
) {
	const fontSize = LABEL_FONT_SIZES[shape.props.size];
	const minRowHeight = getBoardTodoRowHeight(shape.props.size);
	const availableWidth = getBoardTodoTaskTextWidth(shape);

	if (!text.trim()) {
		return minRowHeight;
	}

	const measurement = editor.textMeasure.measureText(text, {
		fontFamily: FONT_FAMILIES.sans,
		fontSize,
		fontStyle: "normal",
		fontWeight: "normal",
		lineHeight: BOARD_TODO_TEXT_LINE_HEIGHT,
		maxWidth: availableWidth,
		padding: "0",
	});

	return Math.max(minRowHeight, Math.ceil(measurement.h));
}

function getBoardTodoTaskTextWidth(shape: BoardTodoShape) {
	const horizontalPadding = getBoardTodoHorizontalPadding(shape.props.size);
	const checkboxSize = getBoardTodoCheckboxSize(shape.props.size);
	const dragHandleWidth = getBoardTodoDragHandleWidth(shape.props.size);

	return Math.max(
		1,
		shape.props.w -
			horizontalPadding * 2 -
			checkboxSize -
			dragHandleWidth -
			BOARD_TODO_ROW_ITEM_GAP * 2,
	);
}

function getBoardTodoTaskIndicator(
	listElement: HTMLDivElement | null,
	taskInputs: Map<string, HTMLTextAreaElement>,
	tasks: BoardTodoTask[],
	sourceIndex: number,
	size: TLDefaultSizeStyle,
	clientX: number,
	clientY: number,
) {
	const rowHeight = getBoardTodoRowHeight(size);
	const rowGap = getBoardTodoRowGap(size);

	if (!listElement || !isPointerInsideElement(listElement, clientX, clientY)) {
		return { index: null, y: null };
	}

	const remainingTasks = tasks.filter((_, taskIndex) => taskIndex !== sourceIndex);
	const rows = remainingTasks
		.map((task) => {
			const row = taskInputs.get(task.id)?.closest(
				".boardspace-todo-shape__task-row",
			) as HTMLElement | null;
			return row ? { id: task.id, rect: row.getBoundingClientRect() } : null;
		})
		.filter((value): value is { id: string; rect: DOMRect } => Boolean(value));
	const listRect = listElement.getBoundingClientRect();

	if (rows.length === 0) {
		return { index: 0, y: rowHeight / 2 };
	}

	for (let index = 0; index < rows.length; index += 1) {
		const row = rows[index];
		if (!row) {
			continue;
		}

		if (clientY < row.rect.top + row.rect.height / 2) {
			return {
				index,
				y: row.rect.top - listRect.top - rowGap / 2,
			};
		}
	}

	const lastRow = rows[rows.length - 1];
	if (!lastRow) {
		return { index: 0, y: rowHeight / 2 };
	}

	return {
		index: rows.length,
		y: lastRow.rect.bottom - listRect.top + rowGap / 2,
	};
}

function createBoardTodoShapeFromTaskDrop(
	editor: BoardTodoShapeUtil["editor"],
	sourceShape: BoardTodoShape,
	task: BoardTodoTask,
	clientPoint: { x: number; y: number },
) {
	const pagePoint = editor.screenToPage(clientPoint);
	const id = createShapeId();
	const nextHeight = getBoardTodoMeasuredHeight(editor, {
		...sourceShape,
		id,
		props: {
			...sourceShape.props,
			tasks: [{ ...task }],
		},
	});

	editor.createShape({
		id,
		type: "board-todo",
		x: pagePoint.x - sourceShape.props.w / 2,
		y: pagePoint.y - nextHeight / 2,
		props: {
			color: sourceShape.props.color,
			customColor: sourceShape.props.customColor,
			fill: sourceShape.props.fill,
			h: nextHeight,
			size: sourceShape.props.size,
			tasks: [
				{
					...task,
				},
			],
			title: "",
			topBarColor: sourceShape.props.topBarColor,
			topBarCustomColor: sourceShape.props.topBarCustomColor,
			w: sourceShape.props.w,
		},
	});

	editor.select(id);
}

function mergeBoardTodoShapeIntoDropTarget(
	editor: BoardTodoShapeUtil["editor"],
	sourceShape: BoardTodoShape,
) {
	const dragState = getBoardTodoDragState();
	if (
		!shouldMergeBoardTodoShapeOnDrop(editor, sourceShape) ||
		dragState.draggedShapeId !== sourceShape.id ||
		!dragState.targetShapeId
	) {
		return;
	}

	const targetShape = editor.getShape(dragState.targetShapeId);
	if (!targetShape) {
		return;
	}
	if (targetShape.type !== "board-todo" || targetShape.id === sourceShape.id) {
		return;
	}

	const sourceTask = sourceShape.props.tasks[0];
	if (!sourceTask || sourceTask.text.trim().length === 0) {
		return;
	}

	const targetTasks = getBoardTodoTasksForMergedDrop(
		targetShape.props.tasks,
		sourceTask,
		dragState.indicatorIndex,
	);
	editor.updateShape({
		id: targetShape.id,
		type: targetShape.type,
		props: {
			tasks: targetTasks,
		},
	});
	editor.deleteShapes([sourceShape.id]);
	editor.select(targetShape.id);
}

function updateTodoShape(
	editor: BoardTodoShapeUtil["editor"],
	shape: BoardTodoShape,
	props: Partial<BoardTodoShape["props"]>,
) {
	editor.updateShape({
		id: shape.id,
		type: shape.type,
		props,
	});
}

export function createBoardTodoTask(text = "", checked = false): BoardTodoTask {
	return {
		checked,
		id: `todo-task:${Math.random().toString(36).slice(2, 10)}`,
		text,
	};
}

function normalizeBoardTodoTasks(tasks: BoardTodoTask[]) {
	if (tasks.length === 0) {
		return [createBoardTodoTask()];
	}

	return tasks;
}

function removeBoardTodoTask(tasks: BoardTodoTask[], taskIndex: number) {
	const nextTasks = tasks.filter((_, index) => index !== taskIndex);

	return normalizeBoardTodoTasks(nextTasks);
}

function reorderBoardTodoTasks(
	tasks: BoardTodoTask[],
	sourceIndex: number,
	targetIndex: number,
) {
	const draggedTask = tasks[sourceIndex];
	if (!draggedTask) {
		return tasks;
	}

	const remainingTasks = tasks.filter((_, index) => index !== sourceIndex);
	remainingTasks.splice(targetIndex, 0, draggedTask);
	return remainingTasks;
}

function areBoardTodoTasksEqual(a: BoardTodoTask[], b: BoardTodoTask[]) {
	if (a.length !== b.length) {
		return false;
	}

	return a.every((task, index) => {
		const otherTask = b[index];
		if (!otherTask) {
			return false;
		}

		return (
			task.checked === otherTask.checked &&
			task.id === otherTask.id &&
			task.text === otherTask.text
		);
	});
}

function shouldMergeBoardTodoShapeOnDrop(
	editor: BoardTodoShapeUtil["editor"],
	shape: BoardTodoShape,
) {
	return (
		shape.parentId === editor.getCurrentPageId() &&
		shape.props.tasks.length === 1 &&
		shape.props.tasks[0]?.text.trim().length !== 0
	);
}

function getBoardTodoTasksForMergedDrop(
	targetTasks: BoardTodoTask[],
	sourceTask: BoardTodoTask,
	targetIndex: number | null,
) {
	const insertionIndex = Math.max(
		0,
		Math.min(targetTasks.length, targetIndex ?? targetTasks.length),
	);
	const nextTasks = [...targetTasks];
	nextTasks.splice(insertionIndex, 0, {
		...sourceTask,
	});
	return nextTasks;
}

function getBoardTodoMergeIndicator(
	editor: BoardTodoShapeUtil["editor"],
	shape: BoardTodoShape,
	pageY: number,
) {
	const listTop =
		BOARD_TODO_TOP_BAR_HEIGHT + getBoardTodoVerticalPadding(shape.props.size);
	const rowGap = getBoardTodoRowGap(shape.props.size);
	const listLocalY = pageY - shape.y - listTop;

	for (let index = 0; index < shape.props.tasks.length; index += 1) {
		const rowTop = getBoardTodoTaskOffsetY(editor, shape, index);
		const rowHeight = getBoardTodoTaskMeasuredHeight(
			editor,
			shape,
			shape.props.tasks[index]?.text ?? "",
		);
		if (listLocalY < rowTop + rowHeight / 2) {
			return {
				index,
				y: rowTop - rowGap / 2,
			};
		}
	}

	return {
		index: shape.props.tasks.length,
		y: getBoardTodoTaskOffsetY(editor, shape, shape.props.tasks.length) - rowGap / 2,
	};
}

function getBoardTodoTaskOffsetY(
	editor: BoardTodoShapeUtil["editor"],
	shape: BoardTodoShape,
	taskIndex: number,
) {
	let offsetY = 0;
	const rowGap = getBoardTodoRowGap(shape.props.size);

	for (let index = 0; index < taskIndex; index += 1) {
		offsetY += getBoardTodoTaskMeasuredHeight(
			editor,
			shape,
			shape.props.tasks[index]?.text ?? "",
		);
		offsetY += rowGap;
	}

	return offsetY;
}

function getBoardTodoShapeAtPagePoint(
	editor: BoardTodoShapeUtil["editor"],
	sourceShapeId: BoardTodoShape["id"],
	pagePoint: { x: number; y: number },
) {
	return editor
		.getShapesAtPoint(pagePoint, { hitInside: true })
		.find(
			(candidate): candidate is BoardTodoShape =>
				candidate.id !== sourceShapeId && candidate.type === "board-todo",
		);
}

function isPointerInsideElement(
	element: HTMLElement | null,
	clientX: number,
	clientY: number,
) {
	if (!element) {
		return false;
	}

	const rect = element.getBoundingClientRect();
	return (
		clientX >= rect.left &&
		clientX <= rect.right &&
		clientY >= rect.top &&
		clientY <= rect.bottom
	);
}
