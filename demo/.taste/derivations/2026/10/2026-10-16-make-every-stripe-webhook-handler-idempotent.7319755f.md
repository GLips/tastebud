---
id: 01a15fdc-1045-7731-9755-fcd9cbc6eb5f
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
  - 01a14660-ee40-78fe-a52a-294f494f383a
proposed_by: claude-code/2.1
proposed_at: 2026-10-16T13:57:00.000-07:00
---

Stated as a requirement for every handler, with the reason (Stripe retries).
