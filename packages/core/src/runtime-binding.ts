export type RuntimeConnectionStatus = "Connected" | "Error" | "Unknown";

export interface RuntimeConnectionReference {
  readonly logicalName: string;
  readonly physicalName: string;
}

export interface RuntimeBindingSnapshot {
  readonly physicalConnectionStatus: RuntimeConnectionStatus;
  readonly currentConnection?: RuntimeConnectionReference;
  readonly installedConnection?: RuntimeConnectionReference;
  readonly registeredDataSourceAlias: string;
  readonly generatedDataSourceAlias: string;
}

export interface RuntimeBindingAssessment {
  readonly result: "PASS" | "FAIL";
  readonly diagnostics: readonly string[];
}

/**
 * Applies the connector-neutral runtime binding gate used by live flow hosts.
 * A physical connection status is only one input; the installed reference and
 * the full generated/registered data-source alias must also agree.
 */
export function assessRuntimeBinding(snapshot: RuntimeBindingSnapshot): RuntimeBindingAssessment {
  const diagnostics: string[] = [];

  if (snapshot.physicalConnectionStatus !== "Connected") {
    diagnostics.push("RUNTIME-CONNECTION-NOT-CONNECTED");
  }

  const current = snapshot.currentConnection;
  const installed = snapshot.installedConnection;
  if (
    current === undefined
    || installed === undefined
    || current.logicalName !== installed.logicalName
    || current.physicalName !== installed.physicalName
  ) {
    diagnostics.push("RUNTIME-CONNECTION-REFERENCE-MISMATCH");
  }

  if (
    snapshot.registeredDataSourceAlias.length === 0
    || snapshot.generatedDataSourceAlias.length === 0
    || snapshot.registeredDataSourceAlias !== snapshot.generatedDataSourceAlias
  ) {
    diagnostics.push("RUNTIME-DATASOURCE-ALIAS-MISMATCH");
  }

  return {
    result: diagnostics.length === 0 ? "PASS" : "FAIL",
    diagnostics,
  };
}
