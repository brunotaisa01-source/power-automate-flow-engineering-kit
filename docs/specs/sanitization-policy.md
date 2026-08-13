# Public Data and Sanitization Policy

## 1. Policy

The public repository is synthetic-only. Sanitization is reconstruction from public contracts and synthetic fixtures, not deletion of obvious strings from private artifacts. No operational source tree or exported tenant package may be copied wholesale into this repository.

## 2. Allowed Public Values

Allowed environment examples are limited to:

- placeholders: `{SITE_URL}`, `{LIST_NAME}`, `{MAILBOX_UPN}`, `{CONNECTION_REFERENCE}`, `{ENVIRONMENT_ID}`, `{SOLUTION_ID}`, `{ARTIFACT_SHA256}`;
- reserved email domain: `user@example.test` and other `example.test` addresses;
- reserved web domains: `example.test`, `example.invalid`, `example.com` only where documentation requires a URL example;
- deterministic fake IDs documented as synthetic, such as `00000000-0000-4000-8000-000000000001`;
- generated synthetic list items with non-personal labels such as `CASE-0001`;
- digests generated from public synthetic files in this repository.

A value is not safe merely because it resembles a placeholder. The scanner and reviewer must confirm context.

## 3. Prohibited Content

The working tree, Git history, generated files, test output, release archives, nested archives, and documentation MUST NOT contain:

- any company, customer, supplier, or internal project name from a private environment;
- real personal name, username, email address, phone number, postal address, or employee/tester identity;
- real URL, tenant domain, tenant metadata, site path, list ID, environment ID, solution ID, mailbox ID, message ID, drive ID, or connection ID;
- mailbox address, message subject/body, attachment name/content, or email header;
- password, token, cookie, API key, client secret, certificate, private key, connection string, or credential hint;
- internal/private hash, manifest, evidence record, package inventory, or deployment identifier;
- spreadsheet, workbook, exported ZIP, screenshot, database extract, binary snapshot, executable, or copied operational package;
- absolute source path, local user profile, machine name, network share, or private repository URL;
- copied private code or prose when provenance and publication authority are not explicit;
- production counts, dates, incidents, ticket content, or screenshots that can identify an environment.

## 4. File Policy

### 4.1 Default allowlist

Public source file types:

```text
.md .json .jsonc .ts .tsx .js .mjs .cjs .css .html .xml .yml .yaml .txt
```

`.jsonc` is permitted for editor configuration only and not for normative contracts.

### 4.2 Denied by default

```text
.xlsx .xls .xlsm .csv .png .jpg .jpeg .gif .webp .pdf .docx
.zip .7z .rar .tar .gz .exe .dll .pfx .p12 .cer .key .pem
.sqlite .db .bak .msg .eml
```

Synthetic ZIP fixtures are the only default-denied exception. They MUST be deterministically generated from allowlisted synthetic source during tests and MUST be scanned recursively. Release ZIPs are generated artifacts, not imported operational files. No other binary exception is allowed without `R0`, `R5`, and `R9` approval.

## 5. Environment-Specific Values

The public contract declares binding keys only. A user supplies values in one of two ways:

1. `spflow ... --bindings <absolute-path-outside-repository>`
2. `SPFLOW_BINDING_<KEY>` environment variables

The external bindings file follows:

```json
{
  "schemaVersion": "1.0",
  "bindings": {
    "SITE_URL": "{SITE_URL}",
    "LIST_NAME": "{LIST_NAME}",
    "MAILBOX_UPN": "user@example.test",
    "CONNECTION_REFERENCE": "{CONNECTION_REFERENCE}"
  }
}
```

The shown file is documentation-only. Real values remain outside the repository, its parent release directory, and Git worktrees.

Controls:

- reject a bindings path inside the repository;
- do not accept sensitive bindings as command-line values;
- never persist resolved values into contracts, generated public fixtures, manifests, evidence, or logs;
- redact resolved values before diagnostic formatting;
- use logical binding keys in generated definitions intended for public release;
- tenant-specific generation occurs in a private output directory supplied explicitly by the user;
- private output is never used as public release input.

## 6. Scanner Coverage

`spflow scan public-data <path> --history --format json` MUST inspect:

- tracked and untracked files, except bounded tool caches;
- staged content;
- every reachable Git commit and tag for release scans;
- generated definitions and frontend bundles;
- final release archives;
- nested archives recursively within safety limits;
- XML attributes/text, JSON keys/values, source maps, comments, and documentation links;
- file and directory names as well as content.

The scanner MUST combine:

- exact deny terms maintained in a private pre-publication configuration outside the repository;
- generic email, URL, tenant-domain, GUID, credential, private-key, absolute-path, and secret patterns;
- entropy-based secret detection with deterministic thresholds;
- file-type and archive inventory policy;
- placeholder allowlist validation;
- provenance checks for generated synthetic binaries.

The public repository MUST NOT include the private deny-term list because that list can itself disclose private names.

## 7. Recursive Archive Handling

- Normalize and validate archive paths before reading content.
- Reject traversal, links, encrypted content, duplicate normalized paths, excessive size/count/ratio, and unsupported archive types.
- Scan archive entry names and decoded content.
- A nested archive in a release is a failure unless the package profile explicitly requires it and the sanitizer supports it.
- A match inside any depth fails the parent artifact.
- Diagnostics show only archive-relative path and finding category; matched private text is redacted.

## 8. Git History and Release

Before first public push and every release:

1. Run the recursive working-tree and generated-output scan.
2. Run history scan across all reachable objects.
3. Verify no denied binary was ever committed.
4. Verify release artifacts were generated from the clean synthetic tree.
5. Recompute release manifest.
6. Obtain human privacy and intellectual-property review.

Deleting a file in the latest commit does not remove it from history. A history finding blocks publication and requires a reviewed clean-history reconstruction before any public push.

## 9. Diagnostic Handling

Public-data diagnostics contain:

```ts
interface PublicDataDiagnostic {
  ruleId: "DATA-PUBLIC-001" | "DATA-PUBLIC-002";
  category: string;
  artifactPath: string;
  location: { line?: number; jsonPointer?: string; archiveEntry?: string };
  matchedValue: "<redacted>";
  remediation: string;
}
```

The scanner MUST NOT print the matched secret/private value. Reports themselves are rescanned before storage.

## 10. Acceptance Tests

Synthetic RED fixtures MUST include:

- non-reserved email and URL;
- tenant-like domain and GUID context;
- Windows and POSIX absolute paths;
- private-key marker and high-entropy token;
- prohibited workbook and screenshot filenames;
- leakage in JSON key, XML attribute, source map, filename, ZIP entry, nested archive, generated bundle, and Git history;
- a deceptive placeholder containing a prohibited suffix;
- private value present only in a diagnostic output.

GREEN controls include every approved placeholder, `user@example.test`, deterministic fake IDs, and public synthetic digests.

## 11. Exit Status

- exit `0`: no prohibited content detected in requested scope;
- exit `2`: invalid path or invocation;
- exit `4`: unsafe archive prevents safe scanning;
- exit `5`: one or more public-data violations;
- exit `7`: internal scanner error.

Scanner success does not replace human `R0` legal/IP and `R9` release review.

