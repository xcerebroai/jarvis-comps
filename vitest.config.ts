import {configDefaults,defineConfig} from 'vitest/config';
// The preserved upstream suite uses node:test and is run separately with node --test.
export default defineConfig({test:{exclude:[...configDefaults.exclude,'native-deliverables/observed-source/**']}});
