# SharePoint Flow Engineering Kit Read-Only Plugin

Install from the public repository:

```powershell
npx --yes skills add https://github.com/brunotaisa01-source/sharepoint-flow-engineering-kit --skill sharepoint-flow-engineering-kit-readonly --global --agent codex --copy --yes
```

This skill exposes only the local synthetic `spflow-readonly` interface:

- `getManifest`;
- `getRegistryMetadata`;
- `listApprovedLessons`;
- `getApprovedLesson`;
- `listCandidateStatus`;
- `discover`;
- `preflight`.

The current provider is offline and emits `RUNTIME_SYNTHETIC` evidence. It never
uses a network connection and never changes a tenant. It must reject create,
update, delete, approve, promote, import, rebind, enable, disable, trigger,
permission-write, mutate, rollback, and network operations.

`listApprovedLessons` must fail closed while the registry has an unresolved
candidate. Local synthetic discovery/preflight is not tenant discovery/preflight.
