# WP-06 Executable Adapters Remediation Record

## Scope

This remediation addressed the remaining independent-review findings at
baseline `c423a93d737384c45975aefc636a9ef4b6e53eff`:

1. Hand-authored semantic projections could copy evidence claims.
2. WP-06 rules did not enforce catalog final-artifact requirements.
3. HTTP `FOUND` body proof relied on boolean assertions.

## Implementation

- Added exact-key frontend and Power Automate JSON source IR profiles.
- Added executable, code-selected adapters for all nine WP-06 evidence sections.
- Added canonical virtual projection nodes with adapter-to-source lineage.
- Extended evidence binding with exact projection path, SHA-256, and byte length.
- Required evidence-to-source, evidence-to-projection, evidence-to-contract, and projection-to-source graph edges.
- Stopped recognizing caller-supplied projection JSON as a trusted source artifact.
- Enforced frontend bundle, generated definition, and ZIP/manifest relationships independently from rule applicability.
- Parsed package projections or exact safe-adapter inspection evidence and bound manifests to the ZIP path, SHA-256, and byte length.
- Replaced HTTP body booleans with target schema identity, expected fields, parsed object/list shape, item count, and observed field types.
- Preserved HTTP 400/404 fail-closed classification.

## RED Evidence

Before production changes, the focused adversarial command exited `1` with
`15/19` passing. The four expected failures showed false GREEN behavior for a
copied projection, spoofed adapter identity, missing final artifacts, and
boolean-only HTTP body claims. See
`docs/reviews/wp-06-executable-adapters-red-record.md`.

A supplemental focused RED later exited `1` with `0/1` passing and showed that
both `zip` and `manifest` nodes accepted arbitrary content. It was recorded
before the package and manifest parsers were added.

A final safe-adapter positive control also started `0/1` because external
definition paths and internal solution inventory paths were incorrectly treated
as the same namespace. The corrected control passed `1/1` while retaining exact
package identity and inventory checks.

## GREEN Evidence

- Focused WP-06 adversarial suite: `22/22` passed.
- Canonical WP-06 RED/GREEN/positive/mutation suite: `32/32` passed.
- WP-06 core unit suite with ArtifactGraph controls: `9/9` passed.
- Built CLI WP-06 integration: `2/2` passed.
- Full repository suite: `252/252` passed across 19 suites.
- TypeScript and workspace build: exit `0`.

## Honest Boundary

The adapters in this change transform strict JSON source IR into normalized
WP-06 evidence. They do not yet parse arbitrary JavaScript, TypeScript,
exported Power Automate WDL, or native solution ZIP content into that IR. A
future real-source parser must produce the strict IR and prove its own
source-to-IR mutations. Existing Wave-1 package adapters remain responsible for
supported archive and normalized flow inspection; their exact inspection
evidence can satisfy the WP-06 package-content gate.

## External Gates

The following gates were not performed by this local remediation:

- tenant discovery and preflight;
- apply or controlled tenant mutation;
- solution import, rebind, and enablement;
- live execution and semantic readback;
- effective permission readback;
- publication and publication readback.

## Public Data Gate

The official command returned a report with `exitCode: 8`, `notRun: 1`, and
residual gate `public-data-scanner` because the scanner engine is unavailable.
This is `NOT_RUN`, not PASS.

A supplemental tracked/untracked source check covered 329 versionable files:

- archives and document binaries: `0`;
- private path or synchronized-folder markers: `0`;
- non-example email addresses: `0`;
- GUID-shaped values: two uses of the documented reserved synthetic placeholder;
- parsed public/example URLs: `35`, with `0` unapproved hosts;
- network or process capability hits in the eight changed production source files: `0`.

This supplemental check does not replace the official scanner or a future Git
history scan.
