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

import { rateGuardMiddleware } from './platform/rateguard/middleware/rateGuardMiddleware';

const app = express();
const config = ConfigProvider.getInstance().getConfig();

// Security & Parsing Middlewares
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || config.corsAllowedOrigins.includes('*') || config.corsAllowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(null, false);
  },
  credentials: true,
}));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
app.use(rateGuardMiddleware);

// Root & Health/Readiness/Liveness Endpoints
app.get('/health', ObservabilityEngine.health);
app.get('/ready', ObservabilityEngine.readiness);
app.get('/live', ObservabilityEngine.liveness);

app.get(['/', '/api/v1'], (_req, res) => {
  res.status(200).json({
    service: 'SamadhanAI Production Backend REST Gateway',
    version: '0.7.0-rc1',
    status: 'ACTIVE',
    endpoints: {
      health: 'GET /health',
      readiness: 'GET /ready',
      liveness: 'GET /live',
      authRegister: 'POST /api/v1/auth/register',
      authLogin: 'POST /api/v1/auth/login',
      userProfile: 'GET /api/v1/users/me',
      adminProvisioning: 'POST /api/v1/admin/government-employees',
      adminEmployees: 'GET /api/v1/admin/government-employees',
      sectors: 'GET /api/v1/hierarchy/sectors',
      departments: 'GET /api/v1/hierarchy/departments',
      posts: 'GET /api/v1/hierarchy/posts',
      grievances: 'GET /api/v1/grievances, POST /api/v1/grievances',
      cases: 'GET /api/v1/cases, POST /api/v1/cases/accept',
      officerWorkload: 'GET /api/v1/officers/workload',
      aiClassify: 'POST /api/v1/ai/classify',
      aiDraftAssist: 'POST /api/v1/ai/draft-assist',
      aiAnalyzeImage: 'POST /api/v1/ai/analyze-image',
      aiSuggestTitles: 'POST /api/v1/ai/suggest-titles',
      aiGenerateDescription: 'POST /api/v1/ai/generate-description',
      notifications: 'GET /api/v1/notifications',
    },
  });
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

app.use((error: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[${req.method} ${req.path}] Request failed: ${message}`);
  if (res.headersSent) return;
  const statusCode = typeof error === 'object' && error !== null && 'statusCode' in error
    ? Number((error as { statusCode: unknown }).statusCode)
    : 500;
  const status = Number.isInteger(statusCode) && statusCode >= 400 && statusCode <= 599 ? statusCode : 500;
  res.status(status).json({
    code: status === 503 ? 'ServiceUnavailable' : status === 400 ? 'InvalidRequest' : 'InternalError',
    message: status === 400 || status === 503
      ? message
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
