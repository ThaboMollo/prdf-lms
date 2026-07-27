import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AllExceptionsFilter } from './common/exception.filter';

/**
 * Shared CORS/exception-filter/validation/OpenAPI config for the app
 * instance. The NestFactory.create() call itself stays inline in main.ts
 * (not here) — Vercel's zero-config NestJS build statically scans the
 * entrypoint file for a direct `@nestjs/core` import/NestFactory.create()
 * call, and rejects entrypoints that only delegate to it transitively.
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

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  SwaggerModule.setup('docs', app, buildOpenApiDocument(app));
}

/**
 * Shared with scripts/generate-openapi.ts, which writes this same document
 * to openapi.json for packages/api-client's build-time type generation — a
 * live /docs route alone isn't enough for that step.
 */
export function buildOpenApiDocument(app: INestApplication) {
  return SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('PRDF LMS API')
      .setDescription('Loan origination and servicing API')
      .setVersion('1.0')
      .addBearerAuth()
      .build(),
  );
}
