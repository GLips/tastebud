// ─── taste/io-only-in-infrastructure ──────────────────────────────────
//
// Makes sure: only `infrastructure/` touches the filesystem, spawns a process,
// opens SQLite, reads the host or writes to the terminal, in every declared tree.
// Everything else gets those capabilities injected, so domains stay pure and an
// operation's IO is one adapter to read. `boundary/ambient-globals` covers env,
// fetch and storage; this is the rest of the process surface.
//
// NEGATIVE SPACE: type-only imports are erased and pass. `process.env` is
// ambient-globals' subject, not this rule's.
// ──────────────────────────────────────────────────────────────────────

import type { ESTree } from "@oxlint/plugins";

import { isAtProfile } from "../../policy/declared-trees.ts";
import { aliasSpecifierFor, isUnderPath } from "../../policy/layout.ts";
import { defineTreeRule } from "../lib/define-tree-rule.ts";
import { exportedName, visitImportedNames } from "../lib/imported-names.ts";
import { isTypeOnlyDeclaration, visitModuleSources } from "../lib/module-source-visitor.ts";
import { walkAmbientReads } from "./ambient-reads.ts";
import { mergeVisitors } from "./merge-visitors.ts";

/** Whole modules that are IO, in both spellings Node and Bun accept. Subpaths included. */
const IO_MODULES = [
  "node:fs",
  "fs",
  "node:child_process",
  "child_process",
  "node:os",
  "os",
  "node:crypto",
  "crypto",
  "bun:sqlite",
];

/** The IO half of `Bun` and `process`, as global paths and as named exports of their modules. */
const IO_MEMBERS: Record<string, { modules: string[]; names: string[] }> = {
  Bun: { modules: ["bun"], names: ["spawn", "spawnSync", "file", "write", "stdin"] },
  process: {
    modules: ["node:process", "process"],
    names: ["stdout", "stderr", "stdin", "exit", "exitCode", "cwd", "argv", "platform", "pid"],
  },
};

const IO_GLOBAL_PATHS = new Set(
  Object.entries(IO_MEMBERS).flatMap(([host, { names }]) => names.map((name) => `${host}.${name}`)),
);

const IO_MEMBER_MODULES = Object.values(IO_MEMBERS).flatMap(({ modules }) => modules);

function hostOf(specifier: string) {
  return Object.entries(IO_MEMBERS).find(([, member]) => member.modules.includes(specifier));
}

function namesIoModule(specifier: string): boolean {
  return IO_MODULES.some((module) => isUnderPath(specifier, module));
}

export const ioOnlyInInfrastructureRule = defineTreeRule({
  meta: {
    type: "problem",
    messages: {
      ioModuleOutsideInfrastructure:
        '"{{specifier}}" is IO, and IO lives in {{infrastructure}}/. Add or extend an adapter there and pass what it returns in; a domain or operation that opens it itself cannot be tested without the real thing.',
      ioMemberOutsideInfrastructure:
        "`{{path}}` is IO, and IO lives in {{infrastructure}}/. Move the call into an adapter there (terminal, process-arguments, git-repository and the like) and inject it.",
    },
  },
  create(context, role) {
    if (isAtProfile(role, "infrastructure")) return {};
    const infrastructure = aliasSpecifierFor(role.tree.vocabulary, role.tree.vocabulary.infrastructureDir);
    const reportMember = (node: ESTree.Node, path: string) =>
      context.report({ node, messageId: "ioMemberOutsideInfrastructure", data: { path, infrastructure } });

    const sources = visitModuleSources((source, specifier) => {
      if (!namesIoModule(specifier)) return;
      if (source.parent !== null && source.parent !== undefined && isTypeOnlyDeclaration(source.parent)) return;
      context.report({ node: source, messageId: "ioModuleOutsideInfrastructure", data: { specifier, infrastructure } });
    });

    const importedNames = visitImportedNames(context.sourceCode, IO_MEMBER_MODULES, (name, node, specifier) => {
      const host = hostOf(specifier);
      if (host !== undefined && host[1].names.includes(name)) reportMember(node, `${host[0]}.${name}`);
    });
    // A re-export hands the capability on with no read in this file for the arms above to see.
    const reExports = {
      ExportNamedDeclaration(node: ESTree.ExportNamedDeclaration) {
        if (node.source === null || node.exportKind === "type") return;
        const host = hostOf(node.source.value);
        if (host === undefined) return;
        for (const specifier of node.specifiers) {
          const name = exportedName(specifier.local);
          if (specifier.exportKind === "type") continue;
          if (name === "default" || host[1].names.includes(name)) reportMember(specifier, `${host[0]}.${name}`);
        }
      },
      ExportAllDeclaration(node: ESTree.ExportAllDeclaration) {
        if (node.exportKind === "type") return;
        const host = hostOf(node.source.value);
        if (host !== undefined) reportMember(node.source, `${host[0]}.*`);
      },
    };
    const ambientReads = {
      "Program:exit"() {
        walkAmbientReads(context.sourceCode, (node, path) => {
          if (!IO_GLOBAL_PATHS.has(path)) return false;
          reportMember(node, path);
          return true;
        });
      },
    };
    return mergeVisitors(sources, importedNames, reExports, ambientReads);
  },
});
