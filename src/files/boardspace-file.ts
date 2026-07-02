import { TLEditorSnapshot } from "tldraw";
import {
	BOARDSPACE_FILE_LANGUAGE,
	BOARDSPACE_FILE_VERSION,
	BoardspaceSnapshot,
} from "types/board";

const BOARDSPACE_FRONTMATTER = `---
type: boardspace
board-version: ${BOARDSPACE_FILE_VERSION}
---`;

const BOARDSPACE_BLOCK_PATTERN = new RegExp(
	"```" + BOARDSPACE_FILE_LANGUAGE + "\\s*([\\s\\S]*?)```",
	"m",
);

interface BoardspaceFileParseResult {
	snapshot: BoardspaceSnapshot | undefined;
	version: number | undefined;
}

const BOARDSPACE_VERSION_PATTERN = /^board-version\s*:\s*(.+?)\s*$/m;

export function parseBoardspaceFile(
	fileContents: string,
): BoardspaceSnapshot | undefined {
	return parseBoardspaceFileWithMetadata(fileContents).snapshot;
}

export function parseBoardspaceFileWithMetadata(
	fileContents: string,
): BoardspaceFileParseResult {
	const match = fileContents.match(BOARDSPACE_BLOCK_PATTERN);
	if (!match) {
		return {
			snapshot: undefined,
			version: readBoardspaceVersion(fileContents),
		};
	}

	const rawSnapshot = match[1]?.trim();
	if (!rawSnapshot || rawSnapshot === "null") {
		return {
			snapshot: undefined,
			version: readBoardspaceVersion(fileContents),
		};
	}

	try {
		const parsed = JSON.parse(rawSnapshot) as unknown;
		return {
			snapshot: isBoardspaceSnapshot(parsed) ? parsed : undefined,
			version: readBoardspaceVersion(fileContents),
		};
	} catch {
		return {
			snapshot: undefined,
			version: readBoardspaceVersion(fileContents),
		};
	}
}

export function serializeBoardspaceFile(
	snapshot: BoardspaceSnapshot | undefined,
): string {
	const serializedSnapshot = snapshot
		? JSON.stringify(snapshot, null, 2)
		: "null";

	return `${BOARDSPACE_FRONTMATTER}

\`\`\`${BOARDSPACE_FILE_LANGUAGE}
${serializedSnapshot}
\`\`\`
`;
}

export function isSupportedBoardspaceVersion(version: number | undefined) {
	return version === BOARDSPACE_FILE_VERSION;
}

function readBoardspaceVersion(fileContents: string): number | undefined {
	const rawVersion = fileContents.match(BOARDSPACE_VERSION_PATTERN)?.[1]?.trim();
	if (!rawVersion) {
		return undefined;
	}

	const version = Number(rawVersion.replace(/^["']|["']$/g, ""));
	return Number.isInteger(version) ? version : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function isBoardspaceSnapshot(value: unknown): value is TLEditorSnapshot {
	if (!isRecord(value)) {
		return false;
	}

	return isRecord(value.document) && isRecord(value.session);
}
