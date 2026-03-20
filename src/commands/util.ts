import { App, TFile } from "obsidian";
import { BOARDSPACE_VIEW_TYPE } from "types/board";

export async function activateBoardView(app: App, file: TFile) {
	const { workspace } = app;

	const leaf =
		workspace.getLeavesOfType(BOARDSPACE_VIEW_TYPE)[0] ??
		workspace.getLeaf(true);

	await leaf.setViewState({
		type: BOARDSPACE_VIEW_TYPE,
		state: { file: file.path },
		active: true,
	});

	workspace.revealLeaf(leaf);
}
