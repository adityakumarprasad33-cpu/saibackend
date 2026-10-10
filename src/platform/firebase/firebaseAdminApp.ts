import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
} from 'firebase-admin/app';
import * as fs from 'node:fs';
import * as path from 'node:path';

const projectId = process.env.FIREBASE_PROJECT_ID;
const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
const absoluteServiceAccountPath = serviceAccountPath
  ? path.resolve(serviceAccountPath)
  : undefined;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

export const firebaseAdminApp =
  getApps().find((app) => app.name === '[DEFAULT]') ??
  initializeApp({
    ...(projectId ? { projectId } : {}),
    ...(process.env.FIREBASE_STORAGE_BUCKET
      ? { storageBucket: process.env.FIREBASE_STORAGE_BUCKET }
      : {}),
    credential:
      projectId && clientEmail && privateKey
        ? cert({ projectId, clientEmail, privateKey })
        : absoluteServiceAccountPath && fs.existsSync(absoluteServiceAccountPath)
          ? cert(JSON.parse(fs.readFileSync(absoluteServiceAccountPath, 'utf8')))
          : applicationDefault(),
  });
