export const EVIDENCE_CLASSES = [
  "LOCAL_STATIC",
  "LOCAL_RUNTIME",
  "PACKAGE_ARTIFACT",
  "IMPORTED",
  "REBOUND",
  "ENABLED",
  "LIVE_SMOKE",
  "TENANT_VERIFIED",
  "PUBLISHED",
] as const;

export type EvidenceClass = (typeof EVIDENCE_CLASSES)[number];

export const BINDING_KINDS = [
  "site-url",
  "list-title",
  "mailbox-upn",
  "connection-reference",
  "environment-id",
  "solution-id",
] as const;

export type BindingKind = (typeof BINDING_KINDS)[number];

export const BINDING_PHASES = [
  "generate",
  "tenant-preflight",
  "tenant-apply",
  "tenant-readback",
] as const;

export type BindingPhase = (typeof BINDING_PHASES)[number];

export const LIST_ROLES = [
  "protected-domain",
  "command-queue",
  "audit",
  "access-control",
  "reference",
  "outbox",
] as const;

export type ListRole = (typeof LIST_ROLES)[number];

export const WRITE_MODELS = [
  "server-only",
  "append-command",
  "append-only",
  "direct-patch",
  "read-only",
] as const;

export type WriteModel = (typeof WRITE_MODELS)[number];

export const FIELD_TYPES = [
  "Text",
  "Note",
  "Number",
  "Currency",
  "Boolean",
  "DateTime",
  "Choice",
  "User",
  "Lookup",
  "Guid",
] as const;

export type FieldType = (typeof FIELD_TYPES)[number];

export const PERMISSION_ROLES = [
  "read",
  "contribute-limited",
  "processor",
  "audit-read",
  "owner",
] as const;

export type PermissionRoleName = (typeof PERMISSION_ROLES)[number];

export const FLOW_TRIGGERS = [
  "sharepoint-created",
  "sharepoint-modified",
  "recurrence",
  "manual",
] as const;

export type FlowTrigger = (typeof FLOW_TRIGGERS)[number];

export const PACKAGE_PROFILES = ["power-platform-solution-v1"] as const;

export type PackageProfile = (typeof PACKAGE_PROFILES)[number];

export const RULE_DOMAINS = [
  "application",
  "sharepoint",
  "power-automate",
  "package",
  "release",
  "data",
] as const;

export type RuleDomain = (typeof RULE_DOMAINS)[number];

export const ARTIFACT_KINDS = [
  "contract",
  "schema",
  "frontend",
  "builder",
  "definition",
  "zip",
  "manifest",
  "documentation",
  "evidence",
] as const;

export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];
