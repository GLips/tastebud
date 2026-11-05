# Architecture docs

Tastebud's layout is enforced by `bun run check` (oxlint plugins plus `lint/structural`). These docs explain the
shape the checks hold; when a doc and a check disagree, the check is the system.

| Read when | Doc |
|---|---|
| You need to know which tree and layer a change goes in | [layers.md](layers.md) |
| You import a package, a core subpath, or another tree | [boundaries.md](boundaries.md) |
| You touch review code that runs on the server, or browser code near core | [server-client-boundaries.md](server-client-boundaries.md) |
| You add, raise or show a failure | [error-conventions.md](error-conventions.md) |
| A rule looks wrong, or you want to know why the catalog was edited | [decisions.md](decisions.md) |
| You add an operation agents or the reviewer can run | [how-to/new-core-operation.md](how-to/new-core-operation.md) |
| You add a screen or server function to the review app | [how-to/new-review-feature.md](how-to/new-review-feature.md) |
| You wrap a new SDK, file format or process call | [how-to/new-infra-adapter.md](how-to/new-infra-adapter.md) |
