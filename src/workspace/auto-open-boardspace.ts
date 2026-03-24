import { Plugin, TFile, WorkspaceLeaf } from "obsidian";
import { activateBoardView } from "commands/util";
import { isBoardspaceFile } from "files/boardspace-frontmatter";
import { BOARDSPACE_VIEW_TYPE } from "types/board";

const MARKDOWN_VIEW_TYPE = "markdown";

export function registerBoardspaceAutoOpen(plugin: Plugin) {
	plugin.registerEvent(
		plugin.app.workspace.on("file-open", (file) => {
			if (!file) {
				return;
			}

			void maybeOpenBoardspaceFile(plugin, file, plugin.app.workspace.activeLeaf);
		}),
	);

	plugin.app.workspace.onLayoutReady(() => {
		const leaves = plugin.app.workspace.getLeavesOfType(MARKDOWN_VIEW_TYPE);
		for (const leaf of leaves) {
			const file = getLeafFile(plugin, leaf);
			if (!file) {
				continue;
			}

			void maybeOpenBoardspaceFile(plugin, file, leaf);
		}
	});
}

async function maybeOpenBoardspaceFile(
	plugin: Plugin,
	file: TFile,
	leaf: WorkspaceLeaf | null,
) {
	if (file.extension !== "md" || !leaf) {
		return;
	}

	const viewType = leaf.getViewState().type;
	if (viewType !== MARKDOWN_VIEW_TYPE) {
		return;
	}

	if (!(await isBoardspaceFile(plugin.app, file))) {
		return;
	}

	await activateBoardView(plugin.app, file, leaf);
}

function getLeafFile(plugin: Plugin, leaf: WorkspaceLeaf): TFile | null {
	const path = leaf.getViewState().state?.file;
	if (typeof path !== "string") {
		return null;
	}

	const file = plugin.app.vault.getAbstractFileByPath(path);
	return file instanceof TFile ? file : null;
}
