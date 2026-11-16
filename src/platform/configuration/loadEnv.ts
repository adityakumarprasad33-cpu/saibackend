import { config } from 'dotenv';
import path from 'node:path';

const SECURITY_TEST_PROJECT = 'demo-samadhanai-security-test';
if (process.env.NODE_ENV === 'testing') {
  const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST;
  const syntheticTestCredential = process.env.FIREBASE_CLIENT_EMAIL === 'security-tests@demo.invalid' &&
    typeof process.env.FIREBASE_PRIVATE_KEY === 'string' &&
    process.env.FIREBASE_PRIVATE_KEY.includes('BEGIN PRIVATE KEY');
  const hasCredentials = Boolean(
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    (process.env.FIREBASE_CLIENT_EMAIL && !syntheticTestCredential) ||
    (process.env.FIREBASE_PRIVATE_KEY && !syntheticTestCredential) ||
    process.env.REDIS_URL || process.env.CLOUDINARY_API_SECRET || process.env.GEMINI_API_KEY,
  );
  if (process.env.FIREBASE_PROJECT_ID !== SECURITY_TEST_PROJECT ||
      authHost !== '127.0.0.1:9099' || firestoreHost !== '127.0.0.1:8185' || hasCredentials) {
    throw new Error(`Security test isolation guard failed (demo project: ${process.env.FIREBASE_PROJECT_ID === SECURITY_TEST_PROJECT}, local Auth: ${authHost === '127.0.0.1:9099'}, local Firestore: ${firestoreHost === '127.0.0.1:8185'}, cloud credentials absent: ${!hasCredentials}).`);
  }
  // Intentionally do not load repository `.env` in test mode.
} else {
  // Works from both ts-node-dev (src/) and the compiled server (dist/).
  const repositoryEnvPath = path.resolve(__dirname, '../../../../../.env');
  config({ path: repositoryEnvPath });
}
