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

export function parseBoardspaceFile(
	fileContents: string,
): BoardspaceSnapshot | undefined {
	const match = fileContents.match(BOARDSPACE_BLOCK_PATTERN);
	if (!match) {
		return undefined;
	}

	const rawSnapshot = match[1]?.trim();
	if (!rawSnapshot || rawSnapshot === "null") {
		return undefined;
	}

	try {
		return JSON.parse(rawSnapshot) as TLEditorSnapshot;
	} catch {
		return undefined;
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
