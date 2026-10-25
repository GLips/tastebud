---
id: 01a15fdc-1048-7a15-9d14-aa87cabed166
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
  - 01a0a653-6b80-76dd-90ad-c7272943e8a3
  - 01a13b9d-3180-7426-b2d0-eb341001a04c
despite:
  - 01a15fdc-1033-753f-899e-9cda6930252e
proposed_by: claude-code/2.1
proposed_at: 2026-10-14T11:47:00.000-07:00
---

Dana asked for Tailwind in billing-api once its dashboard started reusing acme/web components.

## Despite

The rejection said billing-api had no UI. It now has an admin dashboard built from acme/web's components, which depend on Tailwind.
