/**
 * SamadhanAI Backend Server Entry Point
 *
 * Configures Express HTTP server, security headers (helmet, cors),
 * JSON parsing, IAM gateway routing, Hierarchy, Grievances, Cases, Officers, Departments, AI Platform, and Notification Platform routing.
 */

// Load the single repository-level environment file before importing modules
// that read process.env.
import './platform/configuration/loadEnv';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { iamRouter } from './features/iam/api/routes/iam.routes';
import { hierarchyRouter } from './features/departments/api/HierarchyController';
import { grievanceRouter } from './features/grievances/api/routes/grievance.routes';
import { caseRouter } from './features/case_management/api/routes/case.routes';
import { officerRouter } from './features/officers/api/OfficerController';
import { departmentRouter } from './features/departments/api/DepartmentController';
import { aiRouter } from './features/ai/api/routes/ai.routes';
import { notificationRouter } from './features/notifications/api/routes/notification.routes';
import { ObservabilityEngine } from './platform/observability/ObservabilityEngine';
import { ConfigProvider } from './platform/configuration/ConfigProvider';
import { authMiddleware } from './features/iam/api/middlewares/authMiddleware';

const app = express();
const config = ConfigProvider.getInstance().getConfig();
// Permit the local website preview to use the deployed API during development.
// Keep this limited to the exact loopback origins and port used by the preview.
const localPreviewOrigins = new Set([
  'http://localhost:8085',
  'http://127.0.0.1:8085',
  'http://localhost:8093',
  'http://127.0.0.1:8093',
  'http://localhost:8080',
  'http://127.0.0.1:8080',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5000',
  'http://127.0.0.1:5000',
]);

// Security & Parsing Middlewares
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({
  origin: (origin, callback) => {
    const isConfiguredOrigin = origin !== undefined && config.corsAllowedOrigins.includes(origin);
    const isLocalDevelopmentOrigin = config.environment !== 'production' &&
      origin !== undefined && (
        localPreviewOrigins.has(origin) ||
        /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
      );
    if (isConfiguredOrigin || isLocalDevelopmentOrigin) {
      callback(null, true);
      return;
    }
    callback(null, false);
  },
  credentials: true,
}));
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Root & Health/Readiness/Liveness Endpoints
app.get('/health', ObservabilityEngine.health);
app.get('/ready', ObservabilityEngine.readiness);
app.get('/live', ObservabilityEngine.liveness);

app.get('/', (_req, res) => {
  res.status(200).json({
    service: 'SamadhanAI Production Backend REST Gateway',
    version: '0.7.0-rc1',
    status: 'ACTIVE',
  });
});
// API metadata is not a public discovery endpoint; health probes use /health,
// /ready, and /live above.
app.get('/api/v1', authMiddleware, (_req, res) => {
  res.status(200).json({ service: 'SamadhanAI API', status: 'ACTIVE' });
});

// Versioned API Gateway Routing
app.use('/api/v1', iamRouter);
app.use('/api/v1/hierarchy', hierarchyRouter);
app.use('/api/v1/grievances', grievanceRouter);
app.use('/api/v1/cases', caseRouter);
app.use('/api/v1/officers', officerRouter);
app.use('/api/v1/departments', departmentRouter);
app.use('/api/v1/ai', aiRouter);
app.use('/api/v1/notifications', notificationRouter);

app.use('/api/v1', (_req, res) => {
  res.status(404).json({ code: 'NotFound', message: 'The requested service is not available.' });
});

app.use((error: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const diagnostic = error instanceof Error ? error.message : String(error);
  console.error(`[${req.method} ${req.path}] Request failed: ${diagnostic}`);
  if (res.headersSent) return;
  const statusCode = typeof error === 'object' && error !== null && 'statusCode' in error
    ? Number((error as { statusCode: unknown }).statusCode)
    : 500;
  const status = Number.isInteger(statusCode) && statusCode >= 400 && statusCode <= 599 ? statusCode : 500;
  res.status(status).json({
    code: status === 503 ? 'ServiceUnavailable' : status === 400 ? 'InvalidRequest' : 'InternalError',
    message: status === 400
      ? 'The request could not be processed. Check the submitted information and try again.'
      : status === 503
        ? 'The service is temporarily unavailable. Please try again later.'
        : 'The request could not be completed.',
    correlationId: req.headers['x-correlation-id'],
  });
});

// Netlify imports the Express app inside a function; only start a listener for
// the standalone local/container process.
if (require.main === module) {
  app.listen(config.port, '0.0.0.0', () => {
    console.log(`[SamadhanAI Backend Gateway] Server running on 0.0.0.0:${config.port} in ${config.environment} mode.`);
  });
}

export { app };
export default app;
