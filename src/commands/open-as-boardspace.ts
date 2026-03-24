import { App } from "obsidian";
import { activateBoardView } from "./util";

export function openCurrentFileAsBoardspace(app: App, checking: boolean) {
	const file = app.workspace.getActiveFile();
	if (!file || file.extension !== "md") return false;
	if (checking) return true;

	void activateBoardView(app, file, app.workspace.activeLeaf);
	return true;
}
