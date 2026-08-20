# WP-20 Product Acceptance Test Plan

## Objective

Prove the shipped product journey locally and synthetically, not only isolated
profile functions. The acceptance test must exercise the reference example, the
compiled CLI, every connector profile, a synthetic flow fixture, payload policy,
permission readback, pagination, mutation trace, semantic readback, and a RED
negative path.

## Journey

```text
project contract
  -> frontend/package/rule validation
  -> synthetic connector flow fixture
  -> connector profile and adapter
  -> parameterized payload
  -> permission readback
  -> pagination trace
  -> pre-read/write/readback trace
  -> product acceptance report
```

## Evidence boundary

The test proves `LOCAL_STATIC`, `COMPILED_CLI`, and `RUNTIME_SYNTHETIC` only. It
does not prove tenant authentication, connection ownership, permissions, import,
rebind, enablement, execution, mutation, rollback, live semantic readback, or
production readiness.

## Required controls

- positive reference SharePoint project journey;
- positive connector journey for all nine profiles;
- independent flow fixture mapping connector actions to profile operations;
- negative forbidden-payload path for every connector;
- negative failed-write/readback path for every connector;
- deterministic acceptance report and claim class;
- no tenant network calls and no write-capable MCP.
