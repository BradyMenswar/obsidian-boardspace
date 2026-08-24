# Domain docs

Engineering skills should consume this repository’s domain documentation before exploring the codebase.

## Before exploring, read these

- `CONTEXT.md` at the repository root.
- Relevant ADRs under `docs/adr/`.

If either is absent, proceed silently. Domain-modeling skills create these files lazily when terms or decisions are resolved.

## Layout

This repository uses a single-context layout:

```
/
├── CONTEXT.md
├── docs/adr/
└── src/
```

## Vocabulary and decisions

- Use domain terms as defined in `CONTEXT.md`; avoid synonyms the glossary rejects.
- If a needed concept is missing, reconsider the terminology or note the gap for domain modeling.
- Explicitly flag output that conflicts with an existing ADR rather than silently overriding it.
