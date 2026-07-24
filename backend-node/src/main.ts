import 'reflect-metadata';
import { createApp } from './create-app';

async function bootstrap() {
  const app = await createApp();
  const port = parseInt(process.env.PORT ?? '3000', 10);
  await app.listen(port);
  console.log(`API listening on port ${port}`);
}

bootstrap();
