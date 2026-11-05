# Add a review feature

A review feature is a directory `apps/review/src/features/<f>/` with four layers. Each layer imports only the
one below it.

1. **repo:** `repo/<f>.server.ts` calls core through the door:
   `runReviewOperation("<operation>", input)` from `#review/infrastructure/tastebud-core.server.ts`. This is the
   only layer that may import that file.
2. **service:** `service/<f>.ts` maps the repo's result to what the screen needs. Often a one-line forward;
   keep it, the layering is uniform on purpose.
3. **controllers:** `controllers/<verb>.ts` exports only server functions:
   `createServerFn({ method }).validator(Schema.toStandardSchemaV1(…)).handler(({ data }) => service(data))`.
4. **ui:** `ui/<f>-page.tsx` and its components, plus `ui/<f>-queries.ts` with `queryOptions` built from a key
   in `#review/shared/query-keys.ts`. A write uses `useMutation` and settles with
   `refreshReviewQueriesAfterWrite(queryClient, <bundle>)`; add or extend a bundle in `query-keys.ts` with a
   comment saying what it stales and why.
5. **Barrel:** `index.ts` exports what routes and other features need (usually the page). List exports by name.
6. **Grants:** `visibility.json` maps each importing feature to a reason. Importing `review-shell`
   (`useKnownPlaces`, `useReviewCatalog`) is already granted.
7. **Route:** a thin file in `apps/review/src/routes/` with `createFileRoute`, `validateSearch` and the page
   from the barrel. No data loading or components defined there.

## Styling

Use Mantine props and the theme scales in `shared/ui/theme.ts`: spacing tokens (`gap="xs"`), `fz` font sizes,
named `shadow`s. StyleX handles layout that props cannot. Raw numbers, inline colours, inline font sizes and
`style` props are rejected. Wrap a Mantine component once in `shared/ui/` when it needs a house default
(`Textarea`).

## Rendering

Keep render pure: read time through `useReviewClockMs()`. Show a query's three states with
`<LoadedQueryContent query={…}>{(data) => …}</LoadedQueryContent>` instead of nested ternaries.

Check that the feature appears as expected against a scratch store
(`TASTEBUD_STORE=/tmp/… bun --bun vite --port <spare>` in `apps/review`), then run `bun run check`.
