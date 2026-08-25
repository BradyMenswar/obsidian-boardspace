import test from "node:test";
import assert from "node:assert/strict";
import type { Editor, TLShape } from "tldraw";
import { registerBoardColumnPersistence } from "../src/tldraw/board-column-persistence";

function createEditorWithNonEmptyColumn() {
	let deleteCalls = 0;
	const column = { id: "shape:column-1", type: "board-column" } as TLShape;
	const editor = {
		sideEffects: { registerBeforeChangeHandler: () => () => undefined },
		getShape: (id: string) => id === column.id ? column : undefined,
		getSortedChildIdsForParent: () => ["shape:card-1"],
		deleteShapes: () => { deleteCalls += 1; return editor; },
	} as unknown as Editor;
	return { editor, getDeleteCalls: () => deleteCalls };
}

test("confirms before deleting a non-empty column and starts one atomic editor deletion", () => {
	const declined = createEditorWithNonEmptyColumn();
	let confirmations = 0;
	registerBoardColumnPersistence(declined.editor, () => { confirmations += 1; return false; });
	declined.editor.deleteShapes(["shape:column-1" as TLShape["id"]]);
	assert.equal(confirmations, 1);
	assert.equal(declined.getDeleteCalls(), 0);

	const accepted = createEditorWithNonEmptyColumn();
	registerBoardColumnPersistence(accepted.editor, () => true);
	accepted.editor.deleteShapes(["shape:column-1" as TLShape["id"]]);
	assert.equal(accepted.getDeleteCalls(), 1);
});
