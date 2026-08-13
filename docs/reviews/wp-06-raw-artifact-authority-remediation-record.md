# WP-06 Raw Artifact Authority Remediation Record

## Scope

- Baseline: `d366545ef3c0438ed24b1f45a27dc726d98c8b7e`
- Evidence class: local static and synthetic local test evidence only
- Public content: English and synthetic
- Private source projects: not accessed or modified

## Release-Review Findings Closed Locally

1. Repository-authored evidence, source IR, and source projection JSON are ordinary artifacts and cannot create trusted WP-06 lineage.
2. Frontend authority requires one exact `spflow.frontend-bundle-v2` inventory with a real entrypoint and exact path, byte length, and SHA-256 for every deployable file.
3. Builder authority requires the exact declared definition parsed by the existing flow normalizer.
4. ZIP authority requires real archive bytes accepted by the safe solution adapter. JSON under a `.zip` filename is invalid.
5. Direct and packaged normalized flow digests must agree where ZIP evidence is required.
6. HTTP `FOUND` cannot be authorized by a caller-authored body. No runtime-response adapter is accepted in this release, so observed body semantics remain `LIVE_SMOKE`.
7. Graph trust edges are attached only after a unique successful adapter derivation. Multiple accepted sources for one kind and section fail closed.

The package-adapter layer owns filesystem, definition, and archive inspection.
Core repository discovery remains independent and creates no trust edge from a
binding name or caller-selected profile.

## RED Evidence

Command:

```powershell
node --experimental-strip-types --test tests/rules/wp-06-remediation-adversarial.test.ts
```

Baseline result after adding tests only:

- exit code: `1`
- tests: `27`
- passed: `22`
- failed: `5`

The five intended failures reproduced copied source IR, missing frontend
inventory, an unrelated definition, JSON named as ZIP, and an invented HTTP
body. No production file had changed before this run. The exact assertions are
preserved in `wp-06-raw-artifact-authority-red-record.md`.

A later focused counterexample removed the mutation action's `runAfter`
dependency while preserving role labels, methods, and token coverage. Before
the lineage fix, the affected rule returned no diagnostic (`1/2` focused tests
failed). Requiring a direct successful execution chain changed this control to
GREEN.

## GREEN Evidence

Focused adapter and rule command:

```powershell
node --experimental-strip-types --test tests/rules/wp-06-raw-artifact-authority.test.ts tests/rules/wp-06-remediation-adversarial.test.ts tests/rules/wp-06-wave2-rules.test.ts tests/integration/wp-06-built-cli.test.ts tests/rules/adapter-boundary-remediation.test.ts
```

Result: `100/100` tests passed. This includes:

- real frontend source and exact inventory positive controls;
- missing entrypoint, digest mismatch, extra file, and source mutation controls;
- ambiguous parser-accepted frontend sources;
- real normalized definition and safely inspected synthetic solution ZIP;
- unrelated definition, definition-action mutation, and execution-lineage mutation controls;
- JSON bytes under a `.zip` path;
- copied source IR and caller-authored HTTP body controls;
- Wave-1 adapter compatibility.

Workspace build:

```powershell
npm run build
```

Result: exit `0` for core, package adapters, rules, and CLI.

Complete suite:

```powershell
npm test
```

Final result: exit `0`, `263/263` tests passed across `20/20` suites.

Dependency lock synchronization completed with `0` reported vulnerabilities.
The current shell used Node.js `24.18.0`, while the supported repository engine
is Node.js `22.x`; a supported-runtime rerun remains an environment gate and is
not inferred from these results.

## Public Data Gate

Official command:

```powershell
node packages/cli/dist/bin/spflow.js scan public-data . --format json
```

The normalized report returned `exitCode: 8`, `result: FAIL`, `notRun: 1`, and
residual gate `public-data-scanner` because the scanner engine is unavailable.
Status: `NOT_RUN`; no scanner PASS is claimed.

A supplemental read-only scan covered the 42 changed and untracked files and
found zero archives or document binaries, absolute user paths, synchronized
folder markers, non-example emails, GUID-shaped values, tenant SharePoint URLs,
or changed-production network/process-launch capabilities. This check does not
replace the official scanner or a Git history scan.

## Residual Gates

The following were not run and are not claimed: supported Node.js 22 rerun,
tenant discovery, Preflight, Apply, import, connection rebinding, enablement,
execution, mutation, semantic readback, effective-permission readback,
authenticated runtime HTTP body evidence, tenant verification, publication,
publication readback, official public-data scan, and Git history scan.
