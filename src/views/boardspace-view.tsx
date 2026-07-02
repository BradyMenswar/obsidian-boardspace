import { AppContext } from "context/app-context";
import {
	isSupportedBoardspaceVersion,
	parseBoardspaceFileWithMetadata,
	serializeBoardspaceFile,
} from "files/boardspace-file";
import { TLEditorSnapshot } from "tldraw";
import { Menu, Notice, TextFileView, WorkspaceLeaf } from "obsidian";
import { Root, createRoot } from "react-dom/client";
import { BOARDSPACE_VIEW_TYPE } from "types/board";
import { BoardspaceEditor } from "tldraw/boardspace-editor";
import type BoardspacePlugin from "main";
import { openBoardspaceFileAsMarkdown } from "workspace/auto-open-boardspace";

export class BoardView extends TextFileView {
	private readonly plugin: BoardspacePlugin;
	root: Root | null = null;
	private reactHost: HTMLDivElement | null = null;
	private isLeafActive = false;
	private renderVersion = 0;
	private saveTimer: number | null = null;
	private savePromise: Promise<void> = Promise.resolve();
	private snapshot: TLEditorSnapshot | undefined;
	private sourceData = "";
	private isBoardspaceDocument = false;
	private hasShownUnsafeSaveNotice = false;

	constructor(plugin: BoardspacePlugin, leaf: WorkspaceLeaf) {
		super(leaf);
		this.plugin = plugin;
	}

	clear() {
		this.snapshot = undefined;
	}

	getViewType() {
		return BOARDSPACE_VIEW_TYPE;
	}

	getViewData() {
		if (!this.isBoardspaceDocument) {
			return this.sourceData;
		}

		return serializeBoardspaceFile(this.snapshot);
	}

	setViewData(data: string, clear: boolean) {
		const { snapshot, version } = parseBoardspaceFileWithMetadata(data);
		this.sourceData = data;
		this.isBoardspaceDocument = isSupportedBoardspaceVersion(version);
		this.snapshot = snapshot;
		this.renderVersion += 1;

		if (!this.isBoardspaceDocument && data.trim().length > 0) {
			this.showUnsafeSaveNotice();
		}

		this.renderView();
	}

	getDisplayText() {
		return this.file?.basename ?? "Board view";
	}

	canAcceptExtension(extension: string) {
		return extension === "md";
	}

	onPaneMenu(menu: Menu, source: string) {
		super.onPaneMenu(menu, source);

		if (!this.file) {
			return;
		}

		menu.addItem((item) =>
			item
				.setTitle("Open as markdown")
				.setIcon("document")
				.onClick(() => {
					if (!this.file) {
						return;
					}

					void openBoardspaceFileAsMarkdown(
						this.plugin,
						this.file,
						this.leaf,
					);
				}),
		);
	}

	async onOpen() {
		this.contentEl.empty();
		this.contentEl.addClass("boardspace-view");
		this.contentEl.style.padding = "0";
		this.isLeafActive = this.app.workspace.getLeaf(false) === this.leaf;
		this.reactHost = this.contentEl.createDiv({
			cls: "boardspace-view__root",
		});

		this.registerEvent(
			this.app.workspace.on("active-leaf-change", (leaf) => {
				const nextIsActive = leaf === this.leaf;
				if (nextIsActive === this.isLeafActive) {
					return;
				}

				this.isLeafActive = nextIsActive;
				this.renderView();
			}),
		);

		this.root = createRoot(this.reactHost);
		this.renderView();
	}

	async onClose() {
		await this.flushPendingSave();
		this.contentEl.removeClass("boardspace-view");
		this.contentEl.style.removeProperty("padding");
		this.root?.unmount();
		this.root = null;
		this.reactHost?.remove();
		this.reactHost = null;
	}

	private renderView() {
		if (!this.root) {
			return;
		}

		this.root.render(
			<AppContext.Provider value={this.app}>
				<BoardspaceEditor
					file={this.file}
					isActive={this.isLeafActive}
					loadKey={`${this.file?.path ?? "boardspace"}:${this.renderVersion}`}
					onSnapshotChange={this.handleSnapshotChange}
					snapshot={this.snapshot}
				/>
			</AppContext.Provider>,
		);
	}

	private readonly handleSnapshotChange = (snapshot: TLEditorSnapshot) => {
		if (!this.isBoardspaceDocument) {
			this.showUnsafeSaveNotice();
			return;
		}

		this.snapshot = snapshot;
		this.queueSave();
	};

	private queueSave() {
		if (this.saveTimer !== null) {
			window.clearTimeout(this.saveTimer);
		}

		this.saveTimer = window.setTimeout(() => {
			this.saveTimer = null;
			void this.persistPendingSave();
		}, 150);
	}

	private async flushPendingSave() {
		if (this.saveTimer !== null) {
			window.clearTimeout(this.saveTimer);
			this.saveTimer = null;
			await this.persistPendingSave();
			return;
		}

		await this.savePromise;
	}

	private async persistPendingSave() {
		if (!this.isBoardspaceDocument) {
			this.showUnsafeSaveNotice();
			return;
		}

		this.savePromise = this.savePromise
			.then(async () => {
				await this.save(false);
			})
			.catch((error) => {
				console.error("Boardspace failed to save.", error);
				new Notice("Boardspace failed to save. Check the developer console for details.");
			});

		await this.savePromise;
	}

	private showUnsafeSaveNotice() {
		if (this.hasShownUnsafeSaveNotice) {
			return;
		}

		this.hasShownUnsafeSaveNotice = true;
		new Notice("Boardspace did not save because this file is not a supported Boardspace note.");
	}
}
