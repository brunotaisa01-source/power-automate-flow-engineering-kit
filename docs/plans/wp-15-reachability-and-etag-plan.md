# WP-15 Reachability and ETag Hardening Plan

## Objective

Close two independent authority gaps without weakening the existing synthetic
SharePoint and Power Automate validation boundary:

1. prevent actions inside deterministic false builder branches from producing
   trusted sections or a compiled CLI pass;
2. reject wildcard, malformed, and HTTP-header control-character ETags before
   a frontend request is sent.

## Scope

- Normalize control reachability from the raw Power Automate definition.
- Evaluate only a conservative static subset: boolean literals, literal
  comparisons, numeric comparisons, not, and, or, and deterministic
  if expressions.
- Propagate reachable, unreachable, or unknown through nested condition
  ancestry and container lineage.
- Suppress the complete builder derivation if any normalized action is known to
  be unreachable. Runtime data-dependent branches remain unknown and are
  subject to the pre-existing structural checks.
- Extend the frontend Save grammar to require a concrete quoted ETag, reject
  the wildcard, and reject C0 plus DEL characters.
- Keep all artifacts synthetic and keep tenant/runtime/publication gates
  separate from local validation.

## Test-First Sequence

1. Add RED tests for a complete flow under equals(1,0).
2. Add RED tests for nested deterministic false branches and a reachable
   positive control.
3. Add RED runtime tests for newline, carriage return, NUL, C0, DEL, malformed,
   wildcard, and valid quoted ETags.
4. Run the focused RED before changing production code.
5. Implement normalized reachability and fail-closed builder projection.
6. Implement the strict ETag grammar in the public example and adapter grammar.
7. Rebuild with Node 22 and verify focused, full, README, privacy, and audit
   gates.

## External Boundary

This work package does not import, connect to, mutate, or read any SharePoint,
Power Automate, Outlook, Graph, tenant, company, GitHub, or private source
project. Local GREEN is not tenant or publication evidence.
