import 'reflect-metadata';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { buildOpenApiDocument } from '../src/create-app';

/**
 * Boots the Nest app in-process (never listens, never queries Postgres —
 * DatabaseService's Pool is constructed lazily and only connects on first
 * query) purely to let SwaggerModule introspect the compiled module graph,
 * then writes the resulting spec to openapi.json. Run with the same
 * dummy-env-var pattern used for local boot verification elsewhere in this
 * repo — real credentials are never needed here.
 */
async function main() {
  const app = await NestFactory.create(AppModule, { logger: false });
  const document = buildOpenApiDocument(app);
  const outPath = join(__dirname, '..', 'openapi.json');
  writeFileSync(outPath, JSON.stringify(document, null, 2));
  console.log(`Wrote ${outPath}`);
  await app.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
