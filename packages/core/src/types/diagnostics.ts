export interface Diagnostic {
  code: string;
  path: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  diagnostics: Diagnostic[];
}
