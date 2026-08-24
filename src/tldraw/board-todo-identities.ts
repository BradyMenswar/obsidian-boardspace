import { Editor, TLShapePartial } from "tldraw";
import { createBoardTodoTask } from "./board-todo-shape";

export function registerBoardTodoIdentityNormalization(editor: Editor) {
	let isNormalizing = false;

	return editor.sideEffects.registerOperationCompleteHandler(() => {
		if (isNormalizing) return;

		const seenTaskIds = new Set<string>();
		const updates: TLShapePartial[] = [];
		for (const shape of editor.getCurrentPageShapes()) {
			if (shape.type !== "board-todo") continue;

			const hasDuplicate = shape.props.tasks.some((task) => seenTaskIds.has(task.id));
			if (hasDuplicate) {
				updates.push({
					id: shape.id,
					type: shape.type,
					props: {
						tasks: shape.props.tasks.map((task) =>
							createBoardTodoTask(task.text, task.checked),
						),
					},
				});
				continue;
			}

			for (const task of shape.props.tasks) seenTaskIds.add(task.id);
		}
		if (updates.length === 0) return;

		isNormalizing = true;
		try {
			editor.run(() => editor.updateShapes(updates), { history: "ignore" });
		} finally {
			isNormalizing = false;
		}
	});
}
