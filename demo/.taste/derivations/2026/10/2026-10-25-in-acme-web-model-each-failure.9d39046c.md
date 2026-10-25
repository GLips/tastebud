---
id: 01a17538-c104-79d3-9046-cfd24b75043e
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
  - 01a17538-c026-7d7e-a25b-f633f1bd7d1f
  - 01a17538-c053-7256-8990-a654197e9e26
supersedes: 01a17538-c081-7348-9b37-e949212291fd
proposed_by: claude-code/2.1
proposed_at: 2026-10-25T15:40:16.132-07:00
---

Sharpens the accepted Effect belief with Dana's follow-up about one tagged error per failure.
