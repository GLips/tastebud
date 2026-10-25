---
id: 01a15fdc-103d-7c90-9103-b3a496da385e
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
  - 01a0631e-d480-7e84-b6a9-059078d67c1a
  - 01a0f94a-bd20-7d09-b59f-9fae4cb9513f
supersedes: 01a15fdc-1025-7ea2-bc8b-671d634f96a3
proposed_by: claude-code/2.1
proposed_at: 2026-10-01T14:42:00.000-07:00
---

Sharpens the accepted Effect belief with Dana's follow-up about one tagged error per failure.
