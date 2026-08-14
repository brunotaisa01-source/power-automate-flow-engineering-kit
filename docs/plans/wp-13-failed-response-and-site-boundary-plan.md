# WP-13 Failed Response And Site Boundary Plan

## Objective

Harden the narrow frontend adapter grammar so failed HTTP responses cannot be
promoted into trusted SharePoint behavior and URL-bearing operations cannot
escape the configured synthetic SharePoint site.

## Scope

1. Require `response.ok` and an accepted `2xx` status before pagination reads
   `value` or `@odata.nextLink`.
2. Require the same status checks, plus a non-empty string value, before a
   context-info response supplies `FormDigestValue`.
3. Require Save item URLs and OData base URLs to share the configured site
   origin and exact decoded site-path segment boundary.
4. Preserve the existing raw-artifact authority, package, ZIP, mutation
   closure, rule-specific gate, and privacy controls.

## TDD Sequence

1. Add RED fixtures for an HTTP 500 body containing results, malformed page
   bodies, unexpected statuses, failed or malformed digest bodies, cross-origin
   URLs, sibling-prefix paths, and malformed URLs.
2. Add a same-origin Save and OData positive control.
3. Implement one site-boundary helper and the minimal response guards.
4. Extend the exact AST grammar so unsupported or legacy frontend source emits
   no trusted derivation.
5. Run focused tests, the compiled fourteen-rule test, the full Node 22 suite,
   build, diff check, dependency audit, and the public-data scanner.

## Non-Goals

This work does not connect to SharePoint, Power Automate, Graph, Outlook, a
tenant, or a publication target. It does not promote local evidence to tenant
evidence.
