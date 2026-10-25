---
id: 01a15fdc-1025-7ea2-bc8b-671d634f96a3
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
  - 01a0631e-d480-7e84-b6a9-059078d67c1a
proposed_by: claude-code/2.1
proposed_at: 2026-09-02T10:51:00.000-07:00
---

Dana rejected a try/catch around a fetch and asked for failures to show up in the type.
