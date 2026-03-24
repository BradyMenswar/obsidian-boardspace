import { App, CachedMetadata, TFile } from "obsidian";

const BOARDSPACE_TYPE = "boardspace";
const BOARDSPACE_VERSION_KEY = "board-version";
const FRONTMATTER_PATTERN =
	/^---\s*\n([\s\S]*?)\n---(?:\s*\n|$)/;

export function hasBoardspaceFrontmatter(
	metadata: CachedMetadata | null | undefined,
): boolean {
	const frontmatter = metadata?.frontmatter;
	if (!frontmatter) {
		return false;
	}

	return (
		frontmatter.type === BOARDSPACE_TYPE &&
		frontmatter[BOARDSPACE_VERSION_KEY] !== undefined
	);
}

export async function isBoardspaceFile(app: App, file: TFile): Promise<boolean> {
	if (hasBoardspaceFrontmatter(app.metadataCache.getFileCache(file))) {
		return true;
	}

	const contents = await app.vault.cachedRead(file);
	const match = contents.match(FRONTMATTER_PATTERN);
	if (!match) {
		return false;
	}

	const frontmatter = match[1];
	if (!frontmatter) {
		return false;
	}

	return (
		/^type:\s*boardspace\s*$/m.test(frontmatter) &&
		/^board-version\s*:\s*.+$/m.test(frontmatter)
	);
}
