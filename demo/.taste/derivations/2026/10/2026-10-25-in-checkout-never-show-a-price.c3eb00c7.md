---
id: 01a17538-c11a-7c3e-b00c-7d632da13e65
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
  - 01a17538-c057-73e8-8391-edabee0668eb
proposed_by: claude-code/2.1
proposed_at: 2026-10-25T15:40:16.154-07:00
---

Dana tied it to a real incident in checkout: client-side shipping math showed the wrong total.
