import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './create-app';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  const port = parseInt(process.env.PORT ?? '3000', 10);
  await app.listen(port);
  console.log(`API listening on port ${port}`);
}

bootstrap();
