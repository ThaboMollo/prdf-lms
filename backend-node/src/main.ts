import 'reflect-metadata';
import * as Sentry from '@sentry/node';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './create-app';

// Safe no-op when SENTRY_DSN is unset — the SDK disables reporting rather
// than throwing, so this can run unconditionally before a real DSN exists.
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.VERCEL_ENV ?? 'development',
});

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  const port = parseInt(process.env.PORT ?? '3000', 10);
  await app.listen(port);
  console.log(`API listening on port ${port}`);
}

bootstrap();
