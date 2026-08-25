import test from "node:test";
import assert from "node:assert/strict";
import {
	BoardspaceDocumentHistory,
	classifyBoardspaceTextChange,
	type BoardspaceDocumentHistoryEditor,
	type BoardspaceHistoryScheduler,
} from "../src/tldraw/boardspace-document-history";

function createHarness() {
	const events: string[] = [];
	let nextTimer = 0;
	const timers = new Map<number, () => void>();
	const editor: BoardspaceDocumentHistoryEditor = {
		markHistoryStoppingPoint: (name) => {
			events.push(`mark:${name}`);
			return name;
		},
		undo: () => { events.push("undo"); },
		redo: () => { events.push("redo"); },
	};
	const scheduler: BoardspaceHistoryScheduler = {
		schedule: (callback) => {
			const handle = ++nextTimer;
			timers.set(handle, callback);
			return handle;
		},
		cancel: (handle) => { timers.delete(handle); },
	};
	const history = new BoardspaceDocumentHistory(editor, scheduler);
	const elapsePause = () => {
		const callbacks = [...timers.values()];
		timers.clear();
		callbacks.forEach((callback) => callback());
	};
	return { events, history, elapsePause };
}

test("classifies CodeMirror typing and deletion events for grouping", () => {
	assert.equal(classifyBoardspaceTextChange(["input.type"], true, false), "typing");
	assert.equal(classifyBoardspaceTextChange(["input.type"], false, true), "deleting");
	assert.equal(classifyBoardspaceTextChange(["delete.backward"], false, true), "deleting");
	assert.equal(classifyBoardspaceTextChange(["delete.forward"], false, true), "deleting");
	assert.equal(classifyBoardspaceTextChange(["input.paste"], true, false), "command");
});

test("adjacent Markdown typing coalesces until an idle pause", () => {
	const { events, history, elapsePause } = createHarness();

	history.recordTextChange("card-1", "typing", () => events.push("type:a"));
	history.recordTextChange("card-1", "typing", () => events.push("type:b"));
	elapsePause();
	history.recordTextChange("card-1", "typing", () => events.push("type:c"));

	assert.deepEqual(events, [
		"mark:edit text card",
		"type:a",
		"type:b",
		"mark:finish text card edit",
		"mark:edit text card",
		"type:c",
	]);
});

test("typing, deletion, different cards, and explicit commands create boundaries", () => {
	const { events, history } = createHarness();

	history.recordTextChange("card-1", "typing", () => events.push("type"));
	history.recordTextChange("card-1", "deleting", () => events.push("delete"));
	history.recordTextChange("card-2", "deleting", () => events.push("other-card"));
	history.recordTextChange("card-2", "command", () => events.push("paste"));
	history.finishTextGroup();

	assert.deepEqual(events, [
		"mark:edit text card",
		"type",
		"mark:edit text card",
		"delete",
		"mark:edit text card",
		"other-card",
		"mark:edit text card",
		"paste",
		"mark:finish text card edit",
	]);
});

test("an immediate canvas command starts after the active text transaction", () => {
	const { events, history } = createHarness();

	history.recordTextChange("card-1", "typing", () => events.push("type"));
	history.beforeCanvasCommand();
	events.push("canvas");

	assert.deepEqual(events, [
		"mark:edit text card",
		"type",
		"mark:finish text card edit",
		"canvas",
	]);
});

test("undo and redo finish focused text edits before using document history", () => {
	const { events, history } = createHarness();

	history.recordTextChange("card-1", "typing", () => events.push("type"));
	history.undo();
	history.redo();

	assert.deepEqual(events, [
		"mark:edit text card",
		"type",
		"mark:finish text card edit",
		"undo",
		"redo",
	]);
});

test("open documents keep independent text grouping state", () => {
	const first = createHarness();
	const second = createHarness();

	first.history.recordTextChange("card-1", "typing", () => first.events.push("first"));
	second.history.recordTextChange("card-1", "typing", () => second.events.push("second"));
	first.elapsePause();

	assert.deepEqual(first.events, [
		"mark:edit text card",
		"first",
		"mark:finish text card edit",
	]);
	assert.deepEqual(second.events, ["mark:edit text card", "second"]);
});
