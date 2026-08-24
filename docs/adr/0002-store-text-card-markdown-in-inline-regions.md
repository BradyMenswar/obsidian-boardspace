# Store text-card Markdown in inline file regions

Text-card content will live as raw Obsidian-flavored Markdown between reserved HTML comment marker lines in the Boardspace file, while structured canvas data remains in a separate JSON block. Keeping Markdown out of JSON allows Obsidian indexing and direct source editing and avoids lossy tldraw rich-text conversion; the trade-off is a stricter multi-section file envelope with shared document-level Markdown namespaces and structural validation.
