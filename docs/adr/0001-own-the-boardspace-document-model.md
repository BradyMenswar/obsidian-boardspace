# Own the canonical Boardspace document model

Boardspace will persist a schema-versioned domain model and use a bidirectional adapter to produce transient tldraw editor state. Persisting raw tldraw snapshots was rejected because it couples durable vault data to editor-specific records, includes session state, and makes validation and future editor changes unsafe; the trade-off is that every supported canvas feature now requires explicit Boardspace modeling, conversion, validation, and migration decisions.
