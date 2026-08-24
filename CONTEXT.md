# Boardspace

Boardspace models file-backed infinite-canvas boards in an Obsidian vault. Its language distinguishes persisted board content from the transient editor used to manipulate it.

## Language

**Boardspace document**:
The canonical, schema-versioned representation of one Boardspace board.
_Avoid_: Boardspace note, tldraw snapshot

**Canvas item**:
A persisted object with identity and placement on a Boardspace canvas. Its identity is stable and unique within one document.
_Avoid_: Shape, tldraw record

**Card**:
A content-bearing canvas item from the explicit set of text, to-do, table, color swatch, media, and board-link kinds.

**Text card**:
A card whose content is an Obsidian-flavored Markdown fragment belonging to the containing Boardspace document.
_Avoid_: Note, board note

**Media card**:
A card that references a vault attachment and may have a plain-text caption. The card does not own the attachment.

**Board link**:
A card that references a separate Boardspace document by vault-relative path.

**Column**:
A canvas item that contains and vertically orders cards. Columns cannot contain other columns or non-card items.

**Arrow**:
A root canvas item connecting two free or item-bound endpoints.

**Freehand stroke**:
A root canvas item representing one pen stroke.
_Avoid_: tldraw draw record

**Placement**:
A canvas item’s parent or root membership, sibling order, preferred size, position where applicable, and visual style. Position and rendered width are derived for cards inside columns.

**Editor representation**:
The transient tldraw document state produced from a Boardspace document for editing. It is not a persisted source of truth.

**Editor session**:
Transient per-view interaction state such as viewport, selection, active tool, and focus. It is not part of a Boardspace document.
