# Limit each document to one editable Boardspace view

Boardspace will permit only one editable view for a given document and will focus or reuse it when the file is opened again, while still allowing different boards to be open together. Multiple editors for one document were rejected because synchronizing tldraw representations, CodeMirror buffers, sessions, transactions, and Undo history adds substantial complexity for little user value; multi-view editing would require revisiting this boundary deliberately.
