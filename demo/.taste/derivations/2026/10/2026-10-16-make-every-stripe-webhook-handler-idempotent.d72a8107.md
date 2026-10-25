---
id: 01a15fdc-1045-7d72-a810-7396b9211c57
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
  - 01a14660-ee40-71a1-a111-05dab7f4a417
proposed_by: claude-code/2.1
proposed_at: 2026-10-16T13:57:00.000-07:00
---

Stated as a requirement for every handler, with the reason (Stripe retries).
