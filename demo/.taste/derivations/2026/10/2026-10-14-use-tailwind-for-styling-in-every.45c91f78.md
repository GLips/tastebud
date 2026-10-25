---
id: 01a15fdc-1048-745c-91f7-8f2cd91673c9
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
  - 01a0a653-6b80-7572-9d51-ee610d7d6bfe
  - 01a13b9d-3180-76e7-8ad0-f177bb54fea8
despite:
  - 01a15fdc-1033-700f-b359-fdd88730c404
proposed_by: claude-code/2.1
proposed_at: 2026-10-14T11:47:00.000-07:00
---

Dana asked for Tailwind in billing-api once its dashboard started reusing acme/web components.

## Despite

The rejection said billing-api had no UI. It now has an admin dashboard built from acme/web's components, which depend on Tailwind.
