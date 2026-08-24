export interface MarkdownNamespaceDiagnostic {
	code:
		| "markdown-block-identity-duplicate"
		| "markdown-footnote-definition-duplicate";
	message: string;
}

export function validateTextCardMarkdownNamespaces(
	regions: Map<string, string>,
): MarkdownNamespaceDiagnostic | undefined {
	const blockIdentities = new Set<string>();
	const footnoteDefinitions = new Set<string>();

	for (const markdown of regions.values()) {
		for (const line of markdownLinesOutsideCodeBlocks(markdown)) {
			const footnote = line.match(/^[ \t]{0,3}\[\^([^\]\r\n]+)\]:/);
			if (footnote?.[1]) {
				const identity = footnote[1];
				if (footnoteDefinitions.has(identity)) {
					return {
						code: "markdown-footnote-definition-duplicate",
						message: `Footnote definition [^${identity}] appears more than once across Boardspace text cards.`,
					};
				}
				footnoteDefinitions.add(identity);
			}

			const block = line.match(/(?:^|[ \t])\^([A-Za-z0-9-]+)[ \t]*$/);
			if (block?.[1]) {
				const identity = block[1];
				if (blockIdentities.has(identity)) {
					return {
						code: "markdown-block-identity-duplicate",
						message: `Obsidian block identity ^${identity} appears more than once across Boardspace text cards.`,
					};
				}
				blockIdentities.add(identity);
			}
		}
	}

	return undefined;
}

function markdownLinesOutsideCodeBlocks(markdown: string): string[] {
	const lines = markdown.split(/\r?\n/);
	const visibleLines: string[] = [];
	let fence: { character: "`" | "~"; length: number } | undefined;

	for (const line of lines) {
		if (fence) {
			const closingFence = line.match(/^[ \t]{0,3}(`+|~+)[ \t]*$/)?.[1];
			if (
				closingFence?.[0] === fence.character &&
				closingFence.length >= fence.length
			) {
				fence = undefined;
			}
			continue;
		}

		const openingFence = line.match(/^[ \t]{0,3}(`{3,}|~{3,})/)?.[1];
		if (openingFence) {
			fence = {
				character: openingFence[0] as "`" | "~",
				length: openingFence.length,
			};
			continue;
		}
		if (/^(?: {4}|\t)/.test(line)) continue;
		visibleLines.push(line);
	}

	return visibleLines;
}
