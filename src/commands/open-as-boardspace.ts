import { App, Notice, normalizePath } from "obsidian";
import { serializeBoardspaceFile } from "files/boardspace-file";
import { isBoardspaceFile } from "files/boardspace-frontmatter";
import { activateBoardView } from "./util";
import { getUniqueBoardspacePath } from "./create-new-boardspace";

export function openCurrentFileAsBoardspace(app: App, checking: boolean) {
	const file = app.workspace.getActiveFile();
	if (!file || file.extension !== "md") return false;
	if (checking) return true;

	void openOrCreateBoardspaceForFile(app, file);
	return true;
}

async function openOrCreateBoardspaceForFile(
	app: App,
	file: NonNullable<ReturnType<App["workspace"]["getActiveFile"]>>,
) {
	if (await isBoardspaceFile(app, file)) {
		await activateBoardView(app, file, app.workspace.getLeaf(false));
		return;
	}

	const parentPath = file.parent?.path ?? "";
	const basePath = parentPath
		? normalizePath(`${parentPath}/${file.basename} Boardspace`)
		: `${file.basename} Boardspace`;
	const boardspacePath = getUniqueBoardspacePath(app, "", basePath);
	const boardspaceFile = await app.vault.create(
		boardspacePath,
		serializeBoardspaceFile(undefined),
	);

	new Notice(`Created ${boardspaceFile.basename}; the original note was left unchanged.`);
	await activateBoardView(app, boardspaceFile, app.workspace.getLeaf(false));
}
