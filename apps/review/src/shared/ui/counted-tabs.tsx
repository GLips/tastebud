import { SegmentedControl } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";

import { CountBadge } from "#review/shared/ui/count-badge.tsx";

const styles = stylex.create({
  label: { display: "inline-flex", alignItems: "center", gap: "6px" },
});

export interface CountedTabOption<Value extends string> {
  readonly value: Value;
  readonly label: string;
  /** A mark before the label, such as a kind's glyph. */
  readonly icon?: ReactNode;
  /** Rows behind this option; absent for a choice that isn't a filter, such as a view or an order. */
  readonly count?: number;
}

/**
 * The review UI's one strip of mutually exclusive choices: a status filter, a kind, a view. A segmented control
 * at the ladder's `sm` height, so it lines up with the inputs and selects beside it; each option may carry its
 * count, and a zero count stays quiet.
 */
export function CountedTabs<Value extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: ReadonlyArray<CountedTabOption<Value>>;
  value: Value;
  onChange: (value: Value) => void;
  /** What the choice is about, for a screen reader: there is no visible heading. */
  label: string;
}) {
  return (
    <SegmentedControl
      w="fit-content"
      aria-label={label}
      value={value}
      onChange={(picked) => {
        const option = options.find((candidate) => candidate.value === picked);
        if (option !== undefined) onChange(option.value);
      }}
      data={options.map((option) => ({
        value: option.value,
        label:
          option.count === undefined && option.icon === undefined ? (
            option.label
          ) : (
            <span {...stylex.props(styles.label)}>
              {option.icon}
              {option.label}
              {option.count !== undefined && <CountBadge count={option.count} />}
            </span>
          ),
      }))}
    />
  );
}
