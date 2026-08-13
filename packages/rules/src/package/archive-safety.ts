import type {
  RuleDetector,
  ValidationContext,
} from "../registry.ts";
import {
  missingPackageEvidenceDiagnostic,
  packageEvidence,
  packageDiagnostic,
} from "./common.ts";

const MESSAGE = "Final package archive failed bounded safety inspection.";

export const pkgArchive001: RuleDetector = Object.freeze({
  id: "PKG-ARCHIVE-001",
  async validate(context: ValidationContext) {
    const missing = missingPackageEvidenceDiagnostic(context, this.id, false);
    if (missing !== undefined) {
      return [missing];
    }
    for (const packaged of packageEvidence(context)) {
      if (packaged.failure === "unsafe") {
        return [packageDiagnostic(
          this.id,
          packaged.relativePath,
          "/archiveSafety",
          MESSAGE,
        )];
      }
    }
    return [];
  },
});
