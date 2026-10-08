"""Bounded local packaging; explicit allowlist, no credentials or provider reads."""
from pathlib import Path
import difflib
import hashlib
import json
import subprocess
import tarfile

root = Path(__file__).resolve().parent.parent
delivery = root.parent
original = Path('/Users/quentinflores/Documents/Codex/2026-10-06/task/jarvis-comps-acquisitions')
base = '39248149252def9de874219838b1cd1b70443642'
def git(*args):
    return subprocess.check_output(['git', *args], cwd=original).decode().strip()
assert git('rev-parse', 'HEAD') == base
assert git('branch', '--show-current') == 'codex/acquisitions-native-proof'
assert git('status', '--porcelain') == ''
manifest = json.loads((delivery / 'delivery-manifest.json').read_text())
production = ['src/app/api/acquisitions/quote/route.ts', *['src/lib/' + name + '.ts' for name in ['acquisition-machine-auth','headless-native-quote','native-quote-contract','native-quote-runtime','ghl-native-quote','native-installed-fields','ghl-native-transport']]]
tests = ['src/app/api/acquisitions/quote/route.test.ts', *['src/lib/' + name + '.ts' for name in ['headless-native-quote.test','ghl-native-quote.test','native-quote.test-fixtures','acquisition-machine-auth.local-test','ghl-native-transport.test','ghl-native-quote.test-fixtures']]]
prerequisites = ['src/lib/native/' + name + '.ts' for name in ['contracts','observed-provider','atlas','storage','native-fields','acquisition-policy','repair-model','offers']]
prerequisites += ['native-deliverables/schema-manifest.json','native-deliverables/native-installed-schema.json','native-deliverables/observed-source/provider-mapping/observed-provider-adapter.mjs','native-deliverables/observed-source/provider-mapping/observed-provider-adapter.d.mts']
def detail(path):
    data=(root/path).read_bytes()
    return {'file':path,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}
deployment = {'baseCommit':base,'route':'POST /api/acquisitions/quote','productionAdditions':[detail(p) for p in production],'nativePrerequisites':[detail(p) for p in prerequisites],'existingRuntimeDependencies':['src/lib/db.ts','existing generated Prisma client','existing machine-auth tables','existing DATABASE_URL binding','zod','Next.js Node route runtime'],'newPackageDependencies':[],'newMigrations':[],'existingRoutesModified':False,'nativeTransportInstalled':False,'localSyntheticAdapterE2EPassed':True,'liveE2EPassed':False,'consistency':'Unique immutable native event plus sequential rereads; not a multi-record transaction or exactly-once speech','runtimeFactoryWired':True,'nativeRuntimeConfigured':False,'newServerSettings':['JARVIS_NATIVE_QUOTE_ENABLED','JARVIS_NATIVE_QUOTE_BINDINGS_JSON','JARVIS_GHL_PRIVATE_INTEGRATION_TOKEN'],'legacyEnableFlagChanged':False,'configuration':'Node route composes fixed-origin transport and concrete native adapter from server-only settings; inactive worksheet is rejected; secret and verified bindings remain absent','remainingAccess':'Owner scope expansion applied and reload-verified by browser per parent; owner secure token binding and verified nonsecret native settings remain pending; no credential values included'}
(root/'native-deliverables/HTTP-DEPLOYMENT-MANIFEST.json').write_text(json.dumps(deployment,indent=2)+'\n')
files = set(manifest['files']) | set(production) | set(tests) | {'scripts/export-native-quote.ts','scripts/package-native-delivery.py'}
files |= {str(p.relative_to(root)) for p in (root/'native-deliverables').rglob('*') if p.is_file()}
files = sorted(files)
assert not any(part in {'.env','.git','.aws','.codex','.agents'} for f in files for part in Path(f).parts)
tracked = set(git('ls-files').splitlines())
modified = [f for f in files if f in tracked and (root/f).read_bytes() != (original/f).read_bytes()]
assert modified == ['src/lib/headless-acquisitions.local-test.ts'], modified
def patch(paths):
    output=[]
    for name in paths:
        before=(original/name).read_text().splitlines(keepends=True) if name in tracked else []
        after=(root/name).read_text().splitlines(keepends=True)
        if before == after: continue
        output.append(f'diff --git a/{name} b/{name}\n')
        if name not in tracked: output.append('new file mode 100644\n')
        output.extend(difflib.unified_diff(before,after,fromfile='a/'+name if name in tracked else '/dev/null',tofile='b/'+name))
    return ''.join(output)
(delivery/'jarvis-native-implementation.patch').write_text(patch(files))
quote_files=sorted(set(production+tests+['scripts/export-native-quote.ts','native-deliverables/native-installed-schema.json','native-deliverables/HTTP-QUOTE-ADAPTER.md','native-deliverables/HTTP-DEPLOYMENT-MANIFEST.json','native-deliverables/BROWSER-INPUTS-NEEDED.md']) | {f for f in files if f.startswith('native-deliverables/http/') or f.startswith('native-deliverables/native-schema-source/')})
(delivery/'jarvis-native-quote-endpoint.patch').write_text(patch(quote_files))
subprocess.run(['git','apply','--check',str(delivery/'jarvis-native-implementation.patch')],cwd=original,check=True)
subprocess.run(['git','apply','--check',str(delivery/'jarvis-native-quote-endpoint.patch')],cwd=original,check=True)
evidence=set(manifest['evidenceInArchive']) | {str(p.relative_to(root)) for p in (root/'evidence').glob('quote-*') if p.is_file()} | {str(p.relative_to(root)) for p in (root/'evidence').glob('wiring-*') if p.is_file()}
with tarfile.open(delivery/'jarvis-native-implementation.tar.gz','w:gz') as archive:
    for name in files+sorted(evidence): archive.add(root/name,arcname=name)
manifest.update({'files':files,'newFileCount':len([f for f in files if f not in tracked]),'evidenceInArchive':sorted(evidence),'quoteRouteAdded':True,'concreteGhlAdapterImplemented':True,'installedSchemaObjects':9,'installedSchemaFields':179,'installedSchemaApiVerified':False,'httpSchemas':8,'runtimeFactoryWired':True,'nativeRuntimeConfigured':False,'nativeTransportInstalled':False,'scopesOrCredentialsChanged':False,'nativeLedgerUse':'Proposed immutable QUOTE_DECISION_RECORDED in existing Lifecycle Event fields; API uniqueness not verified','compPolicyProposalActive':False})
manifest['tests'].update({'vitestPassed':522,'vitestFiles':22,'quoteHandlerTests':66,'quoteRouteTests':6,'transportAndCompositionTests':44,'concreteGhlAdapterTests':36,'localSyntheticNativeHttpCompositionPassed':True,'machineAuthActualPostgresPassed':True,'postgresRerunInQuoteFollowup':True,'patchAppliesToBase':True})
manifest['testOnlyExistingChange']='Align legacy synthetic test clock to disposable PostgreSQL clock. Production quote files are additive; existing production source unchanged.'
manifest['artifacts']=[]
for name in ['jarvis-native-implementation.patch','jarvis-native-implementation.tar.gz','jarvis-native-quote-endpoint.patch']:
    data=(delivery/name).read_bytes();manifest['artifacts'].append({'file':name,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
(delivery/'delivery-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
assert git('status','--porcelain') == ''
print(json.dumps({'files':len(files),'archiveEntries':len(files)+len(evidence),'newFiles':manifest['newFileCount'],'modifiedExisting':modified,'patchesApply':True,'artifacts':manifest['artifacts']},indent=2))
