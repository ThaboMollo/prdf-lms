import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/exception.filter';

/**
 * Shared bootstrap logic (CORS, exception filter) for both local dev
 * (main.ts, which calls .listen()) and the Vercel serverless entry point
 * (api/index.ts, which never listens — Vercel owns the HTTP server).
 * Kept in one place so the two entry points can't drift.
 */
export async function createApp(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule);

  const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:5173,http://localhost:5174')
    .split(',')
    .map((o) => o.trim());

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin) || origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  app.useGlobalFilters(new AllExceptionsFilter());

  return app;
}
