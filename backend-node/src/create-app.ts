import { ForbiddenException, INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AllExceptionsFilter } from './common/exception.filter';
import { TenantRegistryService } from './tenancy/tenant-registry.service';
import { validationExceptionFactory } from './common/validation-errors';

/**
 * Shared CORS/exception-filter/validation/OpenAPI config for the app
 * instance. The NestFactory.create() call itself stays inline in main.ts
 * (not here) — Vercel's zero-config NestJS build statically scans the
 * entrypoint file for a direct `@nestjs/core` import/NestFactory.create()
 * call, and rejects entrypoints that only delegate to it transitively.
 */
export function configureApp(app: INestApplication): void {
  // Authenticated API responses are user-specific and change frequently.
  // Express ETags were producing 304 responses for these JSON endpoints;
  // after a Safari tab reload/crash the cached body may be unavailable, which
  // leaves the frontend trying to parse an empty response. Never cache them.
  app.getHttpAdapter().getInstance().disable('etag');
  app.use((req: { headers: Record<string, unknown> }, res: { setHeader: (name: string, value: string) => void }, next: () => void) => {
    if (req.headers.authorization) {
      res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    }
    next();
  });

  const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:5173,http://localhost:5174')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  // Each tenant's own frontend domains are allowed automatically, on top of
  // ALLOWED_ORIGINS. With one API serving many tenants, a single global list
  // would have to be edited on every onboarding — and forgetting is a silent
  // CORS failure in that tenant's browser only, which is miserable to
  // diagnose. The registry already knows every tenant's domains, so it is the
  // right source. (Found by the step-5 isolation suite, which could not reach
  // a tenant's own origin.)
  // Looked up per request, not captured at bootstrap: configureApp runs before
  // app.listen(), and the registry populates in onModuleInit — which
  // NestFactory.create() has not reached yet. Capturing the domains here gave
  // an always-empty set and rejected every tenant's own origin.
  const registry = app.get(TenantRegistryService, { strict: false });

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin) || origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) {
        callback(null, true);
        return;
      }
      let hostname: string | null = null;
      try {
        hostname = new URL(origin).hostname.toLowerCase();
      } catch {
        hostname = null;
      }
      if (hostname && registry.findByDomain(hostname)) {
        callback(null, true);
        return;
      }
      // ForbiddenException, not a bare Error: a rejected origin is a client
      // error, not a server fault. A plain Error fell through to the 500
      // branch of AllExceptionsFilter — which also reports to Sentry, so every
      // stray origin would have raised an alert.
      callback(new ForbiddenException(`Origin not allowed: ${origin}`));
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
      // Preserves which FIELD failed (docs/validation-spec.md §A1). The default
      // factory flattens class-validator's per-property errors into English
      // sentences, so the frontend could only ever show a banner — even though
      // the backend knew exactly which input was wrong.
      exceptionFactory: validationExceptionFactory,
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
