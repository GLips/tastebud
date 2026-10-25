import { definePlugin } from "@oxlint/plugins";

import { noLongCommentsRule } from "./no-long-comments.ts";

// Taste's own lint rules; each key is enabled in .oxlintrc.json under the `taste/` prefix.
export default definePlugin({ meta: { name: "taste" }, rules: { "no-long-comments": noLongCommentsRule } });
