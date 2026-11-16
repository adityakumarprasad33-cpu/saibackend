import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectId = 'demo-samadhanai-security-test';
const authHost = '127.0.0.1:9099';
const firestoreHost = '127.0.0.1:8185';
const here = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(here, '..');
const repoRoot = path.resolve(backendRoot, '..', '..');
const firebaseCli = path.join(repoRoot, 'security', 'firestore-emulator', 'node_modules', 'firebase-tools', 'lib', 'bin', 'firebase.js');
const safeEnv = { PATH: process.env.PATH ?? '' };
for (const key of [
  'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'HOME', 'USERPROFILE', 'APPDATA',
  'LOCALAPPDATA', 'HOMEDRIVE', 'HOMEPATH', 'JAVA_HOME', 'COMSPEC', 'OS',
  'PROCESSOR_ARCHITECTURE', 'PROCESSOR_IDENTIFIER',
]) if (process.env[key]) safeEnv[key] = process.env[key];
safeEnv.CI = '1';

const command = 'node tests/security/run-tests.cjs';
const args = [
  firebaseCli,
  'emulators:exec',
  '--only', 'auth,firestore',
  '--project', projectId,
  '--config', path.join(repoRoot, 'firebase.security-tests.json'),
  '--', command,
];
const result = spawnSync(process.execPath, args, {
  cwd: backendRoot,
  env: safeEnv,
  stdio: 'inherit',
  shell: false,
});
if (result.error) {
  console.error(`Could not start the isolated local Firebase emulators: ${result.error.message}`);
  process.exit(1);
}
if (result.status !== 0) console.error(`Backend security emulator suite exited with status ${result.status ?? 'unknown'}.`);
process.exit(result.status ?? 1);
