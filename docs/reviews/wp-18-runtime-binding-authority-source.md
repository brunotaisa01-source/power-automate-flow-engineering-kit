# WP-18 runtime binding authority — source record

## Objective

Convert a provider/runtime counterexample into a connector-neutral lesson that
future AIs can apply on any laptop without copying tenant state.

## Sanitized finding

The provider can report a physical connector as `Connected` while the flow
runtime still has a stale or different installed connection reference. A second
failure mode occurs when the generated client uses a short code-generation alias
while the published app registered the full flow data-source alias. Either
condition must keep the runtime gate RED.

## Contract

The live binding gate is GREEN only when all of these agree:

1. the physical connection status is `Connected`;
2. the current and installed connection references have the same logical and
   physical names; and
3. the generated data-source alias equals the full alias registered by the
   host.

A connection-list status by itself is not sufficient evidence.

## Evidence boundary

The source observation was provider/hosted work, but this public record carries
no tenant URL, account, mailbox, GUID, run identifier, raw payload, or
credential. The checked-in lesson is proven only by deterministic
`RUNTIME_SYNTHETIC` tests. Provider rebinding, publication, execution, and
semantic readback remain external residual gates for each project.

## Files

- `packages/core/src/runtime-binding.ts`
- `tests/unit/core/runtime-binding-red.test.ts`
- `tests/unit/core/runtime-binding-green.test.ts`
- `tests/unit/core/runtime-binding-positive-control.test.ts`

worker status: retired after source record handoff
