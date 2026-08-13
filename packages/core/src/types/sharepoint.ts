import type {
  FieldType,
  ListRole,
  PermissionRoleName,
  WriteModel,
} from "./constants.js";

export interface SharePointContract {
  siteUrlBinding: string;
  lists: ListContract[];
}

export interface ListContract {
  id: string;
  titleBinding: string;
  role: ListRole;
  writeModel: WriteModel;
  readAllowlist: string[];
  createAllowlist: string[];
  patchAllowlist: string[];
  fields: FieldContract[];
  indexes: IndexContract[];
  permissions: PermissionContract;
  views: ViewContract[];
}

export interface FieldContract {
  logicalName: string;
  internalName: string;
  type: FieldType;
  required: boolean;
  indexed: boolean;
  unique: boolean;
  clientEditable: boolean;
  serverAuthoritative: boolean;
  immutableAfterCreate: boolean;
  sensitive: boolean;
  maxLength?: number;
  dateTimeMode?: "DateOnly" | "DateTime";
  choices?: string[];
  lookupListId?: string;
  lookupField?: string;
}

export interface IndexContract {
  field: string;
  order: number;
  required: boolean;
}

export interface ViewContract {
  id: string;
  fields: string[];
  rowLimit: number;
  paged: true;
  filterContract?: string;
}

export interface PermissionContract {
  inheritance: "inherit" | "break-copy" | "break-clear";
  minimumRoles: PermissionRole[];
  directUserGrants: "forbidden";
  effectivePermissionReadback: "required";
}

export interface PermissionRole {
  principalBinding: string;
  role: PermissionRoleName;
  allowedOperations: string[];
}
