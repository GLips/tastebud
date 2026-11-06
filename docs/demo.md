# A five-minute tour of the demo store

The demo store is fiction. Dana (`human:dana`) is a developer on Acme, an e-commerce coffee brand with a web storefront (`github.com/acme/web`) and a billing API (`github.com/acme/billing-api`). Dana's coding agent has captured their corrections and proposed beliefs. A Granola sweep has captured quotes from three customer calls, and a research agent has proposed insights and ideas from them. Dana has decided some of it.

The tour uses a fresh copy, so you can accept, reject and repoint freely. It assumes `tastebud` is on your PATH (see the README's [Try it](../README.md#try-it)).

## 1. Seed a store and read the catalog

```bash
tastebud seed --store /tmp/tastebud-demo
export TASTEBUD_STORE=/tmp/tastebud-demo
tastebud catalog
```

The catalog is what an agent reads first. It shows the owner, the `git` resolver, and the kinds from the store's [`tastebud.config.ts`](../demo/.tastebud/tastebud.config.ts):

- two source kinds, `memory` and `call-quote`;
- three derived kinds, each with its own proposal prompt: `belief` (recall `inject`), `insight` ("what customers keep telling us", `pull`, cites only call quotes) and `idea` ("things to try on the website and ads", `never`, accepted as "Worth doing").

## 2. Places: where things apply

Make two stand-in checkouts so the git resolver has something to resolve:

```bash
mkdir -p /tmp/acme/web/apps/checkout /tmp/acme/billing-api
git -C /tmp/acme/web init -q && git -C /tmp/acme/web remote add origin git@github.com:acme/web.git
git -C /tmp/acme/billing-api init -q && git -C /tmp/acme/billing-api remote add origin https://github.com/acme/billing-api.git

tastebud places --in /tmp/acme/web/apps/checkout
tastebud list --kind belief --status accepted --place github.com/acme/web::apps/checkout
tastebud list --kind belief --status accepted --place github.com/acme/billing-api::
```

From `apps/checkout` the context is `github.com/acme/web::apps/checkout`. There you get the global beliefs, the `acme/web` ones (the repo root covers its subdirectories), and "In checkout, never show a price the server hasn't confirmed". That last one was proposed from checkout, so its scope defaulted to the whole repo; Dana narrowed it to `apps/checkout` when they accepted it. At `billing-api` you get the global beliefs plus the billing ones (integer cents, a real Postgres) and nothing from `acme/web`.

Only `inject` kinds like beliefs reach agents through the prompt hook. Insights and ideas don't.

## 3. Recall, rejections included

```bash
tastebud recall "tailwind styling" --at github.com/acme/billing-api::
```

- **Accepted:** nothing. "Use Tailwind for styling in acme/web" doesn't apply in billing-api.
- **Not accepted:** "Use Tailwind for styling in every repo", rejected with Dana's reason ("Only acme/web…").
- **Sources:** Dana's words about Tailwind, including the edit that narrowed their first request (a source that `revises` another).
- **Close but excluded:** the acme/web belief (out of scope here), and a pending re-proposal, "Use Tailwind for styling in every repo with a UI". That one was proposed `--despite` the rejection, because billing-api has since grown an admin dashboard.

`--at` says where you are without needing a checkout; `--in <dir>` resolves a directory. Now another kind:

```bash
tastebud recall "skip a delivery" --kind insight --at clients/acme
tastebud list --kind idea
```

The insight "Subscribers cancel when they only wanted to skip or pause a delivery" comes back with the call quotes behind it and their `granola://` addresses. The idea built on it, a "Skip next delivery" link, is listed under "Close but excluded", because ideas are never recalled. `list` shows the whole ideas backlog: accepted, pending and rejected, including two global ideas.

## 4. What the prompt hook would inject

```bash
tastebud hook preview "show the shipping price on the checkout page" --in /tmp/acme/web/apps/checkout
```

This is exactly what `tastebud hook prompt` would add to that prompt in a Claude Code session in that directory: at most three accepted `inject` items, under a header saying they are previously accepted preferences and the user's current request takes precedence. Here, that's the checkout price belief. In a real session the hook also reads the turn before the prompt from the session transcript; `--transcript <session.jsonl>` adds that here.

## 5. History: revisions, retractions, threads

```bash
tastebud list --kind belief --status superseded
tastebud list --kind belief --status retracted
tastebud show <the superseded belief's id>
```

"Model failures in acme/web with Effect instead of try/catch" was superseded by a more specific revision about one `Data.TaggedError` per failure. "Run database migrations automatically on deploy" was accepted, then retracted after a lock incident, and a pending belief to run them by hand cites the new words and lists the old ones under `contradicts`. `show` prints a record's evidence, decisions, thread and both scopes, proposed and effective. Refs take a full id, the short id from a file name, or any unique prefix.

## 6. The review UI

```bash
tastebud review        # http://127.0.0.1:4747
```

- **Inbox:** pending derivations by kind, then scope. Look for the scope chips:
  - "Validate form fields on blur" and the Stripe webhook belief were proposed without a scope, so theirs reads "from" the repo they came from. Edit the scope inline before you accept.
  - "Write ad headlines in sentence case" is about Jordan, Acme's marketer, not Dana. Its subject says so.
  - The Tailwind re-proposal shows the rejection it argues past, and why.
- **A derivation's page:** "Use named exports" has a thread: Dana asked about re-exported defaults and the agent answered. "Validate form fields on blur" has a note from Dana that nobody has answered yet.
- **Recall inspector:** type a prompt and a directory to see what the hook would inject, and what was excluded and why.
- **Places:** the place tree, counts per kind, and the audit.

## 7. A renamed repo

`acme/web` used to be called `storefront`. Two beliefs were accepted under the old name, so they apply nowhere you work now:

```bash
tastebud places --probe /tmp/acme/web/apps/checkout --probe /tmp/acme/billing-api --probe-place clients/acme
tastebud repoint --from github.com/acme/storefront:: --to github.com/acme/web::
```

The audit lists `github.com/acme/storefront::` as unmatched by those probes, with its two beliefs. `repoint` proposes a pending revision of each with only that place replaced; it changes nothing until Dana accepts them in the inbox.

## 8. An agent on the thread

In a second terminal:

```bash
tastebud review listen --as demo-agent
```

Leave a note on any derivation in the UI. The listener prints one JSON line with the note. Answer it as the agent:

```bash
tastebud thread-reply <derivation id> "Good question. Checking the autocomplete component now." --by demo-agent
```

The reply appears on the thread in the UI.
