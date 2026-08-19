# WP-16 Operation-Specific Endpoint Authority Plan

## Objective

Replace the generic list-resource prefix assumption in the public frontend
profile with three exact, contract-bound endpoint grammars. The runtime and
the static source recognizer must prove the same shapes, so a source artifact
cannot claim a stronger boundary than the executable example actually enforces.

## Scope

The contract-derived list path is the only accepted resource authority.

| Operation | Exact accepted path | Query handling |
| --- | --- | --- |
| Save item | `<listPath>/items(<positive integer>)` | Rejected |
| OData base | `<listPath>` | Rejected |
| Pagination collection or continuation | `<listPath>` | Allowed for a server continuation |

Every operation must also reject wrong origin, wrong site, sibling prefixes,
resource substitutions, `/fields`, `/items`, extra descendants, malformed
URLs, raw traversal, encoded traversal, and encoded slash or backslash
separators. Rejection must happen before network I/O.

## Test-First Sequence

1. Add a permanent RED probe that supplies the configured list path followed by
   `/fields` to Save, OData, and pagination and asserts no request occurs.
2. Expand the RED matrix for wrong endpoint forms, malformed URLs, encoded
   traversal, encoded separators, resource substitutions, and query misuse.
3. Implement the smallest fail-closed runtime helpers for the three grammars.
4. Mirror the exact helper shapes in the trusted frontend AST recognizer.
5. Recompute the synthetic frontend inventory hash and byte count.
6. Record RED and GREEN evidence, including command counts and any unavailable
   external scanner.

## Verification

Run the focused raw-artifact suite first, then the Node 22 build, every README
command, the full test suite, whitespace validation, and the low-level npm
audit. The official history-aware public-data scanner is attempted separately;
an unavailable engine is `NOT_RUN`, never `PASS`.

## Boundaries

This work is local and synthetic. It does not read private source projects,
connect to SharePoint, Power Automate, Outlook, Graph, a tenant, or GitHub,
and it does not claim import, execution, mutation, live-smoke, publication,
or production evidence.
