import { INestApplication } from '@nestjs/common';
import { AllExceptionsFilter } from './common/exception.filter';

/**
 * Shared CORS/exception-filter config for the app instance. The
 * NestFactory.create() call itself stays inline in main.ts (not here) —
 * Vercel's zero-config NestJS build statically scans the entrypoint file
 * for a direct `@nestjs/core` import/NestFactory.create() call, and
 * rejects entrypoints that only delegate to it transitively.
 */
export function configureApp(app: INestApplication): void {
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
}
