# Issue tracker: GitHub

Issues and specs for this repo live as GitHub issues. Use the `gh` CLI for all operations.

## Conventions

- Create, read, list, comment on, label, and close issues with `gh issue`.
- Infer the repository from `git remote -v`.
- Use heredocs for multiline issue bodies.
- Fetch comments and labels when reading tickets.

## Pull requests as a triage surface

**PRs as a request surface: no.**

GitHub shares one number space across issues and PRs. If needed, resolve an ambiguous number with `gh pr view <number>`, then fall back to `gh issue view <number>`.

## Skill operations

- “Publish to the issue tracker”: create a GitHub issue.
- “Fetch the relevant ticket”: run `gh issue view <number> --comments`.
- Wayfinder maps use a `wayfinder:map` issue and linked child issues.
- Child tickets use `wayfinder:<type>` labels.
- Prefer native GitHub sub-issues and issue dependencies, with task-list and `Blocked by:` fallbacks.
- Claim work by assigning the issue to the current user before making other writes.
- Resolve work by commenting with the answer, closing the child, and adding its context pointer to the map.
