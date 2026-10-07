import {build} from 'esbuild';
import {writeFile} from 'node:fs/promises';
// Build only; no network, credentials or hosted writes.
const result=await build({entryPoints:['src/lib/native-calculation-proof.ts'],bundle:true,platform:'browser',format:'iife',globalName:'JarvisNativeProof',write:false,target:'es2020'});
const code=result.outputFiles[0].text+'\nreturn JarvisNativeProof.nativeCalculationProof(inputData);\n';
if(Buffer.byteLength(code)>2000000)throw new Error('Proof exceeds observed output-size bound');
await writeFile('../jarvis-acquisitions-draft/native-first/custom-code-synthetic-proof.js',code);
console.log('Generated standalone proof with inputData.requestJson and return output; no imports/HTTP/Node/SDK.');
