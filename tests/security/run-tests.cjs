const { spawnSync } = require('node:child_process');
const { generateKeyPairSync } = require('node:crypto');

const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

process.env.NODE_ENV = 'testing';
process.env.FIREBASE_PROJECT_ID = 'demo-samadhanai-security-test';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8185';
process.env.PORT = '0';
process.env.FIREBASE_CLIENT_EMAIL = 'security-tests@demo.invalid';
process.env.FIREBASE_PRIVATE_KEY = privateKey;
process.env.HMAC_SECRET = 'local-security-test-hmac-secret-not-for-production';

const result = spawnSync(process.execPath, [
  '--test', '--test-concurrency=1', '--test-force-exit', 'tests/security/authorization.test.cjs',
], { stdio: 'inherit', env: process.env, shell: false });
if (result.error) {
  console.error(`Could not start backend HTTP security tests: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
