export interface BoardspaceViewWorkspace<Leaf> {
	getOpenBoardspaceLeaves(): readonly Leaf[];
	getBoardspacePath(leaf: Leaf): string | null;
	revealLeaf(leaf: Leaf): Promise<void>;
	closeLeaf(leaf: Leaf): Promise<void>;
}

export class BoardspaceViewCoordinator<Leaf> {
	private readonly pendingOpens = new Map<
		string,
		{ leaf: Leaf; opened: Promise<void> }
	>();

	constructor(private readonly workspace: BoardspaceViewWorkspace<Leaf>) {}

	async reconcile(): Promise<void> {
		const openPaths = new Set<string>();

		for (const leaf of this.workspace.getOpenBoardspaceLeaves()) {
			const path = this.workspace.getBoardspacePath(leaf);
			if (!path) {
				continue;
			}

			if (openPaths.has(path)) {
				await this.workspace.closeLeaf(leaf);
				continue;
			}

			openPaths.add(path);
		}
	}

	async open(
		path: string,
		requestedLeaf: Leaf,
		openRequestedLeaf: () => Promise<void>,
	): Promise<Leaf> {
		const existingLeaf = this.workspace
			.getOpenBoardspaceLeaves()
			.find((leaf) => this.workspace.getBoardspacePath(leaf) === path);

		if (existingLeaf) {
			await this.workspace.revealLeaf(existingLeaf);
			return existingLeaf;
		}

		const pendingOpen = this.pendingOpens.get(path);
		if (pendingOpen) {
			await pendingOpen.opened;
			await this.workspace.revealLeaf(pendingOpen.leaf);
			return pendingOpen.leaf;
		}

		const opened = Promise.resolve().then(openRequestedLeaf);
		this.pendingOpens.set(path, { leaf: requestedLeaf, opened });

		try {
			await opened;
			await this.workspace.revealLeaf(requestedLeaf);
			return requestedLeaf;
		} finally {
			const currentPendingOpen = this.pendingOpens.get(path);
			if (currentPendingOpen?.opened === opened) {
				this.pendingOpens.delete(path);
			}
		}
	}
}
