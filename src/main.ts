import { Plugin } from "obsidian";
import { BoardView } from "views/boardspace-view";
import { BOARDSPACE_VIEW_TYPE } from "types/board";
import { openCurrentFileAsBoardspace } from "commands/open-as-boardspace";
import { createNewBoardspace } from "commands/create-new-boardspace";
import { registerBoardspaceAutoOpen } from "workspace/auto-open-boardspace";

export default class BoardspacePlugin extends Plugin {
	async onload() {
		this.registerView(BOARDSPACE_VIEW_TYPE, (leaf) => new BoardView(this, leaf));
		registerBoardspaceAutoOpen(this);

		this.addCommand({
			id: "open-current-file-as-boardspace-board",
			name: "Open current file as Boardspace",
			checkCallback: (checking) =>
				openCurrentFileAsBoardspace(this.app, checking),
		});

		this.addCommand({
			id: "create-new-boardspace",
			name: "Create new Boardspace",
			callback: async () => createNewBoardspace(this.app),
		});
	}

	async onunload() {
		this.app.workspace.detachLeavesOfType(BOARDSPACE_VIEW_TYPE);
	}
}
