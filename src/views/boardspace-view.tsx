import { AppContext } from "context/app-context";
import { parseBoardspaceFile, serializeBoardspaceFile } from "files/boardspace-file";
import { TLEditorSnapshot } from "tldraw";
import { TextFileView, WorkspaceLeaf } from "obsidian";
import { Root, createRoot } from "react-dom/client";
import { BOARDSPACE_VIEW_TYPE } from "types/board";
import { BoardspaceEditor } from "tldraw/boardspace-editor";

export class BoardView extends TextFileView {
	root: Root | null = null;
	private reactHost: HTMLDivElement | null = null;
	private renderVersion = 0;
	private saveTimer: number | null = null;
	private snapshot: TLEditorSnapshot | undefined;

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
	}

	clear() {
		this.snapshot = undefined;
	}

	getViewType() {
		return BOARDSPACE_VIEW_TYPE;
	}

	getViewData() {
		return serializeBoardspaceFile(this.snapshot);
	}

	setViewData(data: string, clear: boolean) {
		this.snapshot = parseBoardspaceFile(data);
		this.renderVersion += 1;
		this.renderView();
	}

	getDisplayText() {
		return this.file?.basename ?? "Board view";
	}

	canAcceptExtension(extension: string) {
		return extension === "md";
	}

	async onOpen() {
		this.contentEl.empty();
		this.contentEl.addClass("boardspace-view");
		this.contentEl.style.padding = "0";
		this.reactHost = this.contentEl.createDiv({
			cls: "boardspace-view__root",
		});

		this.root = createRoot(this.reactHost);
		this.renderView();
	}

	async onClose() {
		this.flushPendingSave();
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
					loadKey={`${this.file?.path ?? "boardspace"}:${this.renderVersion}`}
					onSnapshotChange={this.handleSnapshotChange}
					snapshot={this.snapshot}
				/>
			</AppContext.Provider>,
		);
	}

	private readonly handleSnapshotChange = (snapshot: TLEditorSnapshot) => {
		this.snapshot = snapshot;
		this.queueSave();
	};

	private queueSave() {
		if (this.saveTimer !== null) {
			window.clearTimeout(this.saveTimer);
		}

		this.saveTimer = window.setTimeout(() => {
			this.saveTimer = null;
			void this.save(false);
		}, 150);
	}

	private flushPendingSave() {
		if (this.saveTimer === null) {
			return;
		}

		window.clearTimeout(this.saveTimer);
		this.saveTimer = null;
		void this.save(false);
	}
}
