import test from "node:test";
import assert from "node:assert/strict";
import { BoardspaceViewCoordinator } from "../src/workspace/boardspace-view-coordinator";

interface TestLeaf {
	id: string;
	boardspacePath: string | null;
}

function createHarness() {
	const leaves: TestLeaf[] = [];
	const revealed: TestLeaf[] = [];
	const closed: TestLeaf[] = [];
	const coordinator = new BoardspaceViewCoordinator<TestLeaf>({
		getOpenBoardspaceLeaves: () => leaves,
		getBoardspacePath: (leaf) => leaf.boardspacePath,
		revealLeaf: async (leaf) => {
			revealed.push(leaf);
		},
		closeLeaf: async (leaf) => {
			closed.push(leaf);
			leaf.boardspacePath = null;
		},
	});

	return { coordinator, leaves, revealed, closed };
}

test("opening an open Boardspace document reuses its editable leaf", async () => {
	const { coordinator, leaves, revealed } = createHarness();
	const existingLeaf: TestLeaf = {
		id: "existing",
		boardspacePath: "Boards/Plan.md",
	};
	const requestedLeaf: TestLeaf = { id: "requested", boardspacePath: null };
	leaves.push(existingLeaf, requestedLeaf);
	let openedRequestedLeaf = false;

	const result = await coordinator.open(
		"Boards/Plan.md",
		requestedLeaf,
		async () => {
			openedRequestedLeaf = true;
			requestedLeaf.boardspacePath = "Boards/Plan.md";
		},
	);

	assert.equal(result, existingLeaf);
	assert.equal(openedRequestedLeaf, false);
	assert.deepEqual(revealed, [existingLeaf]);
});

test("concurrent workspace restore claims one editable leaf per document", async () => {
	const { coordinator, leaves, revealed } = createHarness();
	const firstLeaf: TestLeaf = { id: "first", boardspacePath: null };
	const duplicateLeaf: TestLeaf = { id: "duplicate", boardspacePath: null };
	leaves.push(firstLeaf, duplicateLeaf);
	let finishFirstOpen: (() => void) | undefined;
	const firstOpenReady = new Promise<void>((resolve) => {
		finishFirstOpen = resolve;
	});
	let duplicateOpenCount = 0;

	const firstOpen = coordinator.open("Boards/Plan.md", firstLeaf, async () => {
		await firstOpenReady;
		firstLeaf.boardspacePath = "Boards/Plan.md";
	});
	const duplicateOpen = coordinator.open(
		"Boards/Plan.md",
		duplicateLeaf,
		async () => {
			duplicateOpenCount += 1;
			duplicateLeaf.boardspacePath = "Boards/Plan.md";
		},
	);

	finishFirstOpen?.();
	const [firstResult, duplicateResult] = await Promise.all([
		firstOpen,
		duplicateOpen,
	]);

	assert.equal(firstResult, firstLeaf);
	assert.equal(duplicateResult, firstLeaf);
	assert.equal(duplicateOpenCount, 0);
	assert.deepEqual(revealed, [firstLeaf, firstLeaf]);
});

test("workspace reconciliation closes restored duplicate editable leaves", async () => {
	const { coordinator, leaves, closed } = createHarness();
	const firstLeaf: TestLeaf = {
		id: "first",
		boardspacePath: "Boards/Plan.md",
	};
	const duplicateLeaf: TestLeaf = {
		id: "duplicate",
		boardspacePath: "Boards/Plan.md",
	};
	const otherBoardLeaf: TestLeaf = {
		id: "other",
		boardspacePath: "Boards/Notes.md",
	};
	leaves.push(firstLeaf, duplicateLeaf, otherBoardLeaf);

	await coordinator.reconcile();

	assert.deepEqual(closed, [duplicateLeaf]);
	assert.equal(firstLeaf.boardspacePath, "Boards/Plan.md");
	assert.equal(otherBoardLeaf.boardspacePath, "Boards/Notes.md");
});

test("different Boardspace documents open in independently editable leaves", async () => {
	const { coordinator, leaves } = createHarness();
	const planLeaf: TestLeaf = { id: "plan", boardspacePath: null };
	const notesLeaf: TestLeaf = { id: "notes", boardspacePath: null };
	leaves.push(planLeaf, notesLeaf);

	const [planResult, notesResult] = await Promise.all([
		coordinator.open("Boards/Plan.md", planLeaf, async () => {
			planLeaf.boardspacePath = "Boards/Plan.md";
		}),
		coordinator.open("Boards/Notes.md", notesLeaf, async () => {
			notesLeaf.boardspacePath = "Boards/Notes.md";
		}),
	]);

	assert.equal(planResult, planLeaf);
	assert.equal(notesResult, notesLeaf);
	assert.equal(planLeaf.boardspacePath, "Boards/Plan.md");
	assert.equal(notesLeaf.boardspacePath, "Boards/Notes.md");
});
