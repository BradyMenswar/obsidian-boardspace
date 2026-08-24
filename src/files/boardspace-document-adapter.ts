import type { TLEditorSnapshot } from "tldraw";
import type { BoardspaceDocumentAdapter } from "./boardspace-document-lifecycle";
import {
	BoardspaceDocumentV2,
	parseBoardspaceDocument,
	serializeBoardspaceDocument,
} from "./boardspace-document";

export function createSchemaV2BoardspaceDocumentAdapter(): BoardspaceDocumentAdapter<TLEditorSnapshot> {
	let document: BoardspaceDocumentV2 | undefined;
	let untouchedReadOnlySource = "";

	return {
		loadSource(source) {
			const result = parseBoardspaceDocument(source);
			if (result.status === "read-only") {
				document = undefined;
				untouchedReadOnlySource = result.source;
				return {
					status: "read-only",
					sourceStatus: result.diagnostics.some(
						(diagnostic) => diagnostic.code === "unsupported-schema-version",
					)
						? "unsupported"
						: "invalid",
					editorState: undefined,
					diagnostics: result.diagnostics,
				};
			}

			document = result.document;
			untouchedReadOnlySource = "";
			return {
				status: "editable",
				sourceStatus: "empty",
				editorState: undefined,
			};
		},
		serializeEditorState(editorState) {
			if (!document) {
				return untouchedReadOnlySource;
			}
			if (hasCanvasContent(editorState)) {
				throw new Error(
					"This Boardspace build cannot save populated schema-v2 documents yet.",
				);
			}

			return serializeBoardspaceDocument(document);
		},
	};
}

function hasCanvasContent(snapshot: TLEditorSnapshot | undefined): boolean {
	const store = snapshot?.document?.store;
	if (!isRecord(store)) {
		return false;
	}

	return Object.values(store).some(
		(record) =>
			isRecord(record) &&
			(record.typeName === "shape" || record.typeName === "asset"),
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
