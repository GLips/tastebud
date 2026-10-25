---
id: 01a17538-c12e-7239-b366-1406e14f3ba2
type: Derivation
schema_version: "2"
kind: belief
statement: Make every Stripe webhook handler idempotent, keyed on the event id
scope: places
places:
  - "github.com/acme/billing-api::"
scope_source: defaulted
subject: owner
supports:
  - 01a17538-c060-7038-beb4-9ade70172839
proposed_by: claude-code/2.1
proposed_at: 2026-10-25T15:40:16.174-07:00
---

Stated as a requirement for every handler, with the reason (Stripe retries).
