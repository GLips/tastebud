/** The text `inbox` prints. */
import { formatScopeLabel } from "#core/domains/places/index.ts";
import { section } from "#core/domains/record-text/index.ts";

import type { InboxResult } from "./inbox.ts";

export const renderInboxText = (result: InboxResult) =>
  result.groups.length === 0
    ? "(nothing pending)"
    : result.groups
        .map((group) =>
          section(
            `${group.kindPlural} · ${formatScopeLabel(group.scope)}${group.subject === undefined ? "" : ` · ${group.subject}`}`,
            group.cards.map(
              (card) =>
                `- ${card.derivation.statement}  [${card.derivation.id}]` +
                (card.needsAcknowledgement.length === 0
                  ? ""
                  : `\n    ${card.needsAcknowledgement.length} near repeats to acknowledge`),
            ),
          ),
        )
        .join("\n\n");
