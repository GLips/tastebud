---
id: 01a17538-c140-7595-b865-603cdc35753e
type: Derivation
schema_version: "2"
kind: belief
statement: Use Tailwind for styling in every repo with a UI
scope: places
places:
  - "github.com/acme/web::"
  - "github.com/acme/billing-api::"
scope_source: explicit
subject: owner
supports:
  - 01a17538-c048-7b55-a45f-351ad57330ae
  - 01a17538-c05e-7185-8954-377a51f98916
despite:
  - 01a17538-c0bd-737e-a9d0-148aa2e746eb
proposed_by: claude-code/2.1
proposed_at: 2026-10-25T15:40:16.192-07:00
---

Dana asked for Tailwind in billing-api once its dashboard started reusing acme/web components.

## Despite

The rejection said billing-api had no UI. It now has an admin dashboard built from acme/web's components, which depend on Tailwind.
