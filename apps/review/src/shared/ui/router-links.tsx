import {
  ActionIcon,
  type ActionIconProps,
  Anchor,
  type AnchorProps,
  Badge,
  type BadgeProps,
  Button,
  type ButtonProps,
} from "@mantine/core";
import { createLink } from "@tanstack/react-router";
import type { AnchorHTMLAttributes, Ref } from "react";

// Mantine's `component={Link}` erases the router's typed `to`/`params`; `createLink` keeps them.
type LinkElementProps = AnchorHTMLAttributes<HTMLAnchorElement> & { ref?: Ref<HTMLAnchorElement> };

export const AnchorLink = createLink((props: AnchorProps & LinkElementProps) => <Anchor component="a" {...props} />);
export const ButtonLink = createLink((props: ButtonProps & LinkElementProps) => <Button component="a" {...props} />);
export const BadgeLink = createLink((props: BadgeProps & LinkElementProps) => <Badge component="a" {...props} />);
export const ActionIconLink = createLink((props: ActionIconProps & LinkElementProps) => (
  <ActionIcon component="a" {...props} />
));
