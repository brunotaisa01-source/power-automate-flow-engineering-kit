import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  createLocalEvidenceReport,
  type LocalEvidenceReportInput,
} from "../../../packages/core/src/evidence-report.ts";

function reportInput(): LocalEvidenceReportInput {
  return {
    preparedDefinition: {
      path: "/Users/synthetic/private/definition.json",
      result: "PASS",
      diagnostics: [
        {
          code: "FLOW-WARN-2",
          severity: "warning",
          message: "Contact alice@example.com at https://tenant.private.test/flow/12345678-1234-4234-8234-123456789abc; correlation id 12345678-1234-4234-8234-123456789abc.",
          path: "/actions/Zed",
        },
        {
          code: "FLOW-INFO-1",
          severity: "info",
          message: "Synthetic definition is locally prepared.",
          path: "/actions/Ash",
        },
      ],
    },
    localArtifacts: [
      {
        kind: "zip",
        path: "/private/tmp/synthetic/package.zip",
        result: "PASS",
        diagnostics: [],
      },
      {
        kind: "flow",
        path: "flows/synthetic.json",
        result: "PASS",
        diagnostics: [
          {
            code: "FLOW-INFO-2",
            severity: "info",
            message: "The local flow artifact is structurally inspectable.",
            path: "/actions/Root",
          },
        ],
      },
    ],
  };
}

