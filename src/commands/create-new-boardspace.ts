import { App, normalizePath } from "obsidian";
import { activateBoardView } from "./util";
import { serializeBoardspaceFile } from "files/boardspace-file";

export function getUniqueBoardspacePath(
	app: App,
	folderPath: string,
	baseName = "Untitled",
) {
	let counter = 0;

	while (true) {
		const filename = counter === 0 ? `${baseName}.md` : `${baseName} ${counter}.md`;
		const path = folderPath
			? normalizePath(`${folderPath}/${filename}`)
			: filename;

		if (!app.vault.getAbstractFileByPath(path)) {
			return path;
		}

		counter += 1;
	}
}

export async function createNewBoardspace(app: App) {
	const folder = app.fileManager.getNewFileParent(
		app.workspace.getActiveFile()?.path ?? "",
	);
	const filePath = getUniqueBoardspacePath(app, folder.path);

	const file = await app.vault.create(filePath, serializeBoardspaceFile(undefined));

	await activateBoardView(app, file);
}
