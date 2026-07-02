import { Plugin, TFile, ViewState, WorkspaceLeaf } from "obsidian";
import { activateBoardView, activateMarkdownView, MARKDOWN_VIEW_TYPE } from "commands/util";
import { hasBoardspaceFrontmatter, isBoardspaceFile } from "files/boardspace-frontmatter";
import { BOARDSPACE_VIEW_TYPE } from "types/board";

const forcedMarkdownPaths = new Set<string>();

export function registerBoardspaceAutoOpen(plugin: Plugin) {
	patchLeafViewState(plugin);
	plugin.registerEvent(
		plugin.app.workspace.on("file-open", (file) => {
			if (!file) {
				return;
			}

				void syncActiveLeafAfterFileOpen(
					plugin,
					file,
					plugin.app.workspace.getLeaf(false),
				);
		}),
	);

	plugin.app.workspace.onLayoutReady(() => {
		for (const leaf of plugin.app.workspace.getLeavesOfType(MARKDOWN_VIEW_TYPE)) {
			const file = getLeafFile(plugin, leaf);
			if (!file) {
				continue;
			}

			void maybeOpenBoardspaceFile(plugin, file, leaf);
		}

		for (const leaf of plugin.app.workspace.getLeavesOfType(BOARDSPACE_VIEW_TYPE)) {
			const file = getLeafFile(plugin, leaf);
			if (!file) {
				continue;
			}

			void maybeOpenMarkdownFile(plugin, file, leaf);
		}
	});
}

export async function openBoardspaceFileAsMarkdown(
	plugin: Plugin,
	file: TFile,
	leaf?: WorkspaceLeaf | null,
) {
	forcedMarkdownPaths.add(file.path);

	try {
		await activateMarkdownView(plugin.app, file, leaf);
	} catch (error) {
		forcedMarkdownPaths.delete(file.path);
		throw error;
	}
}

function patchLeafViewState(plugin: Plugin) {
	const originalSetViewState = WorkspaceLeaf.prototype.setViewState;

	const patchedSetViewState: typeof WorkspaceLeaf.prototype.setViewState =
		async function (this: WorkspaceLeaf, viewState, eState) {
			const nextViewState = await resolveBoardspaceViewState(
				plugin,
				viewState,
			);

			return originalSetViewState.call(this, nextViewState, eState);
		};

	WorkspaceLeaf.prototype.setViewState = patchedSetViewState;

	plugin.register(() => {
		if (WorkspaceLeaf.prototype.setViewState === patchedSetViewState) {
			WorkspaceLeaf.prototype.setViewState = originalSetViewState;
		}
	});
}

async function resolveBoardspaceViewState(
	plugin: Plugin,
	viewState: ViewState,
): Promise<ViewState> {
	if (viewState.type !== MARKDOWN_VIEW_TYPE) {
		return viewState;
	}

	const path = viewState.state?.file;
	if (typeof path !== "string") {
		return viewState;
	}

	if (forcedMarkdownPaths.has(path)) {
		return viewState;
	}

	const file = plugin.app.vault.getAbstractFileByPath(path);
	if (!(file instanceof TFile) || file.extension !== "md") {
		return viewState;
	}

	if (!hasBoardspaceFrontmatter(plugin.app.metadataCache.getFileCache(file))) {
		return viewState;
	}

	return {
		...viewState,
		type: BOARDSPACE_VIEW_TYPE,
	};
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

async function maybeOpenMarkdownFile(
	plugin: Plugin,
	file: TFile,
	leaf: WorkspaceLeaf | null,
) {
	if (file.extension !== "md" || !leaf) {
		return;
	}

	if (leaf.getViewState().type !== BOARDSPACE_VIEW_TYPE) {
		return;
	}

	if (await isBoardspaceFile(plugin.app, file)) {
		return;
	}

	await activateMarkdownView(plugin.app, file, leaf);
}

async function syncActiveLeafAfterFileOpen(
	plugin: Plugin,
	file: TFile,
	leaf: WorkspaceLeaf | null,
) {
	await maybeOpenMarkdownFile(plugin, file, leaf);
}

function getLeafFile(plugin: Plugin, leaf: WorkspaceLeaf): TFile | null {
	const path = leaf.getViewState().state?.file;
	if (typeof path !== "string") {
		return null;
	}

	const file = plugin.app.vault.getAbstractFileByPath(path);
	return file instanceof TFile ? file : null;
}
