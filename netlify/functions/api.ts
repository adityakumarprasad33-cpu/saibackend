import type { Handler } from '@netlify/functions';
import serverless from 'serverless-http';
import { app } from '../../src/server';

const expressHandler = serverless(app);

export const handler: Handler = async (event, context) =>
  expressHandler(event, context) as ReturnType<Handler>;
