import { Editor, setUserPreferences } from "tldraw";
import {
	createBoardNoteShapeAtPoint,
	focusBoardNoteForTyping,
} from "./board-note-tool";

const BOARDSPACE_USER_ID = "boardspace";

export function syncTldrawThemeWithObsidian() {
	setUserPreferences({
		id: BOARDSPACE_USER_ID,
		colorScheme: document.body.classList.contains("theme-dark")
			? "dark"
			: "light",
	});
}

export function watchObsidianThemeChanges(onChange: () => void): () => void {
	const observer = new MutationObserver((mutations) => {
		if (mutations.some((mutation) => mutation.attributeName === "class")) {
			onChange();
		}
	});

	observer.observe(document.body, {
		attributes: true,
		attributeFilter: ["class"],
	});

	return () => observer.disconnect();
}

export function preventTldrawCanvasesCausingObsidianGestures(
	editor: Editor,
): (() => void) | void {
	const canvas = editor
		.getContainer()
		.getElementsByClassName("tl-canvas")[0];

	if (!(canvas instanceof HTMLDivElement)) {
		return;
	}

	const stopTouchMove = (event: TouchEvent) => {
		event.stopPropagation();
	};

	canvas.addEventListener("touchmove", stopTouchMove, { passive: true });

	return () => canvas.removeEventListener("touchmove", stopTouchMove);
}

export function replaceCanvasDoubleClickWithBoardNote(
	editor: Editor,
): (() => void) | void {
	const canvas = editor
		.getContainer()
		.getElementsByClassName("tl-canvas")[0];

	if (!(canvas instanceof HTMLDivElement)) {
		return;
	}

	const handleDoubleClick = (event: MouseEvent) => {
		if (editor.getHoveredShape() || editor.getEditingShapeId()) {
			return;
		}

		event.preventDefault();
		event.stopImmediatePropagation();

		const point = editor.screenToPage({
			x: event.clientX,
			y: event.clientY,
		});

		const shape = createBoardNoteShapeAtPoint(editor, point);
		if (!shape || shape.type !== "board-note") {
			return;
		}

		focusBoardNoteForTyping(editor, shape.id);
	};

	canvas.addEventListener("dblclick", handleDoubleClick, true);

	return () => canvas.removeEventListener("dblclick", handleDoubleClick, true);
}
