---
id: 01a15fdc-1040-73ee-bcbb-e79bc8fd0cd6
type: Derivation
schema_version: "2"
kind: belief
statement: Run billing-api migrations by hand, with someone watching
scope: places
places:
  - "github.com/acme/billing-api::"
scope_source: explicit
subject: owner
supports:
  - 01a10277-1100-7cad-94ee-3a89b39a6940
contradicts:
  - 01a0975f-99a0-7eb0-b27a-dd2a62f848a1
proposed_by: claude-code/2.1
proposed_at: 2026-10-03T09:27:00.000-07:00
---

Dana reversed the automatic-migrations rule after the lock incident.
