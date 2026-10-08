# Exact access change for review — not applied

Target: existing **XCEREBRO** private integration, ID `6a027ade378de9461aec8276`, in **Jarvis Premium**, location `SesCoVXlNu7qTSBol1gs`.

Official account settings UI: https://app.justjarvis.com/v2/location/SesCoVXlNu7qTSBol1gs/settings/private-integrations

Observed existing edit URL: https://app.justjarvis.com/v2/location/SesCoVXlNu7qTSBol1gs/settings/private-integrations/6a027ade378de9461aec8276/edit

Keep existing contacts.write, contacts.readonly and locations.readonly. Add only:

| Scope | Adapter purpose |
| --- | --- |
| objects/schema.readonly | Verify existing object schemas |
| objects/record.readonly | Read existing custom-object records |
| objects/record.write | Create/update records; this platform scope also permits deletion |
| associations.readonly | Read existing association definitions |
| associations/relation.readonly | Read actual record links |
| associations/relation.write | Create required record links |

These exact strings and endpoint mappings appear in [HighLevel's official scope reference](https://marketplace.gohighlevel.com/docs/Authorization/Scopes/index.html). No schema-definition or association-definition write scope is needed for the installed schema. The scope grant applies to the location's covered objects, not only this project's nine objects; every client holding this same token gains the added access. Do not claim field-level/project-only restriction.

HighLevel explicitly documents that editing a private integration's scopes does **not** generate a new token: the existing token continues to work. Rotation is a separate operation and is not part of this proposal. [Official private-integration documentation](https://help.gohighlevel.com/support/solutions/articles/155000003054-private-integrations-everything-you-need-to-know)

Scope expansion itself needs no credential entry. The deployed adapter still needs an authorized secret binding: if its existing secure configuration already references this token, preserve it; otherwise secure entry/binding is a separate concrete step. We have not established that backend binding. Do not extract a token from the browser or repurpose the ChatGPT connector's hidden credential. No token was read, copied, created or rotated during this review.

The proposed confirmation is the six-scope addition on the exact integration/location above, with existing-token clients gaining covered custom-object read/write and relation access. No grants have been changed. Before any grant action, obtain the required action-time confirmation for expanding security-sensitive access. This requirement comes from the browser confirmation policy, not an unresolved broad project approval.

Immediate schema handoff absolute path:
`/Users/quentinflores/Documents/Codex/2026-10-07/task-3/MACHINE-NATIVE-SCHEMA-HANDOFF.json`

Metadata-only existing access evidence:
`/Users/quentinflores/Documents/Codex/2026-10-07/task-3/EXISTING-GHL-TRANSPORT-METADATA.json`
