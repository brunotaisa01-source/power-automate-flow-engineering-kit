import type {
  RuleDetector,
  ValidationContext,
} from "../registry.ts";
import {
  missingPackageEvidenceDiagnostic,
  packageEvidence,
  packageDiagnostic,
} from "./common.ts";

const MESSAGE = "Final package inventory does not match the profile-derived inventory.";

export const pkgNative001: RuleDetector = Object.freeze({
  id: "PKG-NATIVE-001",
  async validate(context: ValidationContext) {
    const missing = missingPackageEvidenceDiagnostic(context, this.id);
    if (missing !== undefined) {
      return [missing];
    }
    for (const packaged of packageEvidence(context)) {
      const inspection = packaged.inspection!;
      if (
        !inspection.valid
        || inspection.inventory.length !== inspection.expectedInventory.length
        || inspection.inventory.some((entry, index) =>
          entry !== inspection.expectedInventory[index]
        )
      ) {
        return [packageDiagnostic(
          this.id,
          packaged.relativePath,
          "/inventory",
          MESSAGE,
        )];
      }
    }
    return [];
  },
});