describe("local evidence report builder", () => {
  test("labels local claims and keeps provider and UAT gates unverified", () => {
    const report = createLocalEvidenceReport(reportInput());

    assert.equal(report.claimClass, "LOCAL_SYNTHETIC");
    assert.equal(report.providerGate, "NOT_VERIFIED");
    assert.equal(report.uatGate, "NOT_VERIFIED");
    assert.ok(report.claims.length >= 2);
    assert.ok(report.claims.every(({ claimClass }) => claimClass === "LOCAL_SYNTHETIC"));
    assert.deepEqual(
      report.gates.map(({ id, status }) => [id, status]),
      [
        ["provider", "NOT_VERIFIED"],
        ["uat", "NOT_VERIFIED"],
      ],
    );
    assert.equal(report.result, "PASS");
  });

  test("sorts claims and diagnostics independently of input order", () => {
    const input = reportInput();
    const reversed: LocalEvidenceReportInput = {
      preparedDefinition: {
        ...input.preparedDefinition,
        diagnostics: [...(input.preparedDefinition?.diagnostics ?? [])].reverse(),
      },
      localArtifacts: [...(input.localArtifacts ?? [])].reverse().map((artifact) => ({
        ...artifact,
        diagnostics: [...(artifact.diagnostics ?? [])].reverse(),
      })),
    };

    assert.deepEqual(
      createLocalEvidenceReport(input),
      createLocalEvidenceReport(reversed),
    );
  });

  test("redacts private values in claims and diagnostics", () => {
    const report = createLocalEvidenceReport(reportInput());
    const serialized = JSON.stringify(report);

    assert.doesNotMatch(serialized, /alice@example\.com/);
    assert.doesNotMatch(serialized, /tenant\.private\.test/);
    assert.doesNotMatch(serialized, /12345678-1234-4234-8234-123456789abc/);
    assert.doesNotMatch(serialized, /\/Users\/synthetic\/private/);
    assert.match(serialized, /<redacted-email>/);
    assert.match(serialized, /<redacted-url>/);
    assert.match(serialized, /<redacted-id>/);
    assert.match(serialized, /<redacted-path>/);
  });

  test("reports missing local evidence without minting a provider result", () => {
    const report = createLocalEvidenceReport({});

    assert.equal(report.result, "NOT_RUN");
    assert.equal(report.claims.length, 0);
    assert.deepEqual(
      report.diagnostics.map(({ code }) => code),
      ["LOCAL_ARTIFACT_EVIDENCE_MISSING", "LOCAL_DEFINITION_EVIDENCE_MISSING"],
    );
    assert.equal(report.providerGate, "NOT_VERIFIED");
    assert.equal(report.uatGate, "NOT_VERIFIED");
  });

  test("fails closed when present evidence entries are incomplete or malformed", () => {
    const report = createLocalEvidenceReport({
      preparedDefinition: {},
      localArtifacts: [
        {},
        null as never,
      ],
    });

    assert.equal(report.result, "NOT_RUN");
    assert.ok(report.claims.every(({ status }) => status === "NOT_RUN"));
    assert.ok(report.diagnostics.some(({ code }) => code === "LOCAL_DEFINITION_EVIDENCE_INCOMPLETE"));
    assert.ok(report.diagnostics.some(({ code }) => code === "LOCAL_ARTIFACT_ENTRY_INVALID"));
    assert.ok(report.diagnostics.some(({ code }) => code === "LOCAL_ARTIFACT_EVIDENCE_INCOMPLETE"));
    assert.equal(report.providerGate, "NOT_VERIFIED");
    assert.equal(report.uatGate, "NOT_VERIFIED");
  });

  test("fails closed for malformed optional diagnostic fields", () => {
    const report = createLocalEvidenceReport({
      preparedDefinition: {
        result: "PASS",
        diagnostics: [{
          code: "MALFORMED-OPTIONAL",
          message: "Synthetic malformed optional fields.",
          jsonPointer: null,
          remediation: 123,
        }],
      },
      localArtifacts: reportInput().localArtifacts,
    });

    assert.equal(report.result, "NOT_RUN");
    assert.ok(report.diagnostics.some(({ code }) => code === "LOCAL_DIAGNOSTIC_ENTRY_INVALID"));
    assert.ok(report.claims.some(({ status }) => status === "NOT_RUN"));
    assert.equal(report.providerGate, "NOT_VERIFIED");
    assert.equal(report.uatGate, "NOT_VERIFIED");
  });

  test("requires an actual diagnostics array for object-form prepared evidence", () => {
    const undefinedDiagnostics = createLocalEvidenceReport({
      preparedDefinition: {
        result: "PASS",
        diagnostics: undefined,
      },
      localArtifacts: reportInput().localArtifacts,
    });
    const malformedDiagnostics = createLocalEvidenceReport({
      preparedDefinition: {
        result: "PASS",
        diagnostics: null,
      },
      localArtifacts: reportInput().localArtifacts,
    });

    for (const report of [undefinedDiagnostics, malformedDiagnostics]) {
      assert.equal(report.result, "NOT_RUN");
      assert.ok(report.diagnostics.some(({ code }) => code === "LOCAL_DEFINITION_EVIDENCE_INCOMPLETE"));
      assert.ok(report.claims.some(({ status }) => status === "NOT_RUN"));
      assert.equal(report.providerGate, "NOT_VERIFIED");
      assert.equal(report.uatGate, "NOT_VERIFIED");
    }
  });

  test("canonicalizes tied claim IDs and tied diagnostic keys", () => {
    const input: LocalEvidenceReportInput = {
      preparedDefinition: {
        path: "flows/tied.json",
        result: "PASS",
        diagnostics: [
          {
            code: "TIED-DIAGNOSTIC",
            severity: "warning",
            message: "same primary diagnostic key",
            path: "/same",
            expected: { value: "second" },
          },
          {
            code: "TIED-DIAGNOSTIC",
            severity: "info",
            message: "same primary diagnostic key",
            path: "/same",
            expected: { value: "first" },
          },
        ],
      },
      localArtifacts: [
        {
          kind: "flow",
          path: "flows/tied.json",
          result: "PASS",
          diagnostics: [{
            code: "TIED-CLAIM",
            severity: "info",
            message: "same artifact claim key",
            path: "/same",
            actual: { value: "second" },
          }],
        },
        {
          kind: "flow",
          path: "flows/tied.json",
          result: "FAIL",
          diagnostics: [{
            code: "TIED-CLAIM",
            severity: "info",
            message: "same artifact claim key",
            path: "/same",
            actual: { value: "first" },
          }],
        },
      ],
    };
    const reversed: LocalEvidenceReportInput = {
      preparedDefinition: {
        ...input.preparedDefinition,
        diagnostics: [...(input.preparedDefinition?.diagnostics ?? [])].reverse(),
      },
      localArtifacts: [...(input.localArtifacts ?? [])].reverse().map((artifact) => ({
        ...artifact,
        diagnostics: [...(artifact.diagnostics ?? [])].reverse(),
      })),
    };

    assert.deepEqual(
      createLocalEvidenceReport(input),
      createLocalEvidenceReport(reversed),
    );
  });

  test("returns fresh deeply frozen gates for every report", () => {
    const first = createLocalEvidenceReport(reportInput());
    const second = createLocalEvidenceReport(reportInput());

    assert.notEqual(first.gates, second.gates);
    assert.notEqual(first.gates[0], second.gates[0]);
    assert.equal(Object.isFrozen(first.gates), true);
    assert.equal(Object.isFrozen(first.gates[0]), true);
    assert.equal(second.gates[0]?.message, "No provider readback was requested or performed by this local report.");
    assert.throws(() => {
      (first.gates as Array<{ message: string }>)[0]!.message = "mutated";
    }, TypeError);
  });

  test("fails a local claim when its artifact result is mutated to FAIL", () => {
    const input = reportInput();
    const mutated: LocalEvidenceReportInput = {
      ...input,
      localArtifacts: input.localArtifacts?.map((artifact) => artifact.kind === "flow"
        ? { ...artifact, result: "FAIL", diagnostics: [{
            code: "FLOW-MUTATION",
            severity: "error",
            message: "Synthetic counterexample failed locally.",
            path: "/actions/Root",
          }] }
        : artifact),
    };

    const report = createLocalEvidenceReport(mutated);

    assert.equal(report.result, "FAIL");
    assert.ok(report.claims.some(({ status }) => status === "FAIL"));
    assert.equal(report.providerGate, "NOT_VERIFIED");
    assert.equal(report.uatGate, "NOT_VERIFIED");
  });

  test("independent positive control accepts a branch inspection topology", () => {
    const report = createLocalEvidenceReport({
      preparedDefinitionDiagnostics: [{
        code: "BRANCH-PREPARED",
        severity: "info",
        message: "Synthetic branch definition prepared locally.",
        path: "/properties/definition/actions/Switch/cases/CaseA/actions",
      }],
      localArtifactResults: [{
        kind: "branch-inspection",
        path: "artifacts/branch-case.json",
        status: "PASS",
        diagnostics: [{
          code: "BRANCH-INSPECTED",
          severity: "info",
          message: "CaseA and its nested action were inspected locally.",
          path: "/cases/CaseA/actions/Child",
        }],
      }],
    });

    assert.equal(report.result, "PASS");
    assert.equal(report.claims.length, 2);
    assert.equal(report.providerGate, "NOT_VERIFIED");
    assert.equal(report.uatGate, "NOT_VERIFIED");
  });
});
