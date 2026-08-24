import { Editor, TLShapePartial } from "tldraw";
import { createBoardTableNestedIdentity } from "./board-table-shape";

export function registerBoardTableIdentityNormalization(editor: Editor) {
	let isNormalizing = false;

	return editor.sideEffects.registerOperationCompleteHandler(() => {
		if (isNormalizing) return;

		const seenIds = new Set<string>();
		const updates: TLShapePartial[] = [];
		for (const shape of editor.getCurrentPageShapes()) {
			if (shape.type !== "board-table") continue;
			const nestedIds = [
				...shape.props.columns.map((column) => column.id),
				...shape.props.rows.map((row) => row.id),
			];
			if (nestedIds.some((id) => seenIds.has(id))) {
				const columnIds = new Map(
					shape.props.columns.map((column) => [
						column.id,
						createBoardTableNestedIdentity("table-column"),
					]),
				);
				updates.push({
					id: shape.id,
					type: shape.type,
					props: {
						columns: shape.props.columns.map((column) => ({
							...column,
							id: columnIds.get(column.id)!,
						})),
						rows: shape.props.rows.map((row) => ({
							...row,
							id: createBoardTableNestedIdentity("table-row"),
							cells: row.cells.map((cell) => ({
								...cell,
								columnId: columnIds.get(cell.columnId) ?? cell.columnId,
							})),
						})),
					},
				});
				continue;
			}
			for (const id of nestedIds) seenIds.add(id);
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
