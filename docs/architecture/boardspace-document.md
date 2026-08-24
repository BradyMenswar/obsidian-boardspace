# Boardspace document architecture

## Goals

Boardspace owns a canonical, schema-versioned document model rather than persisting a tldraw snapshot. Tldraw is the working editor representation: loading adapts the canonical document into tldraw state, and saving validates and adapts the complete working document back.

The canonical document contains supported canvas content and layout, but not selection, viewport, active tool, focus, tldraw page state, or other editor-session records. Unsupported persisted editor content blocks the entire save and is surfaced to the user; it is never silently discarded or preserved opaquely.

## File envelope

A Boardspace file is Markdown with reserved Boardspace frontmatter keys, including the schema version, while preserving unrelated user frontmatter properties. Its canonical body order is:

1. text-card Markdown regions delimited by reserved standalone HTML comment marker lines containing the card identity;
2. structured canvas data serialized as JSON in one reserved fenced `boardspace` block;
3. a generated, non-authoritative index projection.

Boardspace owns the body structure. Direct source edits to text-card content are supported, but reserved markers and structured data are not user content. Arbitrary body Markdown outside text-card regions is invalid. Structural damage opens read-only with exact diagnostics and an option to open the untouched file as Markdown; the initial architecture performs no automatic repair. Every text-card record must have exactly one matching region, and every region must match exactly one text-card record; missing, duplicate, and orphan regions are invalid.

The index projection exposes board-link and media-attachment references to Obsidian metadata, Graph, and Backlinks. It is always regenerated from canonical card data.

Serialization preserves untouched text-card Markdown verbatim and preserves unrelated frontmatter values without semantic rewriting. Structured JSON and the generated projection use deterministic formatting and ordering.

## Schema and validation

Canvas items live in a normalized map keyed by document-scoped stable identity. Each discriminated item record owns both kind-specific content and placement; content and placement cannot exist independently.

Unsupported or invalid documents open in a read-only error state and must never be interpreted or saved as empty boards. A schema with an explicit migration path migrates in memory and is written in the current schema only after the next user-initiated change. The new canonical format begins at schema v2. The legacy snapshot-based v1 format has no migration promise and opens as unsupported rather than being converted lossily.

Adding a card kind requires an explicit model change, validation, and migration coverage.

## Identity and ordering

Canvas-item identities are stable and unique within one document. Duplicating or copying an item assigns a new identity. Tasks, table rows, and table columns also have stable document-scoped identities; reorder and transfer preserve identity, while duplicating their containing card assigns new identities to all copied content.

Every root item has a total stacking order. Every card in a column has a total vertical order. Text-card regions have a separate stable source order independent of canvas layout, so moving or layering cards does not reorder Markdown blocks.

Cross-document paste assigns new identities. Arrow bindings are remapped when their targets are pasted with them; endpoints whose targets are absent become free at their copied geometry.

## Placement and columns

Root items persist canvas positions. Cards in columns persist membership and order, while canvas position and rendered width are derived from column layout. A contained card retains its preferred size for later use on the root canvas. Derived counts, measured text heights, and auto-layout heights are recomputed rather than persisted.

A column’s collapsed state is persisted. Deleting a non-empty column requires confirmation and deletes the column and all contained cards as one undoable transaction.

Visual styles use Boardspace-owned values translated by the tldraw adapter.

## Card content

Card kinds are text, to-do, table, color swatch, media, and board link. All textual fields on non-text cards—including titles, tasks, table cells, labels, captions, and arrow labels—are plain text.

### Text cards

Each text card owns one raw Obsidian-flavored Markdown region associated by card identity. Reserved standalone HTML comment lines mark the start and end of each region; Markdown between those lines remains normal indexable content. Regions are fragments of one Markdown document and therefore share document-level namespaces. Duplicate block IDs or footnote definitions are invalid. Each card must nevertheless render independently: references, footnotes, and their definitions cannot resolve across card boundaries.

Inactive cards render through Obsidian’s public Markdown renderer. Active cards use embedded CodeMirror source editing. Exact Live Preview parity is not required. Raw Markdown is authoritative; private Obsidian editor APIs and tldraw rich text are excluded from the contract.

### Media cards

A media card references a vault attachment by vault-relative path and owns an optional plain-text caption. A caption is not a nested item. Boardspace updates canonical attachment paths when files move or are renamed. Deleted attachments leave visibly broken cards with their last path and metadata intact.

Media cards reference but never own attachments. Deleting a card never deletes a vault file.

### Board links

A board link references a separate Boardspace document by vault-relative path; it does not embed the target as a page. Boardspace updates canonical target paths when files move or are renamed. Deleted targets remain visibly broken at their last known paths.

## Arrows and freehand strokes

An arrow is a root item with two endpoints and Boardspace-owned straight or curved geometry, bend, arrowheads, dash, color, stroke size, and optional plain-text label. Each endpoint is either a free canvas point or a reference to another canvas item. Deleting a bound item converts the endpoint to a free endpoint at its last resolved canvas point.

A binding to a card in a collapsed column remains canonical but resolves visually to the collapsed column boundary until expanded.

A freehand stroke is one root item with Boardspace-owned points, optional pressure, closure, fill, and style. Erasing may replace or split it with new item identities.

## Live editing and history

Only one editable Boardspace view may be open for a given document. Opening the same document again focuses or reuses its existing Boardspace view; different Boardspace documents may remain open simultaneously. Each open document therefore has one live tldraw editor representation, one editor session, and one chronological document undo history.

Undo, including from a focused CodeMirror card editor, reverses the latest document transaction. Adjacent Markdown typing and deletion coalesce into CodeMirror-style groups; pauses and explicit commands create history boundaries.

A newly opened view initially fits all document content, with a deterministic default viewport for an empty board.

## Saving and external changes

Saving validates the complete live editor representation before writing. Dirty documents autosave after a short idle debounce (initially 750 ms) and flush on editor blur, view close, file switch, or plugin unload. Validation failure leaves the working state intact, writes nothing, and identifies blockers to the user.

An external file change reloads automatically when local state is clean. If local state is dirty, saving pauses and the user must explicitly choose local or external content rather than overwriting either blindly.
