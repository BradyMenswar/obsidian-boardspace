import { EditorState, Transaction } from "@codemirror/state";
import { EditorView, keymap, type ViewUpdate } from "@codemirror/view";
import { Component, MarkdownRenderer } from "obsidian";
import { useEffect, useRef } from "react";
import { useApp } from "../hooks/use-app";
import { useBoardspaceFilePath } from "../context/boardspace-file-context";
import {
	classifyBoardspaceTextChange,
	type BoardspaceTextChangeKind,
} from "./boardspace-document-history";

interface BoardTextCardContentProps {
	isEditing: boolean;
	markdown: string;
	onChange(markdown: string, kind: BoardspaceTextChangeKind): void;
	onHistoryBoundary(): void;
	onKeyDown?: (event: KeyboardEvent) => void;
	onRedo(): void;
	onStopEditing(): void;
	onUndo(): void;
}

export function BoardTextCardContent({
	isEditing,
	markdown,
	onChange,
	onHistoryBoundary,
	onKeyDown,
	onRedo,
	onStopEditing,
	onUndo,
}: BoardTextCardContentProps) {
	return isEditing ? (
		<CodeMirrorTextCardEditor
			markdown={markdown}
			onChange={onChange}
			onHistoryBoundary={onHistoryBoundary}
			onKeyDown={onKeyDown}
			onRedo={onRedo}
			onStopEditing={onStopEditing}
			onUndo={onUndo}
		/>
	) : (
		<RenderedTextCard markdown={markdown} />
	);
}

function RenderedTextCard({ markdown }: { markdown: string }) {
	const app = useApp();
	const sourcePath = useBoardspaceFilePath();
	const hostRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const host = hostRef.current;
		if (!host) return;

		const component = new Component();
		component.load();
		host.empty();
		void MarkdownRenderer.render(app, markdown, host, sourcePath, component);

		return () => {
			component.unload();
			host.empty();
		};
	}, [app, markdown, sourcePath]);

	return <div ref={hostRef} className="boardspace-note-shape__markdown markdown-rendered" />;
}

function CodeMirrorTextCardEditor({
	markdown,
	onChange,
	onHistoryBoundary,
	onKeyDown,
	onRedo,
	onStopEditing,
	onUndo,
}: Omit<BoardTextCardContentProps, "isEditing">) {
	const hostRef = useRef<HTMLDivElement>(null);
	const viewRef = useRef<EditorView | null>(null);
	const applyingExternalChangeRef = useRef(false);
	const onChangeRef = useRef(onChange);
	const onHistoryBoundaryRef = useRef(onHistoryBoundary);
	const onKeyDownRef = useRef(onKeyDown);
	const onRedoRef = useRef(onRedo);
	const onStopEditingRef = useRef(onStopEditing);
	const onUndoRef = useRef(onUndo);
	onChangeRef.current = onChange;
	onHistoryBoundaryRef.current = onHistoryBoundary;
	onKeyDownRef.current = onKeyDown;
	onRedoRef.current = onRedo;
	onStopEditingRef.current = onStopEditing;
	onUndoRef.current = onUndo;

	useEffect(() => {
		const host = hostRef.current;
		if (!host) return;

		const view = new EditorView({
			parent: host,
			state: EditorState.create({
				doc: markdown,
				extensions: [
					EditorView.lineWrapping,
					EditorView.updateListener.of((update) => {
						if (applyingExternalChangeRef.current) {
							return;
						}
						if (update.docChanged) {
							onChangeRef.current(
								update.state.doc.toString(),
								getTextChangeKind(update),
							);
							return;
						}
						if (update.selectionSet) {
							onHistoryBoundaryRef.current();
						}
					}),
					EditorView.domEventHandlers({
						keydown(event) {
							onKeyDownRef.current?.(event);
							return event.defaultPrevented;
						},
					}),
					keymap.of([
						{
							key: "Mod-z",
							run: () => {
								onUndoRef.current();
								return true;
							},
						},
						{
							key: "Mod-Shift-z",
							run: () => {
								onRedoRef.current();
								return true;
							},
						},
						{
							key: "Mod-y",
							run: () => {
								onRedoRef.current();
								return true;
							},
						},
						{
							key: "Escape",
							run: () => {
								onStopEditingRef.current();
								return true;
							},
						},
					]),
				],
			}),
		});
		viewRef.current = view;
		view.focus();

		return () => {
			onHistoryBoundaryRef.current();
			viewRef.current = null;
			view.destroy();
		};
	}, []);

	useEffect(() => {
		const view = viewRef.current;
		if (!view || view.state.doc.toString() === markdown) {
			return;
		}

		applyingExternalChangeRef.current = true;
		try {
			view.dispatch({
				changes: { from: 0, to: view.state.doc.length, insert: markdown },
			});
		} finally {
			applyingExternalChangeRef.current = false;
		}
	}, [markdown]);

	return (
		<div
			ref={hostRef}
			className="boardspace-note-shape__source-editor"
			onPointerDown={(event) => event.stopPropagation()}
		/>
	);
}

function getTextChangeKind(update: ViewUpdate): BoardspaceTextChangeKind {
	let inserted = false;
	let deleted = false;
	update.changes.iterChanges((fromA, toA, _fromB, _toB, insertedText) => {
		inserted ||= insertedText.length > 0;
		deleted ||= toA > fromA;
	});

	return classifyBoardspaceTextChange(
		update.transactions.map(
			(transaction) => transaction.annotation(Transaction.userEvent) ?? "",
		),
		inserted,
		deleted,
	);
}
