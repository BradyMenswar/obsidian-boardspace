import { AppContext } from "context/app-context";
import {
	BoardspaceEditorState,
	createSchemaV2BoardspaceDocumentAdapter,
} from "files/boardspace-document-adapter";
import { BoardspaceDocumentLifecycle } from "files/boardspace-document-lifecycle";
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
	private hasShownUnsafeSaveNotice = false;
	private readonly documentLifecycle: BoardspaceDocumentLifecycle<BoardspaceEditorState>;

	constructor(plugin: BoardspacePlugin, leaf: WorkspaceLeaf) {
		super(leaf);
		this.plugin = plugin;
		this.documentLifecycle = new BoardspaceDocumentLifecycle({
			documentAdapter: createSchemaV2BoardspaceDocumentAdapter(),
			requestSave: async () => this.save(false),
			scheduler: {
				schedule: (callback, delay) => window.setTimeout(callback, delay),
				cancel: (handle) => window.clearTimeout(handle),
			},
			onSaveError: (error) => {
				console.error("Boardspace failed to save.", error);
				new Notice("Boardspace failed to save. Check the developer console for details.");
			},
		});
	}

	clear() {
		this.documentLifecycle.clearEditorState();
	}

	getViewType() {
		return BOARDSPACE_VIEW_TYPE;
	}

	getViewData() {
		return this.documentLifecycle.getViewData();
	}

	setViewData(data: string, clear: boolean) {
		this.documentLifecycle.loadSource(data);
		this.renderVersion += 1;

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
		await this.documentLifecycle.flushPendingSave();
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

		const loadOutcome = this.documentLifecycle.getLoadOutcome();
		this.root.render(
			<AppContext.Provider value={this.app}>
				{loadOutcome?.status === "read-only" ? (
					<div style={{ maxWidth: "640px", padding: "24px" }}>
						<h2>Boardspace could not open this file</h2>
						<ul>
							{loadOutcome.diagnostics.map((diagnostic) => (
								<li key={`${diagnostic.code}:${diagnostic.message}`}>
									{diagnostic.message}
								</li>
							))}
						</ul>
						<button type="button" onClick={() => void this.openAsMarkdown()}>
							Open as markdown
						</button>
					</div>
				) : (
					<BoardspaceEditor
						file={this.file}
						isActive={this.isLeafActive}
						loadKey={`${this.file?.path ?? "boardspace"}:${this.renderVersion}`}
						onSnapshotChange={this.handleSnapshotChange}
						snapshot={loadOutcome?.editorState}
					/>
				)}
			</AppContext.Provider>,
		);
	}

	private readonly handleSnapshotChange = (state: BoardspaceEditorState) => {
		const outcome = this.documentLifecycle.updateEditorState(state);
		if (outcome.status === "save-blocked") {
			this.showUnsafeSaveNotice();
		}
	};

	private async openAsMarkdown() {
		if (!this.file) {
			return;
		}

		await openBoardspaceFileAsMarkdown(this.plugin, this.file, this.leaf);
	}

	private showUnsafeSaveNotice() {
		if (this.hasShownUnsafeSaveNotice) {
			return;
		}

		this.hasShownUnsafeSaveNotice = true;
		new Notice("Boardspace did not save because this document is read-only.");
	}
}
