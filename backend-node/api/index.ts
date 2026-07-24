import 'reflect-metadata';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { Express } from 'express';
import { createApp } from '../src/create-app';

// Vercel's Node.js runtime accepts any (req, res) => void handler — an
// Express instance already satisfies that signature, so no adapter library
// (serverless-http, @vendia/serverless-express) is needed: exporting the
// underlying Express app directly is the simpler, well-established path for
// Nest-on-Express on Vercel specifically (those adapter libraries exist
// mainly for AWS Lambda's proxy-integration event format, which Vercel
// doesn't use).
//
// Cached at module scope across warm invocations of the same function
// instance — app.init() runs once per cold start, not per request.
let expressAppPromise: Promise<Express> | null = null;

async function getExpressApp(): Promise<Express> {
  if (!expressAppPromise) {
    expressAppPromise = createApp().then(async (app) => {
      await app.init();
      return app.getHttpAdapter().getInstance() as Express;
    });
  }
  return expressAppPromise;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const expressApp = await getExpressApp();
  expressApp(req as any, res as any);
}
