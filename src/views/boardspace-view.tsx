import { AppContext } from "context/app-context";
import {
	BoardspaceEditorState,
	createSchemaV2BoardspaceDocumentAdapter,
	editorStateReferencesBoardLinkTarget,
	editorStateReferencesMediaAttachment,
	updateBoardLinkTargetPath,
	updateMediaAttachmentPath,
} from "files/boardspace-document-adapter";
import { BoardspaceDocumentLifecycle } from "files/boardspace-document-lifecycle";
import { Menu, Notice, TextFileView, TFile, WorkspaceLeaf } from "obsidian";
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
			requestSave: async (source, expectedSource) => {
				if (!this.file) {
					throw new Error("The Boardspace file is no longer open.");
				}

				let externalSource: string | undefined;
				await this.app.vault.process(this.file, (currentSource) => {
					if (currentSource !== expectedSource && currentSource !== source) {
						externalSource = currentSource;
						return currentSource;
					}
					return source;
				});
				return externalSource === undefined
					? { status: "saved" as const }
					: { status: "conflict" as const, externalSource };
			},
			scheduler: {
				schedule: (callback, delay) => window.setTimeout(callback, delay),
				cancel: (handle) => window.clearTimeout(handle),
			},
			onConflict: () => {
				this.renderView();
			},
			onSaveError: (error) => {
				console.error("Boardspace failed to save.", error);
				const details = error instanceof Error ? error.message : String(error);
				new Notice(`Boardspace did not save: ${details}`);
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
		if (clear || !this.documentLifecycle.getLoadOutcome()) {
			this.documentLifecycle.loadSource(data);
		} else {
			this.documentLifecycle.receiveExternalSource(data);
		}
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
				if (!nextIsActive) {
					void this.documentLifecycle.flushPendingSave();
				}
				this.renderView();
			}),
		);
		this.registerEvent(
			this.app.vault.on("rename", (file, oldPath) => {
				this.handleVaultRename(oldPath, file.path);
			}),
		);
		this.registerEvent(
			this.app.vault.on("delete", (file) => {
				this.handleVaultDelete(file.path);
			}),
		);

		this.root = createRoot(this.reactHost);
		this.renderView();
	}

	async onUnloadFile(file: TFile) {
		await this.documentLifecycle.flushPendingSave();
		await super.onUnloadFile(file);
	}

	async onClose() {
		await this.documentLifecycle.flushPendingSave();
		this.contentEl.removeClass("boardspace-view");
		this.contentEl.style.removeProperty("padding");
		this.root?.unmount();
		this.root = null;
		this.reactHost?.remove();
		this.reactHost = null;
		this.plugin.unregisterBoardView(this);
	}

	private renderView() {
		if (!this.root) {
			return;
		}

		const loadOutcome = this.documentLifecycle.getLoadOutcome();
		const conflict = this.documentLifecycle.getConflict();
		this.root.render(
			<AppContext.Provider value={this.app}>
				{conflict ? (
					<div style={{ maxWidth: "640px", padding: "24px" }}>
						<h2>This board changed outside Boardspace</h2>
						<p>Choose which version to keep. Neither version will be overwritten until you choose.</p>
						<div style={{ display: "flex", gap: "8px" }}>
							<button type="button" onClick={() => this.resolveConflict("local")}>
								Keep local changes
							</button>
							<button type="button" onClick={() => this.resolveConflict("external")}>
								Load external changes
							</button>
						</div>
					</div>
				) : loadOutcome?.status === "read-only" ? (
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
						onBlur={() => void this.documentLifecycle.flushPendingSave()}
						onSnapshotChange={this.handleSnapshotChange}
						snapshot={loadOutcome?.editorState}
					/>
				)}
			</AppContext.Provider>,
		);
	}

	async flushPendingSave() {
		await this.documentLifecycle.flushPendingSave();
	}

	private resolveConflict(choice: "local" | "external") {
		const outcome = this.documentLifecycle.resolveConflict(choice);
		if (outcome.status === "no-conflict") {
			return;
		}

		this.renderVersion += 1;
		this.renderView();
	}

	private readonly handleSnapshotChange = (state: BoardspaceEditorState) => {
		const outcome = this.documentLifecycle.updateEditorState(state);
		if (outcome.status === "save-blocked") {
			this.showUnsafeSaveNotice();
		}
	};

	private handleVaultRename(oldPath: string, newPath: string) {
		const loadOutcome = this.documentLifecycle.getLoadOutcome();
		if (loadOutcome?.status !== "editable" || !loadOutcome.editorState) return;
		const mediaUpdate = updateMediaAttachmentPath(loadOutcome.editorState, oldPath, newPath);
		const boardLinkUpdate = updateBoardLinkTargetPath(mediaUpdate.state, oldPath, newPath);
		if (!mediaUpdate.changed && !boardLinkUpdate.changed) return;

		this.handleSnapshotChange(boardLinkUpdate.state);
		this.renderVersion += 1;
		this.renderView();
	}

	private handleVaultDelete(path: string) {
		const loadOutcome = this.documentLifecycle.getLoadOutcome();
		if (
			loadOutcome?.status !== "editable" ||
			!loadOutcome.editorState ||
			(!editorStateReferencesMediaAttachment(loadOutcome.editorState, path) &&
				!editorStateReferencesBoardLinkTarget(loadOutcome.editorState, path))
		) return;

		// Keep canonical references untouched and remount so resolvers render the
		// cards as broken without discarding their recovery paths or metadata.
		this.renderVersion += 1;
		this.renderView();
	}

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
