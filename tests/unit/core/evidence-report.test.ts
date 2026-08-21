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

  test("fails closed for unsupported or cyclic expected and actual values", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const malformedValues = [
      { expected: 123n },
      { actual: Symbol("x") },
      { expected: cyclic },
    ];

    for (const value of malformedValues) {
      const report = createLocalEvidenceReport({
        preparedDefinition: {
          result: "PASS",
          diagnostics: [{
            code: "MALFORMED-JSON-VALUE",
            message: "Synthetic unsupported diagnostic value.",
            ...value,
          }],
        },
        localArtifacts: reportInput().localArtifacts,
      });

      assert.equal(report.result, "NOT_RUN");
      assert.ok(report.diagnostics.some(({ code }) => code === "LOCAL_DIAGNOSTIC_ENTRY_INVALID"));
      assert.ok(report.claims.some(({ status }) => status === "NOT_RUN"));
      assert.equal(report.providerGate, "NOT_VERIFIED");
      assert.equal(report.uatGate, "NOT_VERIFIED");
    }
  });

  test("preserves valid JSON-safe expected and actual objects and arrays", () => {
    const report = createLocalEvidenceReport({
      preparedDefinition: {
        result: "PASS",
        diagnostics: [{
          code: "VALID-JSON-VALUE",
          message: "Synthetic JSON-safe diagnostic values.",
          expected: { nested: ["first", { value: 2 }] },
          actual: [true, null, { value: "observed" }],
        }],
      },
      localArtifacts: reportInput().localArtifacts,
    });

    assert.equal(report.result, "PASS");
    const diagnostic = report.claims.find(({ subject }) => subject === "prepared-definition")?.diagnostics[0];
    assert.deepEqual(diagnostic?.expected, { nested: ["first", { value: 2 }] });
    assert.deepEqual(diagnostic?.actual, [true, null, { value: "observed" }]);
  });

  test("sanitizes unsafe prepared and local-artifact paths", () => {
    const unsafePaths = [
      "../../tenant/private.json",
      "/opt/private/tenant.json",
      "file:///Users/private/tenant.json",
      "C:\\Users\\private\\x",
      "\\\\server\\share\\x",
      "foo/../../tenant/private.json",
      "foo/../tenant/private.json",
      "x=../../tenant/private.json",
      "file:../../tenant/private.json",
      "C:relative\\secret",
      "safe\\..\\secret",
      "s3://bucket/private.json",
      "opaque:../../tenant/private.json",
    ];

    for (const unsafePath of unsafePaths) {
      const report = createLocalEvidenceReport({
        preparedDefinition: {
          path: unsafePath,
          result: "PASS",
          diagnostics: [{
            code: "UNSAFE-PREPARED-PATH",
            message: "Synthetic prepared path diagnostic.",
            path: unsafePath,
          }],
        },
        localArtifacts: [{
          kind: "flow",
          path: unsafePath,
          result: "PASS",
          diagnostics: [{
            code: "UNSAFE-ARTIFACT-PATH",
            message: "Synthetic artifact path diagnostic.",
            path: unsafePath,
          }],
        }],
      });
      const serialized = JSON.stringify(report);

      assert.doesNotMatch(serialized, new RegExp(unsafePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.equal(report.result, "PASS");
      assert.equal(report.claims.find(({ subject }) => subject === "prepared-definition")?.artifactPath, "<redacted-path>");
      assert.equal(report.claims.find(({ subject }) => subject === "local-artifact")?.artifactPath, "<redacted-path>");
    }
  });

  test("preserves valid repository-relative prepared and artifact paths", () => {
    const report = createLocalEvidenceReport({
      preparedDefinition: {
        path: "flows/synthetic.json",
        result: "PASS",
        diagnostics: [{
          code: "SAFE-PREPARED-PATH",
          message: "Synthetic prepared path diagnostic.",
          path: "flows/synthetic.json",
        }],
      },
      localArtifacts: [{
        kind: "flow",
        path: "artifacts/synthetic.json",
        result: "PASS",
        diagnostics: [{
          code: "SAFE-ARTIFACT-PATH",
          message: "Synthetic artifact path diagnostic.",
          path: "artifacts/synthetic.json",
        }],
      }],
    });

    assert.equal(report.result, "PASS");
    assert.match(JSON.stringify(report), /flows\/synthetic\.json/);
    assert.match(JSON.stringify(report), /artifacts\/synthetic\.json/);
  });

  test("sanitizes unsafe paths in diagnostic prose and artifact-kind claim IDs", () => {
    const unsafePaths = [
      "../../tenant/private.json",
      "/opt/private/tenant.json",
      "file:///Users/private/tenant.json",
      "C:\\Users\\private\\x",
      "\\\\server\\share\\x",
    ];

    for (const unsafePath of unsafePaths) {
      const report = createLocalEvidenceReport({
        preparedDefinition: {
          path: "flows/safe.json",
          result: "PASS",
          diagnostics: [{
            code: unsafePath,
            message: `Found ${unsafePath}.`,
            remediation: `Remove ${unsafePath}.`,
            expected: { path: unsafePath },
            actual: [unsafePath],
          }],
        },
        localArtifacts: [{
          kind: unsafePath,
          path: "artifacts/safe.json",
          result: "PASS",
          diagnostics: [],
        }],
      });
      const serialized = JSON.stringify(report);

      assert.doesNotMatch(serialized, new RegExp(unsafePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.match(serialized, /<redacted-path>|<redacted-url>/);
    }
  });

  test("preserves ordinary diagnostic prose and safe artifact kinds", () => {
    const report = createLocalEvidenceReport({
      preparedDefinition: {
        path: "flows/safe.json",
        result: "PASS",
        diagnostics: [{
          code: "SAFE-PROSE",
          message: "Synthetic ordinary diagnostic prose remains readable.",
          remediation: "Review the safe relative artifact before rerunning.",
        }],
      },
      localArtifacts: [{
        kind: "flow",
        path: "artifacts/safe.json",
        result: "PASS",
        diagnostics: [],
      }],
    });
    const serialized = JSON.stringify(report);

    assert.equal(report.result, "PASS");
    assert.match(serialized, /Synthetic ordinary diagnostic prose remains readable/);
    assert.match(serialized, /artifact:flow:artifacts\/safe\.json/);
  });

  test("redacts delimiter-embedded absolute paths and unlisted schemes everywhere", () => {
    for (const unsafeValue of ["/opt/private/tenant.json", "custom:secret"]) {
      const report = createLocalEvidenceReport({
        preparedDefinition: {
          path: "flows/safe.json",
          result: "PASS",
          diagnostics: [{
            code: unsafeValue,
            message: `artifact=${unsafeValue}`,
            remediation: `repair=${unsafeValue}`,
            expected: { nested: `artifact=${unsafeValue}` },
            actual: [`artifact=${unsafeValue}`],
          }],
        },
        localArtifacts: [{
          kind: unsafeValue,
          path: "artifacts/safe.json",
          result: "PASS",
          diagnostics: [],
        }],
      });
      const serialized = JSON.stringify(report);

      assert.doesNotMatch(serialized, new RegExp(unsafeValue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.equal(report.result, "PASS");
    }
  });

  test("redacts embedded unsafe tokens in explicit paths and derived IDs", () => {
    for (const unsafePath of [
      "artifact=/opt/private/tenant.json",
      "artifact=../private/tenant.json",
    ]) {
      const report = createLocalEvidenceReport({
        preparedDefinition: {
          path: unsafePath,
          result: "PASS",
          diagnostics: [{
            code: "SAFE-CODE",
            message: "Synthetic explicit path.",
            path: unsafePath,
          }],
        },
        localArtifacts: [{
          kind: "flow",
          path: unsafePath,
          result: "PASS",
          diagnostics: [{
            code: "SAFE-ARTIFACT",
            message: "Synthetic explicit artifact path.",
            artifactPath: unsafePath,
          }],
        }],
      });
      const serialized = JSON.stringify(report);

      assert.doesNotMatch(serialized, new RegExp(unsafePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.equal(report.result, "PASS");
      assert.ok(report.claims.every(({ id, artifactPath }) =>
        !id.includes(unsafePath) && !artifactPath.includes(unsafePath)
      ));
    }
  });

  test("fails closed for a prepared-definition getter that throws", () => {
    const hostile = new Proxy({
      localArtifacts: reportInput().localArtifacts,
    }, {
      get(target, property, receiver) {
        if (property === "preparedDefinition") {
          throw new Error("synthetic getter failure");
        }
        return Reflect.get(target, property, receiver);
      },
    });

    const report = createLocalEvidenceReport(hostile);

    assert.equal(report.result, "NOT_RUN");
    assert.equal(report.claims.length, 0);
    assert.equal(report.diagnostics[0]?.code, "LOCAL_EVIDENCE_INPUT_INVALID");
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
