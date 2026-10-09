import { config } from 'dotenv';
import path from 'node:path';

// Works from both ts-node-dev (src/) and the compiled server (dist/).
const repositoryEnvPath = path.resolve(__dirname, '../../../../../.env');
config({ path: repositoryEnvPath });
