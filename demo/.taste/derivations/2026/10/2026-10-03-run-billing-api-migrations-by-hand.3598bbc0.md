---
id: 01a15fdc-1040-7359-8bbc-0d94ab28be3d
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
  - 01a10277-1100-7941-9f0f-3f46f47d4d70
contradicts:
  - 01a0975f-99a0-718b-9f22-8946caa7bb1e
proposed_by: claude-code/2.1
proposed_at: 2026-10-03T09:27:00.000-07:00
---

Dana reversed the automatic-migrations rule after the lock incident.
