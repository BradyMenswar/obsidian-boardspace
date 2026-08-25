import { Plugin } from "obsidian";
import { BoardView } from "views/boardspace-view";
import { BOARDSPACE_VIEW_TYPE } from "types/board";
import { openCurrentFileAsBoardspace } from "commands/open-as-boardspace";
import { createNewBoardspace } from "commands/create-new-boardspace";
import { registerBoardspaceAutoOpen } from "workspace/auto-open-boardspace";

export default class BoardspacePlugin extends Plugin {
	private readonly boardViews = new Set<BoardView>();

	async onload() {
		this.registerView(BOARDSPACE_VIEW_TYPE, (leaf) => {
			const view = new BoardView(this, leaf);
			this.boardViews.add(view);
			return view;
		});
		registerBoardspaceAutoOpen(this);

		this.addCommand({
			id: "open-current-file-as-boardspace-board",
			name: "Open current file as board",
			checkCallback: (checking) =>
				openCurrentFileAsBoardspace(this.app, checking),
		});

		this.addCommand({
			id: "create-new-boardspace",
			name: "Create new board",
			callback: () => {
				void createNewBoardspace(this.app);
			},
		});
	}

	unregisterBoardView(view: BoardView) {
		this.boardViews.delete(view);
	}

	async onunload() {
		await Promise.all(
			Array.from(this.boardViews, (view) => view.flushPendingSave()),
		);
	}
}
