# WP-06 Raw Artifact Authority RED Record

## Baseline

- Commit: `d366545ef3c0438ed24b1f45a27dc726d98c8b7e`
- Worktree before test edits: clean
- Private source projects: not accessed
- Evidence class: local test execution only

## Command

```powershell
node --experimental-strip-types --test tests/rules/wp-06-remediation-adversarial.test.ts
```

## Result

- Exit code: `1`
- Tests: `27`
- Passed: `22`
- Failed: `5`
- Duration: approximately one second

The five failures are the intended RED evidence. In every case the new test expected the affected rule ID, but the baseline returned no diagnostic:

1. Repository-authored source IR authorized `APP-SAVE-001`.
2. Frontend bundle metadata authorized `APP-SAVE-001` while its declared entrypoint did not exist in the graph.
3. An unrelated one-action definition satisfied the builder final-artifact gate for `SP-AUTHZ-001`.
4. JSON content represented as a ZIP artifact satisfied the required ZIP gate for `SP-AUTHZ-001`.
5. A manually supplied HTTP 200 body inside source IR authorized `HTTP-SEMANTIC-001` as `FOUND` without definition, package, or runtime provenance.

No production file was changed before this RED run. These failures reproduce the independent release-review findings and establish the regression boundary for the remediation.
