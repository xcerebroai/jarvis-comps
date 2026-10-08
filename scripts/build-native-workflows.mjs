import {build} from 'esbuild';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const out='native-deliverables/code';
await mkdir(out,{recursive:true});
const entries={'property-adapter':'propertyWorkflow','observed-provider':'observedWorkflow','acquisition-policy':'acquisitionPolicyWorkflow',atlas:'atlasWorkflow',storage:'storageWorkflow',offers:'offerWorkflow',mason:'masonWorkflow',routing:'routingWorkflow'};
const index=[];
for(const [name,method] of Object.entries(entries)){
 const result=await build({entryPoints:[`src/lib/native/${name}.ts`],bundle:true,platform:'browser',format:'iife',globalName:'JarvisNative',write:false,target:'es2020',minify:true,legalComments:'none'});
 const code='/* eslint-disable -- generated standalone workflow */\n'+result.outputFiles[0].text+`\noutput = JarvisNative.${method}(inputData);\n`;
 if(Buffer.byteLength(code)>2000000)throw new Error('Local bundle budget exceeded; this is not a verified native code-size limit');
 await writeFile(`${out}/${name}.js`,code);
 index.push({name,input:'inputData.requestJson (JSON string)',output:'output assignment',bytes:Buffer.byteLength(code),sha256:createHash('sha256').update(code).digest('hex')});
}
const source=await readFile('native-deliverables/schema-manifest.json','utf8');
const repairModels=JSON.parse(await readFile('native-deliverables/admin-config/repair-models.json','utf8'));
await writeFile('native-deliverables/package-manifest.json',JSON.stringify({baseCommit:'3924814',locationId:'SesCoVXlNu7qTSBol1gs',providerMappingAvailable:false,observedSampleSchemaVerified:true,observedBindingAdapterAvailable:true,documentedPropertyMappingAvailable:true,livePropertyBindingVerified:false,liveVerified:false,outboundEnabled:false,repairModelSelectionPending:repairModels.selectionPending,activeRepairModelVersion:repairModels.activeModel?.version??null,schemaSha256:createHash('sha256').update(source).digest('hex'),bundles:index},null,2)+'\n');
console.log(JSON.stringify(index,null,2));
