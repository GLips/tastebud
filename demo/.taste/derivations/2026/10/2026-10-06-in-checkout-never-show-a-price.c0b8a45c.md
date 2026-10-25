---
id: 01a15fdc-1041-7c0b-8a45-c1a325ec3def
type: Derivation
schema_version: "2"
kind: belief
statement: In checkout, never show a price the server hasn't confirmed
scope: places
places:
  - "github.com/acme/web::"
scope_source: defaulted
subject: owner
supports:
  - 01a11351-0800-72e7-aaa6-721068359672
proposed_by: claude-code/2.1
proposed_at: 2026-10-06T15:59:00.000-07:00
---

Dana tied it to a real incident in checkout: client-side shipping math showed the wrong total.
