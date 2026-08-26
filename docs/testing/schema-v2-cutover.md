# Schema-v2 cutover checks

Run these checks in a test vault after `npm run build`, then reload Obsidian and enable Boardspace under **Settings → Community plugins**.

1. Create a board with **Create new Boardspace**. Open its Markdown source and confirm `board-version: 2`, an empty `boardspace` block, and the generated index markers.
2. Add, edit, close, reopen, and edit each supported canvas item: text, to-do, table, color swatch, media, board link, column, arrow, and freehand stroke.
3. Inspect the saved Markdown and confirm it contains canonical item records but no tldraw document, page, page-state, selection, viewport, focus, or active-tool records.
4. Open a schema-v1 snapshot file. Confirm Boardspace displays an unsupported read-only message, **Open as markdown** shows the untouched source, and closing the view does not modify the file.
5. Add unsupported editor content and confirm the complete save is blocked without partially changing the file.
6. Open the same board twice and confirm Boardspace focuses or reuses its single editable view.
7. Edit a text card and a canvas item, then use undo and redo to confirm one chronological document history.
8. With unsaved local changes, modify the file externally and confirm Boardspace requires choosing local or external content before saving.
