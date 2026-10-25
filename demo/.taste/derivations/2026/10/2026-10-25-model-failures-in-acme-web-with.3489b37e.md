---
id: 01a17538-c081-7348-9b37-e949212291fd
type: Derivation
schema_version: "2"
kind: belief
statement: Model failures in acme/web with Effect instead of try/catch
scope: places
places:
  - "github.com/acme/web::"
scope_source: explicit
subject: owner
supports:
  - 01a17538-c026-7d7e-a25b-f633f1bd7d1f
proposed_by: claude-code/2.1
proposed_at: 2026-10-25T15:40:16.001-07:00
---

Dana rejected a try/catch around a fetch and asked for failures to show up in the type.
