---
id: 01a15fdc-103d-74d0-89b5-e97e9e7aab93
type: Derivation
schema_version: "2"
kind: belief
statement: In acme/web, model each failure as its own Data.TaggedError and
  handle it with catchTag
scope: places
places:
  - "github.com/acme/web::"
scope_source: explicit
subject: owner
supports:
  - 01a0631e-d480-75ec-8b70-b7c66917ec6e
  - 01a0f94a-bd20-7bc9-b76c-fcdcf39b5216
supersedes: 01a15fdc-1025-75e6-bbb3-0e062a1328b6
proposed_by: claude-code/2.1
proposed_at: 2026-10-01T14:42:00.000-07:00
---

Sharpens the accepted Effect belief with Dana's follow-up about one tagged error per failure.
