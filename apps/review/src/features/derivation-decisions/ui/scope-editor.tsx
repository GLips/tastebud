/**
 * The scope picker with its confirm, for hosts that open it from an "Edit" link: the list opens at
 * once, and the confirm sits to the right of the picker so the list never covers it. It edits a
 * draft only; nothing is decided until the acceptance preview confirms it.
 */
import { Anchor, Box, Button, Group, Kbd, Stack, Text, Tooltip } from "@mantine/core";
import * as stylex from "@stylexjs/stylex";
import { useHotkeys } from "@tanstack/react-hotkeys";
import {
  type DerivationScope,
  describeScopeChange,
  isCompleteScope,
  isSameScope,
  type ScopeDraft,
} from "@tastebud/core/places";
import { ArrowRight } from "lucide-react";
import { useState } from "react";

import type { KnownPlaces } from "#review/shared/known-places.ts";

import { ScopePicker } from "./scope-picker.tsx";

const styles = stylex.create({
  picker: { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", minWidth: 0 },
});

export function ScopeEditor({
  proposed,
  draft,
  known,
  continueLabel,
  active,
  requireChange = false,
  onDraftChange,
  onContinue,
  onClose,
}: {
  /** The scope the draft is compared with: the proposed one, or the effective one for a revision. */
  proposed: DerivationScope;
  draft: ScopeDraft;
  known: KnownPlaces;
  /** The continue button's words for the scope it would continue with. */
  continueLabel: (scope: DerivationScope) => string;
  /** Only the editor on the selected card listens for Esc and ⌘↵. */
  active: boolean;
  /** Moving an accepted one to the scope it already has would be a no-op, so its button waits for a change. */
  requireChange?: boolean;
  onDraftChange: (draft: ScopeDraft) => void;
  onContinue: () => void;
  onClose: () => void;
}) {
  const [listOpen, setListOpen] = useState(true);
  const changes = describeScopeChange(proposed, draft, known.labelOf);
  const edited = !isSameScope(proposed, draft);
  const complete = isCompleteScope(draft);
  const canContinue = complete && (!requireChange || edited);
  // Page-level keys rather than a keydown on the editor: the picker's list is portalled out of it.
  useHotkeys([
    // The list's own Esc closes the list first; the next one closes the editor.
    { hotkey: "Escape", callback: onClose, options: { ignoreInputs: false, enabled: active && !listOpen } },
    { hotkey: "Mod+Enter", callback: onContinue, options: { ignoreInputs: false, enabled: active && canContinue } },
  ]);
  return (
    <Stack gap="3xs">
      <Group justify="space-between" wrap="nowrap" gap="sm" align="center">
        <Box {...stylex.props(styles.picker)}>
          <Text size="xs" c="dimmed">
            Applies in
          </Text>
          <ScopePicker
            value={draft}
            proposed={proposed}
            known={known}
            onChange={onDraftChange}
            defaultOpened
            onOpenedChange={setListOpen}
          />
          {edited && (
            <Anchor component="button" size="xs" c="dimmed" onClick={() => onDraftChange(proposed)}>
              {requireChange ? "Restore current scope" : "Restore proposed"}
            </Anchor>
          )}
        </Box>
        <Group gap="xxs" wrap="nowrap">
          <Tooltip label="Keeps the change for later · Esc" withArrow>
            <Button size="xs" variant="subtle" color="gray" onClick={onClose}>
              Close
            </Button>
          </Tooltip>
          <Tooltip label="⌘↵" withArrow>
            <Button size="xs" disabled={!canContinue} rightSection={<ArrowRight size={13} />} onClick={onContinue}>
              {complete ? continueLabel(draft) : "Pick a place"}
            </Button>
          </Tooltip>
        </Group>
      </Group>
      {changes.length > 0 && (
        <Text size="xs" c={draft.scope === "global" ? "orange.8" : "dark.4"}>
          {changes.join(" · ")}
        </Text>
      )}
      {!listOpen && (
        <Text size="xs" c="dimmed">
          Nothing is saved until you confirm. <Kbd size="xs">⌘↵</Kbd> continues, <Kbd size="xs">Esc</Kbd> closes and
          keeps the change.
        </Text>
      )}
    </Stack>
  );
}
