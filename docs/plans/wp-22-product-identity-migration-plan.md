# WP-22 Product Identity Migration Plan

## Target identity

Product: Power Automate Flow Engineering Kit

Repository slug: `power-automate-flow-engineering-kit`

CLI: `spflow` (preserved for compatibility)

## Migration rules

- SharePoint remains the executable reference profile, not the product limit.
- Existing `spflow`, `@spflow/*`, registry IDs, historical review paths, and
  legacy skill paths remain compatible.
- New Power Automate skill aliases become the recommended installation paths.
- Public README, architecture, skills, plugin manifest title, package identity,
  GitHub description/topics, and links use the Power Automate identity.
- No tenant/runtime/production claim is introduced.

## Validation

Run build, full suite, product acceptance, plugin boundary tests, privacy/history
checks, and independent review before renaming the public repository. Then update
the GitHub remote, create a draft rename PR if required, and verify the repository
URL, default branch, HEAD/tree, links, and clean worktree.
