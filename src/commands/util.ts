import { App, TFile, WorkspaceLeaf } from "obsidian";
import { BOARDSPACE_VIEW_TYPE } from "types/board";

export const MARKDOWN_VIEW_TYPE = "markdown";

export async function activateBoardView(
	app: App,
	file: TFile,
	leaf?: WorkspaceLeaf | null,
) {
	const { workspace } = app;

	const targetLeaf = leaf ?? workspace.activeLeaf ?? workspace.getLeaf(true);

	await targetLeaf.setViewState({
		type: BOARDSPACE_VIEW_TYPE,
		state: { file: file.path },
		active: true,
	});

	workspace.revealLeaf(targetLeaf);
}

export async function activateMarkdownView(
	app: App,
	file: TFile,
	leaf?: WorkspaceLeaf | null,
) {
	const { workspace } = app;

	const targetLeaf = leaf ?? workspace.activeLeaf ?? workspace.getLeaf(true);
	const existingState = targetLeaf.getViewState().state;
	const state =
		existingState && typeof existingState === "object"
			? { ...existingState, file: file.path }
			: { file: file.path };

	await targetLeaf.setViewState({
		type: MARKDOWN_VIEW_TYPE,
		state,
		active: true,
	});

	workspace.revealLeaf(targetLeaf);
}
