import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { Component, MarkdownRenderer } from "obsidian";
import { useEffect, useRef } from "react";
import { useApp } from "../hooks/use-app";
import { useBoardspaceFilePath } from "../context/boardspace-file-context";

interface BoardTextCardContentProps {
	isEditing: boolean;
	markdown: string;
	onChange(markdown: string): void;
	onKeyDown?: (event: KeyboardEvent) => void;
	onStopEditing(): void;
}

export function BoardTextCardContent({
	isEditing,
	markdown,
	onChange,
	onKeyDown,
	onStopEditing,
}: BoardTextCardContentProps) {
	return isEditing ? (
		<CodeMirrorTextCardEditor
			markdown={markdown}
			onChange={onChange}
			onKeyDown={onKeyDown}
			onStopEditing={onStopEditing}
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
	onKeyDown,
	onStopEditing,
}: Omit<BoardTextCardContentProps, "isEditing">) {
	const hostRef = useRef<HTMLDivElement>(null);
	const onChangeRef = useRef(onChange);
	const onKeyDownRef = useRef(onKeyDown);
	const onStopEditingRef = useRef(onStopEditing);
	onChangeRef.current = onChange;
	onKeyDownRef.current = onKeyDown;
	onStopEditingRef.current = onStopEditing;

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
						if (update.docChanged) {
							onChangeRef.current(update.state.doc.toString());
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
		view.focus();

		return () => view.destroy();
	}, []);

	return (
		<div
			ref={hostRef}
			className="boardspace-note-shape__source-editor"
			onPointerDown={(event) => event.stopPropagation()}
		/>
	);
}
