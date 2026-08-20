# WP-19 Connector-Specific Contract Runtime Plan

## Objective

Complete the local/synthetic connector-neutral scope by binding each connector
profile to a canonical native operation catalog, synthetic connection kind,
permission/readback role, pagination model, payload policy, and executable
payload/permission/pagination harness.

## Covered connectors

SharePoint, Excel, Power Apps, Dataverse, Outlook, Graph, HTTP, SQL, approvals,
and `custom`/`future-*` extension profiles.

## Required local proof

- exact adapter-to-profile equality for native operations and connection kind;
- exact permission role/readback fields;
- exact pagination mode, page size, and readback requirement;
- exact payload required/forbidden fields and parameterized mode;
- payload allowlist/forbidden-field execution;
- permission status/body/readback execution;
- continuation-token and offset pagination execution;
- RED, GREEN, and independent connector matrix controls;
- compiled CLI validation for every profile.

## Boundary

All evidence is `LOCAL_STATIC`, `COMPILED_CLI`, or `RUNTIME_SYNTHETIC`. No
connector authentication, connection ownership, tenant permissions, import,
rebind, enablement, execution, mutation, rollback, or semantic tenant readback
is claimed.
