import {
	parseBoardspaceDocument,
	type BoardspaceDocumentV2,
} from "../files/boardspace-document";

export interface BoardLinkCounts {
	boardCount: number;
	cardCount: number;
}

export function getBoardLinkCountsFromDocument(document: BoardspaceDocumentV2): BoardLinkCounts {
	let boardCount = 0;
	let cardCount = 0;
	for (const item of Object.values(document.items)) {
		if (item.kind === "board-link") boardCount += 1;
		else cardCount += 1;
	}
	return { boardCount, cardCount };
}

export function getBoardLinkCountsFromSource(source: string): BoardLinkCounts | null {
	const parsed = parseBoardspaceDocument(source);
	return parsed.status === "editable"
		? getBoardLinkCountsFromDocument(parsed.document)
		: null;
}

export function formatBoardLinkCounts({
	boardCount,
	cardCount,
}: BoardLinkCounts) {
	const parts: string[] = [];

	if (boardCount > 0) {
		parts.push(`${boardCount} ${boardCount === 1 ? "board" : "boards"}`);
	}

	if (cardCount > 0) {
		parts.push(`${cardCount} ${cardCount === 1 ? "card" : "cards"}`);
	}

	return parts.length > 0 ? parts.join(", ") : "0 cards";
}
