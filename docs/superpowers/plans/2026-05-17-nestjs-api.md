# NestJS API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a NestJS API in `backend-node/` that mirrors the existing ASP.NET Core API at `backend/`, connecting to the same Supabase PostgreSQL database and using the same JWT auth.

**Architecture:** NestJS 10 with `pg` (node-postgres) for raw SQL — no ORM, matching the Dapper approach in .NET. Auth via Supabase Admin `getUser()` call per request. One NestJS module per domain controller.

**Tech Stack:** Node 22, NestJS 10, TypeScript, `pg` (postgres pool), `@supabase/supabase-js` (admin client for JWT validation), `@nestjs/schedule` (cron job), `axios` for Supabase Storage HTTP calls.

**Working directory for all tasks:** `/Users/thabomollomponya/Dev/prdf/prdf-lms/backend-node`

**DO NOT delete or modify anything in `/Users/thabomollomponya/Dev/prdf/prdf-lms/backend/`**

---

## File Structure

```
backend-node/
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── database/
│   │   ├── database.module.ts
│   │   └── database.service.ts
│   ├── auth/
│   │   ├── auth.module.ts
│   │   ├── supabase-auth.guard.ts
│   │   ├── current-user.decorator.ts
│   │   └── roles.helper.ts
│   ├── common/
│   │   └── exception.filter.ts
│   ├── health/
│   │   └── health.controller.ts
│   ├── me/
│   │   └── me.controller.ts
│   ├── admin/
│   │   ├── admin.module.ts
│   │   ├── admin.controller.ts
│   │   └── admin.service.ts
│   ├── clients/
│   │   ├── clients.module.ts
│   │   ├── clients.controller.ts
│   │   └── clients.service.ts
│   ├── applications/
│   │   ├── applications.module.ts
│   │   ├── applications.controller.ts
│   │   └── applications.service.ts
│   ├── loans/
│   │   ├── loans.module.ts
│   │   ├── loans.controller.ts
│   │   └── loans.service.ts
│   ├── tasks/
│   │   ├── tasks.module.ts
│   │   ├── tasks.controller.ts
│   │   └── tasks.service.ts
│   ├── documents/
│   │   ├── documents.module.ts
│   │   ├── documents.controller.ts
│   │   └── documents.service.ts
│   ├── notifications/
│   │   ├── notifications.module.ts
│   │   ├── notifications.controller.ts
│   │   └── notifications.service.ts
│   ├── reports/
│   │   ├── reports.module.ts
│   │   ├── reports.controller.ts
│   │   └── reports.service.ts
│   └── jobs/
│       └── notification-sweep.job.ts
├── package.json
├── tsconfig.json
├── .env.example
├── Dockerfile
└── railway.toml
```

---

### Task 1: Scaffold NestJS project with config, package.json, tsconfig, and Railway deployment

**Files:**
- Create: `backend-node/package.json`
- Create: `backend-node/tsconfig.json`
- Create: `backend-node/.env.example`
- Create: `backend-node/railway.toml`
- Create: `backend-node/Dockerfile`
- Create: `backend-node/src/main.ts`
- Create: `backend-node/src/app.module.ts`
- Create: `backend-node/src/common/exception.filter.ts`

- [ ] **Step 1: Create `backend-node/package.json`**

```json
{
  "name": "prdf-lms-api-node",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "start": "node dist/main.js",
    "start:dev": "ts-node -r tsconfig-paths/register src/main.ts",
    "lint": "eslint \"{src,apps,libs,test}/**/*.ts\""
  },
  "dependencies": {
    "@nestjs/common": "^10.4.15",
    "@nestjs/core": "^10.4.15",
    "@nestjs/platform-express": "^10.4.15",
    "@nestjs/config": "^3.3.0",
    "@nestjs/schedule": "^4.1.2",
    "@supabase/supabase-js": "^2.47.10",
    "pg": "^8.13.1",
    "axios": "^1.7.9",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.1",
    "cron": "^3.1.7"
  },
  "devDependencies": {
    "@types/node": "^22.10.7",
    "@types/pg": "^8.11.10",
    "@types/express": "^5.0.0",
    "typescript": "^5.7.3",
    "ts-node": "^10.9.2",
    "tsconfig-paths": "^4.2.0"
  }
}
```

- [ ] **Step 2: Create `backend-node/tsconfig.json`**

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "declaration": true,
    "removeComments": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "allowSyntheticDefaultImports": true,
    "target": "ES2022",
    "sourceMap": true,
    "outDir": "./dist",
    "baseUrl": "./",
    "incremental": true,
    "skipLibCheck": true,
    "strictNullChecks": true,
    "noImplicitAny": true,
    "strictBindCallApply": false,
    "forceConsistentCasingInFileNames": false,
    "noFallthroughCasesInSwitch": false
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Create `backend-node/.env.example`**

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_JWT_AUDIENCE=authenticated
SUPABASE_DB_CONNECTION_STRING=postgresql://postgres:password@db.your-project.supabase.co:5432/postgres
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:5174
PORT=3000
```

- [ ] **Step 4: Create `backend-node/railway.toml`**

```toml
[build]
builder = "dockerfile"
dockerfilePath = "Dockerfile"

[deploy]
healthcheckPath = "/health"
healthcheckTimeout = 30
restartPolicyType = "on_failure"
```

- [ ] **Step 5: Create `backend-node/Dockerfile`**

```dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/main.js"]
```

- [ ] **Step 6: Create `backend-node/src/common/exception.filter.ts`**

```typescript
import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      message = typeof res === 'string' ? res : (res as any).message ?? message;
    } else if (exception instanceof Error) {
      const msg = exception.message.toLowerCase();
      if (msg.includes('unauthorized') || msg.includes('cannot access') || msg.includes('only admin') || msg.includes('only staff') || msg.includes('only internal') || msg.includes('only loanofficer')) {
        status = HttpStatus.FORBIDDEN;
        message = exception.message;
      } else if (msg.includes('not found') || msg.includes('does not exist')) {
        status = HttpStatus.NOT_FOUND;
        message = exception.message;
      } else if (msg.includes('invalid') || msg.includes('required') || msg.includes('cannot') || msg.includes('already') || msg.includes('transition')) {
        status = HttpStatus.BAD_REQUEST;
        message = exception.message;
      } else {
        this.logger.error(exception.message, exception.stack);
      }
    }

    response.status(status).json({ statusCode: status, message, path: request.url });
  }
}
```

- [ ] **Step 7: Create `backend-node/src/app.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { HealthController } from './health/health.controller';
import { MeController } from './me/me.controller';
import { AdminModule } from './admin/admin.module';
import { ClientsModule } from './clients/clients.module';
import { ApplicationsModule } from './applications/applications.module';
import { LoansModule } from './loans/loans.module';
import { TasksModule } from './tasks/tasks.module';
import { DocumentsModule } from './documents/documents.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ReportsModule } from './reports/reports.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    AuthModule,
    AdminModule,
    ClientsModule,
    ApplicationsModule,
    LoansModule,
    TasksModule,
    DocumentsModule,
    NotificationsModule,
    ReportsModule,
  ],
  controllers: [HealthController, MeController],
})
export class AppModule {}
```

- [ ] **Step 8: Create `backend-node/src/main.ts`**

```typescript
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/exception.filter';

async function bootstrap() {
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

  const port = parseInt(process.env.PORT ?? '3000', 10);
  await app.listen(port);
  console.log(`API listening on port ${port}`);
}

bootstrap();
```

- [ ] **Step 9: Install dependencies**

```bash
cd /Users/thabomollomponya/Dev/prdf/prdf-lms/backend-node
npm install
```

Expected: Packages installed, no errors.

- [ ] **Step 10: Verify TypeScript compiles**

```bash
cd /Users/thabomollomponya/Dev/prdf/prdf-lms/backend-node
npm run build
```

Expected: `dist/` directory created, no TypeScript errors.

- [ ] **Step 11: Commit**

```bash
git add backend-node/
git commit -m "feat(backend-node): scaffold NestJS project with config and Railway deployment"
```

---

### Task 2: Database module and Auth module

**Files:**
- Create: `backend-node/src/database/database.module.ts`
- Create: `backend-node/src/database/database.service.ts`
- Create: `backend-node/src/auth/auth.module.ts`
- Create: `backend-node/src/auth/supabase-auth.guard.ts`
- Create: `backend-node/src/auth/current-user.decorator.ts`
- Create: `backend-node/src/auth/roles.helper.ts`

- [ ] **Step 1: Create `backend-node/src/database/database.module.ts`**

```typescript
import { Module, Global } from '@nestjs/common';
import { DatabaseService } from './database.service';

@Global()
@Module({
  providers: [DatabaseService],
  exports: [DatabaseService],
})
export class DatabaseModule {}
```

- [ ] **Step 2: Create `backend-node/src/database/database.service.ts`**

```typescript
import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import { Pool, PoolClient, QueryResult } from 'pg';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private pool!: Pool;

  onModuleInit() {
    const connStr = process.env.SUPABASE_DB_CONNECTION_STRING;
    if (!connStr) throw new Error('SUPABASE_DB_CONNECTION_STRING is required');

    this.pool = new Pool({
      connectionString: connStr,
      ssl: { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30000,
    });

    this.pool.on('error', (err) => this.logger.error('Unexpected pool error', err));
  }

  async onModuleDestroy() {
    await this.pool.end();
  }

  async query<T = any>(sql: string, params?: any[]): Promise<T[]> {
    const result: QueryResult<T> = await this.pool.query(sql, params);
    return result.rows;
  }

  async queryOne<T = any>(sql: string, params?: any[]): Promise<T | null> {
    const rows = await this.query<T>(sql, params);
    return rows[0] ?? null;
  }

  async execute(sql: string, params?: any[]): Promise<number> {
    const result = await this.pool.query(sql, params);
    return result.rowCount ?? 0;
  }

  async withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}
```

- [ ] **Step 3: Create `backend-node/src/auth/roles.helper.ts`**

```typescript
export const STAFF_ROLES = ['Admin', 'LoanOfficer'] as const;
export const ASSIGNED_ROLES = ['Intern', 'Originator'] as const;
export const INTERNAL_ROLES = ['Admin', 'LoanOfficer', 'Intern', 'Originator'] as const;

export interface CurrentUser {
  userId: string;
  email: string;
  fullName: string | null;
  roles: string[];
}

export function hasRole(roles: string[], role: string): boolean {
  return roles.some((r) => r.toLowerCase() === role.toLowerCase());
}

export function hasAnyRole(roles: string[], ...expected: string[]): boolean {
  return expected.some((role) => hasRole(roles, role));
}

export function isStaff(roles: string[]): boolean {
  return hasAnyRole(roles, ...STAFF_ROLES);
}

export function isAssigned(roles: string[]): boolean {
  return hasAnyRole(roles, ...ASSIGNED_ROLES);
}

export function isInternal(roles: string[]): boolean {
  return hasAnyRole(roles, ...INTERNAL_ROLES);
}

export function isClient(roles: string[]): boolean {
  return hasRole(roles, 'Client');
}

export function ensureStaff(roles: string[]): void {
  if (!isStaff(roles)) throw new Error('Only Admin or LoanOfficer can perform this action.');
}

export function ensureInternal(roles: string[]): void {
  if (!isInternal(roles)) throw new Error('Only internal users can perform this action.');
}

export function ensureAdmin(roles: string[]): void {
  if (!hasRole(roles, 'Admin')) throw new Error('Only Admin users can manage admin access.');
}
```

- [ ] **Step 4: Create `backend-node/src/auth/current-user.decorator.ts`**

```typescript
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { CurrentUser } from './roles.helper';

export const GetCurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CurrentUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.user as CurrentUser;
  },
);
```

- [ ] **Step 5: Create `backend-node/src/auth/supabase-auth.guard.ts`**

```typescript
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { DatabaseService } from '../database/database.service';
import { CurrentUser } from './roles.helper';

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  private readonly logger = new Logger(SupabaseAuthGuard.name);
  private supabaseAdmin: SupabaseClient;

  constructor(private readonly db: DatabaseService) {
    const url = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
    this.supabaseAdmin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader: string | undefined = request.headers['authorization'];
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing Bearer token');
    }

    const token = authHeader.slice(7);

    const { data, error } = await this.supabaseAdmin.auth.getUser(token);
    if (error || !data.user) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    const supabaseUser = data.user;
    const userId = supabaseUser.id;

    const roleRows = await this.db.query<{ name: string }>(
      `select r.name from public.user_roles ur join public.roles r on r.id = ur.role_id where ur.user_id = $1`,
      [userId],
    );
    const roles = [...new Set(roleRows.map((r) => r.name))];

    const profileRow = await this.db.queryOne<{ full_name: string | null }>(
      `select full_name from public.profiles where user_id = $1`,
      [userId],
    );

    const currentUser: CurrentUser = {
      userId,
      email: supabaseUser.email ?? '',
      fullName: profileRow?.full_name ?? null,
      roles,
    };

    request.user = currentUser;
    return true;
  }
}
```

- [ ] **Step 6: Create `backend-node/src/auth/auth.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { SupabaseAuthGuard } from './supabase-auth.guard';

@Module({
  providers: [SupabaseAuthGuard],
  exports: [SupabaseAuthGuard],
})
export class AuthModule {}
```

- [ ] **Step 7: Build to verify no TypeScript errors**

```bash
cd /Users/thabomollomponya/Dev/prdf/prdf-lms/backend-node
npm run build
```

Expected: Compiles without errors.

- [ ] **Step 8: Commit**

```bash
git add backend-node/
git commit -m "feat(backend-node): add database service and Supabase auth guard"
```

---

### Task 3: Health, Me, Admin, and Clients endpoints

**Files:**
- Create: `backend-node/src/health/health.controller.ts`
- Create: `backend-node/src/me/me.controller.ts`
- Create: `backend-node/src/admin/admin.module.ts`
- Create: `backend-node/src/admin/admin.controller.ts`
- Create: `backend-node/src/admin/admin.service.ts`
- Create: `backend-node/src/clients/clients.module.ts`
- Create: `backend-node/src/clients/clients.controller.ts`
- Create: `backend-node/src/clients/clients.service.ts`

- [ ] **Step 1: Create `backend-node/src/health/health.controller.ts`**

```typescript
import { Controller, Get } from '@nestjs/common';

@Controller()
export class HealthController {
  @Get('health')
  health() {
    return { status: 'ok', service: 'PRDF.Lms.Api.Node' };
  }
}
```

- [ ] **Step 2: Create `backend-node/src/me/me.controller.ts`**

```typescript
import { Controller, Get, UseGuards } from '@nestjs/common';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { GetCurrentUser } from '../auth/current-user.decorator';
import { CurrentUser } from '../auth/roles.helper';

@Controller('me')
@UseGuards(SupabaseAuthGuard)
export class MeController {
  @Get()
  me(@GetCurrentUser() user: CurrentUser) {
    return {
      userId: user.userId,
      email: user.email,
      fullName: user.fullName,
      roles: user.roles,
    };
  }
}
```

- [ ] **Step 3: Create `backend-node/src/admin/admin.service.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CurrentUser, ensureAdmin } from '../auth/roles.helper';
import { PoolClient } from 'pg';

@Injectable()
export class AdminService {
  constructor(private readonly db: DatabaseService) {}

  async listUserAccess(actor: CurrentUser, query: { filter?: string; role?: string; search?: string }) {
    ensureAdmin(actor.roles);

    const search = query.search?.trim() || null;
    const roleFilter = query.role?.trim() || null;

    const rows = await this.db.query<{
      userid: string; fullname: string | null; email: string | null; roles: string[];
    }>(
      `select u.id as userid,
              p.full_name as fullname,
              u.email as email,
              coalesce(array_agg(distinct r.name) filter (where r.name is not null), '{}'::text[]) as roles
       from auth.users u
       left join public.profiles p on p.user_id = u.id
       left join public.user_roles ur on ur.user_id = u.id
       left join public.roles r on r.id = ur.role_id
       group by u.id, p.full_name, u.email
       having bool_or(r.name in ('Admin', 'LoanOfficer', 'Originator', 'Intern'))
          and ($1::text is null or coalesce(p.full_name,'') ilike '%' || $1 || '%' or coalesce(u.email,'') ilike '%' || $1 || '%')
          and ($2::text is null or bool_or(r.name = $2))
       order by coalesce(p.full_name, u.email, u.id::text)`,
      [search, roleFilter],
    );

    const normalizedFilter = (query.filter ?? 'all').toLowerCase();
    const adminCount = rows.filter((r) => r.roles.includes('Admin')).length;

    return rows
      .filter((row) => {
        if (normalizedFilter === 'admins') return row.roles.includes('Admin');
        if (normalizedFilter === 'non-admins') return !row.roles.includes('Admin');
        return true;
      })
      .map((row) => {
        const isAdmin = row.roles.includes('Admin');
        const isInternal = row.roles.some((r) => ['Admin', 'LoanOfficer', 'Originator', 'Intern'].includes(r));
        const isSelf = row.userid === actor.userId;
        const isLastAdmin = isAdmin && adminCount <= 1;

        return {
          userId: row.userid,
          fullName: row.fullname,
          email: row.email,
          roles: row.roles,
          isAdmin,
          isInternal,
          canGrant: !isAdmin && isInternal,
          canRevoke: isAdmin && !isSelf && !isLastAdmin,
          grantDisabledReason: isAdmin ? 'User already has Admin access.' : (!isInternal ? 'Only internal users are eligible.' : null),
          revokeDisabledReason: !isAdmin ? 'User does not currently have Admin access.' : (isSelf ? 'You cannot revoke your own Admin access.' : (isLastAdmin ? 'This is the last remaining admin.' : null)),
        };
      });
  }

  async grantAdmin(actor: CurrentUser, targetUserId: string) {
    ensureAdmin(actor.roles);

    return this.db.withTransaction(async (client: PoolClient) => {
      const target = await client.query(
        `select u.id, p.full_name, u.email, coalesce(array_agg(distinct r.name) filter (where r.name is not null), '{}'::text[]) as roles
         from auth.users u left join public.profiles p on p.user_id = u.id
         left join public.user_roles ur on ur.user_id = u.id left join public.roles r on r.id = ur.role_id
         where u.id = $1 group by u.id, p.full_name, u.email`,
        [targetUserId],
      );
      if (!target.rows[0]) throw new Error(`Target user was not found.`);
      const targetRoles: string[] = target.rows[0].roles;
      const isInternal = targetRoles.some((r: string) => ['Admin', 'LoanOfficer', 'Originator', 'Intern'].includes(r));
      if (!isInternal) throw new Error('Only existing internal users can be granted Admin access.');

      const roleRow = await client.query(`select id from public.roles where name = 'Admin' limit 1`);
      if (!roleRow.rows[0]) throw new Error('Admin role does not exist.');
      const adminRoleId = roleRow.rows[0].id;

      await client.query(
        `insert into public.user_roles (user_id, role_id) values ($1, $2) on conflict (user_id, role_id) do nothing`,
        [targetUserId, adminRoleId],
      );

      const afterRolesResult = await client.query(
        `select r.name from public.user_roles ur join public.roles r on r.id = ur.role_id where ur.user_id = $1`,
        [targetUserId],
      );
      const afterRoles = afterRolesResult.rows.map((r: any) => r.name);

      await client.query(
        `insert into public.audit_log (entity, entity_id, action, actor_user_id, metadata) values ('UserAccess', $1, 'AdminGranted', $2, $3::jsonb)`,
        [targetUserId, actor.userId, JSON.stringify({ targetEmail: target.rows[0].email, priorRoles: targetRoles, resultingRoles: afterRoles })],
      );

      return { userId: targetUserId, roles: afterRoles, isAdmin: afterRoles.includes('Admin') };
    });
  }

  async revokeAdmin(actor: CurrentUser, targetUserId: string) {
    ensureAdmin(actor.roles);
    if (actor.userId === targetUserId) throw new Error('Admins cannot revoke their own Admin access from this screen.');

    return this.db.withTransaction(async (client: PoolClient) => {
      const target = await client.query(
        `select u.id, p.full_name, u.email, coalesce(array_agg(distinct r.name) filter (where r.name is not null), '{}'::text[]) as roles
         from auth.users u left join public.profiles p on p.user_id = u.id
         left join public.user_roles ur on ur.user_id = u.id left join public.roles r on r.id = ur.role_id
         where u.id = $1 group by u.id, p.full_name, u.email`,
        [targetUserId],
      );
      if (!target.rows[0]) throw new Error(`Target user was not found.`);
      const targetRoles: string[] = target.rows[0].roles;
      if (!targetRoles.includes('Admin')) return { userId: targetUserId, roles: targetRoles, isAdmin: false };

      const adminCountResult = await client.query(
        `select cast(count(distinct ur.user_id) as int) as cnt from public.user_roles ur join public.roles r on r.id = ur.role_id where r.name = 'Admin'`,
      );
      if ((adminCountResult.rows[0].cnt as number) <= 1) throw new Error('Cannot revoke Admin access from the last remaining admin.');

      const roleRow = await client.query(`select id from public.roles where name = 'Admin' limit 1`);
      const adminRoleId = roleRow.rows[0].id;

      await client.query(`delete from public.user_roles where user_id = $1 and role_id = $2`, [targetUserId, adminRoleId]);

      const afterRolesResult = await client.query(
        `select r.name from public.user_roles ur join public.roles r on r.id = ur.role_id where ur.user_id = $1`,
        [targetUserId],
      );
      const afterRoles = afterRolesResult.rows.map((r: any) => r.name);

      await client.query(
        `insert into public.audit_log (entity, entity_id, action, actor_user_id, metadata) values ('UserAccess', $1, 'AdminRevoked', $2, $3::jsonb)`,
        [targetUserId, actor.userId, JSON.stringify({ targetEmail: target.rows[0].email, priorRoles: targetRoles, resultingRoles: afterRoles })],
      );

      return { userId: targetUserId, roles: afterRoles, isAdmin: false };
    });
  }
}
```

- [ ] **Step 4: Create `backend-node/src/admin/admin.controller.ts`**

```typescript
import { Controller, Get, Post, Delete, Param, Query, UseGuards } from '@nestjs/common';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { GetCurrentUser } from '../auth/current-user.decorator';
import { CurrentUser } from '../auth/roles.helper';
import { AdminService } from './admin.service';

@Controller('api/admin/users')
@UseGuards(SupabaseAuthGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('access')
  listAccess(
    @GetCurrentUser() user: CurrentUser,
    @Query('filter') filter?: string,
    @Query('role') role?: string,
    @Query('search') search?: string,
  ) {
    return this.adminService.listUserAccess(user, { filter, role, search });
  }

  @Post(':userId/roles/admin')
  grantAdmin(@GetCurrentUser() user: CurrentUser, @Param('userId') userId: string) {
    return this.adminService.grantAdmin(user, userId);
  }

  @Delete(':userId/roles/admin')
  revokeAdmin(@GetCurrentUser() user: CurrentUser, @Param('userId') userId: string) {
    return this.adminService.revokeAdmin(user, userId);
  }
}
```

- [ ] **Step 5: Create `backend-node/src/admin/admin.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
```

- [ ] **Step 6: Create `backend-node/src/clients/clients.service.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CurrentUser, ensureInternal } from '../auth/roles.helper';
import axios from 'axios';
import { randomUUID } from 'crypto';

@Injectable()
export class ClientsService {
  constructor(private readonly db: DatabaseService) {}

  async createAssistedClient(actor: CurrentUser, body: {
    businessName: string; registrationNo?: string; address?: string;
    applicantEmail?: string; applicantFullName?: string; sendInvite?: boolean; redirectTo?: string;
  }) {
    ensureInternal(actor.roles);
    const clientId = randomUUID();
    let invitedUserId: string | null = null;

    if (body.sendInvite && body.applicantEmail) {
      invitedUserId = await this.inviteUser(body.applicantEmail, body.applicantFullName, body.redirectTo);
      if (invitedUserId) {
        await this.prepareUserProfile(invitedUserId, body.applicantEmail, body.applicantFullName);
      }
    }

    await this.db.execute(
      `insert into public.clients (id, user_id, business_name, registration_no, address, created_at)
       values ($1, $2, $3, $4, $5, now())`,
      [clientId, invitedUserId, body.businessName, body.registrationNo ?? null, body.address ?? null],
    );

    await this.db.execute(
      `insert into public.audit_log (id, entity, entity_id, action, actor_user_id, at, metadata) values ($1, 'clients', $2, 'CreateAssistedClient', $3, now(), $4::jsonb)`,
      [randomUUID(), clientId, actor.userId, JSON.stringify({ businessName: body.businessName, applicantEmail: body.applicantEmail, sendInvite: body.sendInvite })],
    );

    return this.db.queryOne(
      `select id, user_id as "userId", business_name as "businessName", registration_no as "registrationNo", address, created_at as "createdAt" from public.clients where id = $1`,
      [clientId],
    );
  }

  async sendInvite(actor: CurrentUser, clientId: string, body: { applicantEmail: string; applicantFullName?: string; redirectTo?: string }) {
    ensureInternal(actor.roles);

    const client = await this.db.queryOne(`select id from public.clients where id = $1`, [clientId]);
    if (!client) return null;

    const { userId, actionLink } = await this.inviteUserWithLink(body.applicantEmail, body.applicantFullName, body.redirectTo);
    if (userId) {
      await this.db.execute(`update public.clients set user_id = $1 where id = $2`, [userId, clientId]);
      await this.prepareUserProfile(userId, body.applicantEmail, body.applicantFullName);
    }

    await this.db.execute(
      `insert into public.audit_log (id, entity, entity_id, action, actor_user_id, at, metadata) values ($1, 'clients', $2, 'SendClientInvite', $3, now(), $4::jsonb)`,
      [randomUUID(), clientId, actor.userId, JSON.stringify({ applicantEmail: body.applicantEmail, redirectTo: body.redirectTo })],
    );

    return { userId, email: body.applicantEmail, status: 'InviteLinkGenerated', actionLink };
  }

  private async prepareUserProfile(userId: string, email: string, fullName?: string) {
    const name = fullName?.trim() || email;
    await this.db.execute(
      `insert into public.profiles (user_id, full_name, phone, created_at) values ($1, $2, null, now()) on conflict (user_id) do update set full_name = excluded.full_name`,
      [userId, name],
    );
    await this.db.execute(
      `insert into public.user_roles (user_id, role_id) select $1, r.id from public.roles r where r.name = 'Client' on conflict (user_id, role_id) do nothing`,
      [userId],
    );
  }

  private async inviteUser(email: string, fullName?: string, redirectTo?: string): Promise<string | null> {
    const result = await this.inviteUserWithLink(email, fullName, redirectTo);
    return result.userId;
  }

  private async inviteUserWithLink(email: string, fullName?: string, redirectTo?: string): Promise<{ userId: string | null; actionLink: string | null }> {
    const url = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) throw new Error('Supabase URL/service role key must be configured for invite flow.');

    const payload: any = { type: 'invite', email, data: { full_name: fullName ?? null } };
    if (redirectTo) payload.redirect_to = redirectTo;

    const response = await axios.post(`${url.replace(/\/$/, '')}/auth/v1/admin/generate_link`, payload, {
      headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, 'Content-Type': 'application/json' },
    });

    const user = response.data?.user;
    const userId = user?.id ?? null;
    const actionLink = response.data?.action_link ?? null;
    return { userId, actionLink };
  }
}
```

- [ ] **Step 7: Create `backend-node/src/clients/clients.controller.ts`**

```typescript
import { Controller, Post, Param, Body, UseGuards } from '@nestjs/common';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { GetCurrentUser } from '../auth/current-user.decorator';
import { CurrentUser } from '../auth/roles.helper';
import { ClientsService } from './clients.service';

@Controller('api/clients')
@UseGuards(SupabaseAuthGuard)
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Post('assisted')
  createAssisted(@GetCurrentUser() user: CurrentUser, @Body() body: any) {
    return this.clientsService.createAssistedClient(user, body);
  }

  @Post(':id/invite')
  sendInvite(@GetCurrentUser() user: CurrentUser, @Param('id') id: string, @Body() body: any) {
    return this.clientsService.sendInvite(user, id, body);
  }
}
```

- [ ] **Step 8: Create `backend-node/src/clients/clients.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { ClientsController } from './clients.controller';
import { ClientsService } from './clients.service';
import { AuthModule } from '../auth/auth.module';

@Module({ imports: [AuthModule], controllers: [ClientsController], providers: [ClientsService] })
export class ClientsModule {}
```

- [ ] **Step 9: Build to verify**

```bash
cd /Users/thabomollomponya/Dev/prdf/prdf-lms/backend-node && npm run build
```

Expected: No TypeScript errors.

- [ ] **Step 10: Commit**

```bash
git add backend-node/
git commit -m "feat(backend-node): add health, me, admin, and clients endpoints"
```

---

### Task 4: Applications service (CRUD, submit, status, history, notes)

**Files:**
- Create: `backend-node/src/applications/applications.service.ts`
- Create: `backend-node/src/applications/applications.controller.ts`
- Create: `backend-node/src/applications/applications.module.ts`

- [ ] **Step 1: Create `backend-node/src/applications/applications.service.ts`**

This is the largest service. Implement it fully:

```typescript
import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CurrentUser, hasRole, hasAnyRole, isStaff, STAFF_ROLES, ASSIGNED_ROLES } from '../auth/roles.helper';
import { randomUUID } from 'crypto';
import { PoolClient } from 'pg';

const LOAN_STATUS_TRANSITIONS: Record<string, string[]> = {
  Draft: ['Submitted'],
  Submitted: ['UnderReview', 'InfoRequested', 'Approved', 'Rejected'],
  UnderReview: ['InfoRequested', 'Approved', 'Rejected'],
  InfoRequested: ['Submitted', 'UnderReview'],
  Approved: ['Disbursed'],
  Disbursed: ['InRepayment'],
  InRepayment: ['Closed'],
};

@Injectable()
export class ApplicationsService {
  constructor(private readonly db: DatabaseService) {}

  private async getRoles(userId: string): Promise<string[]> {
    const rows = await this.db.query<{ name: string }>(
      `select r.name from public.user_roles ur join public.roles r on r.id = ur.role_id where ur.user_id = $1`,
      [userId],
    );
    return [...new Set(rows.map((r) => r.name))];
  }

  private async getSecurityProjection(applicationId: string) {
    return this.db.queryOne<{ id: string; status: string; assigned_to_user_id: string | null; client_owner_user_id: string | null }>(
      `select la.id, la.status, la.assigned_to_user_id, c.user_id as client_owner_user_id
       from public.loan_applications la join public.clients c on c.id = la.client_id where la.id = $1`,
      [applicationId],
    );
  }

  private ensureCanAccess(roles: string[], userId: string, proj: { assigned_to_user_id: string | null; client_owner_user_id: string | null; status: string }) {
    if (isStaff(roles)) return;
    if (hasAnyRole(roles, ...ASSIGNED_ROLES) && proj.assigned_to_user_id === userId) return;
    if (hasRole(roles, 'Client') && proj.client_owner_user_id === userId) return;
    throw new Error('User cannot access this application.');
  }

  private ensureTransitionAllowed(roles: string[], fromStatus: string, toStatus: string) {
    if (fromStatus === toStatus) return;
    const allowed = LOAN_STATUS_TRANSITIONS[fromStatus] ?? [];
    if (!allowed.includes(toStatus)) throw new Error(`Invalid status transition: ${fromStatus} -> ${toStatus}.`);
    if (toStatus === 'Submitted') return;
    if (!isStaff(roles)) throw new Error('Only LoanOfficer/Admin can perform this status transition.');
  }

  private async getById(applicationId: string) {
    return this.db.queryOne(
      `select la.id, la.client_id as "clientId", la.requested_amount as "requestedAmount",
              la.term_months as "termMonths", la.purpose, la.status,
              la.created_at as "createdAt", la.submitted_at as "submittedAt",
              la.assigned_to_user_id as "assignedToUserId"
       from public.loan_applications la where la.id = $1`,
      [applicationId],
    );
  }

  private async insertStatusHistory(client: PoolClient | null, applicationId: string, fromStatus: string | null, toStatus: string, changedBy: string, note: string | null) {
    const sql = `insert into public.application_status_history (id, application_id, from_status, to_status, changed_by, changed_at, note) values ($1,$2,$3,$4,$5,now(),$6)`;
    const params = [randomUUID(), applicationId, fromStatus, toStatus, changedBy, note];
    if (client) await client.query(sql, params);
    else await this.db.execute(sql, params);
  }

  private async insertAuditLog(applicationId: string, action: string, actorUserId: string, metadata: object) {
    await this.db.execute(
      `insert into public.audit_log (id, entity, entity_id, action, actor_user_id, at, metadata) values ($1,'loan_applications',$2,$3,$4,now(),$5::jsonb)`,
      [randomUUID(), applicationId, action, actorUserId, JSON.stringify(metadata)],
    );
  }

  private async createStatusNotifications(applicationId: string, toStatus: string, actorUserId: string, note: string | null) {
    const proj = await this.db.queryOne<{ client_user_id: string | null; assigned_to_user_id: string | null }>(
      `select c.user_id as client_user_id, la.assigned_to_user_id from public.loan_applications la join public.clients c on c.id = la.client_id where la.id = $1`,
      [applicationId],
    );
    if (!proj) return;
    const targets = [proj.client_user_id, proj.assigned_to_user_id].filter((id): id is string => !!id && id !== actorUserId);
    const unique = [...new Set(targets)];
    for (const targetId of unique) {
      await this.db.execute(
        `insert into public.notifications (id, user_id, channel, type, title, message, status, payload, created_at, sent_at) values ($1,$2,'InApp','ApplicationStatusChanged','Application status updated',$3,'Sent',$4::jsonb,now(),now())`,
        [randomUUID(), targetId, `Application status changed to ${toStatus}.`, JSON.stringify({ applicationId, status: toStatus, note })],
      );
    }
  }

  private async ensureLoanCreatedForApproved(applicationId: string) {
    const exists = await this.db.queryOne<{ exists: boolean }>(
      `select exists (select 1 from public.loans where application_id = $1) as exists`,
      [applicationId],
    );
    if (exists?.exists) return;

    const source = await this.db.queryOne<{ requested_amount: number; term_months: number }>(
      `select requested_amount, term_months from public.loan_applications where id = $1`,
      [applicationId],
    );
    if (!source) return;

    await this.db.execute(
      `insert into public.loans (id, application_id, principal_amount, interest_rate, term_months, status, outstanding_principal, created_at) values ($1,$2,$3,0,$4,'PendingDisbursement',$3,now())`,
      [randomUUID(), applicationId, source.requested_amount, source.term_months],
    );
  }

  async create(actor: CurrentUser, body: {
    clientId?: string; requestedAmount: number; termMonths: number; purpose: string;
    businessName?: string; registrationNo?: string; address?: string; assignedToUserId?: string;
  }) {
    const roles = await this.getRoles(actor.userId);
    let clientId = body.clientId ?? null;
    let assignedTo = body.assignedToUserId ?? null;

    if (hasAnyRole(roles, ...ASSIGNED_ROLES)) {
      if (!assignedTo || assignedTo !== actor.userId) throw new Error('Intern/Originator can only create applications assigned to themselves.');
      if (!clientId) throw new Error('ClientId is required for intern/originator-created applications.');
    } else if (hasRole(roles, 'Client')) {
      if (clientId) {
        const owns = await this.db.queryOne<{ exists: boolean }>(
          `select exists (select 1 from public.clients where id = $1 and user_id = $2) as exists`,
          [clientId, actor.userId],
        );
        if (!owns?.exists) clientId = null;
      }
      if (!clientId) {
        const existing = await this.db.queryOne<{ id: string }>(`select id from public.clients where user_id = $1 order by created_at asc limit 1`, [actor.userId]);
        clientId = existing?.id ?? null;
      }
      if (!clientId && body.businessName) {
        clientId = randomUUID();
        await this.db.execute(
          `insert into public.clients (id, user_id, business_name, registration_no, address, created_at) values ($1,$2,$3,$4,$5,now())`,
          [clientId, actor.userId, body.businessName, body.registrationNo ?? null, body.address ?? null],
        );
      }
      if (!clientId) throw new Error('Could not resolve client profile. Provide business info.');
    } else if (isStaff(roles)) {
      if (!clientId) throw new Error('ClientId is required for staff-created applications.');
    } else {
      throw new Error('Role not allowed to create applications.');
    }

    const appId = randomUUID();
    await this.db.execute(
      `insert into public.loan_applications (id, client_id, requested_amount, term_months, purpose, status, assigned_to_user_id, created_at) values ($1,$2,$3,$4,$5,'Draft',$6,now())`,
      [appId, clientId, body.requestedAmount, body.termMonths, body.purpose, assignedTo],
    );
    await this.insertStatusHistory(null, appId, null, 'Draft', actor.userId, null);
    await this.insertAuditLog(appId, 'CreateDraftApplication', actor.userId, { clientId, requestedAmount: body.requestedAmount });
    return this.getById(appId);
  }

  async update(actor: CurrentUser, applicationId: string, body: { requestedAmount: number; termMonths: number; purpose: string; assignedToUserId?: string }) {
    const roles = await this.getRoles(actor.userId);
    const proj = await this.getSecurityProjection(applicationId);
    if (!proj) return null;
    this.ensureCanAccess(roles, actor.userId, proj);

    if (proj.status !== 'Draft') {
      if (!isStaff(roles)) throw new Error('Only staff can reassign non-draft applications.');
      await this.db.execute(`update public.loan_applications set assigned_to_user_id = $1 where id = $2`, [body.assignedToUserId ?? null, applicationId]);
      await this.insertAuditLog(applicationId, 'ReassignApplication', actor.userId, { assignedToUserId: body.assignedToUserId });
      return this.getById(applicationId);
    }

    await this.db.execute(
      `update public.loan_applications set requested_amount=$1, term_months=$2, purpose=$3, assigned_to_user_id=$4 where id=$5`,
      [body.requestedAmount, body.termMonths, body.purpose, body.assignedToUserId ?? null, applicationId],
    );
    await this.insertAuditLog(applicationId, 'UpdateDraftApplication', actor.userId, { requestedAmount: body.requestedAmount, termMonths: body.termMonths });
    return this.getById(applicationId);
  }

  async list(actor: CurrentUser) {
    const roles = await this.getRoles(actor.userId);
    let sql = `select la.id, la.client_id as "clientId", la.requested_amount as "requestedAmount", la.term_months as "termMonths", la.purpose, la.status, la.created_at as "createdAt", la.submitted_at as "submittedAt", la.assigned_to_user_id as "assignedToUserId" from public.loan_applications la join public.clients c on c.id = la.client_id`;
    let params: any[] = [];

    if (isStaff(roles)) {
      sql += ` order by la.created_at desc`;
    } else if (hasAnyRole(roles, ...ASSIGNED_ROLES)) {
      sql += ` where la.assigned_to_user_id = $1 order by la.created_at desc`;
      params = [actor.userId];
    } else if (hasRole(roles, 'Client')) {
      sql += ` where c.user_id = $1 order by la.created_at desc`;
      params = [actor.userId];
    } else {
      return [];
    }
    return this.db.query(sql, params);
  }

  async getOne(actor: CurrentUser, applicationId: string) {
    const roles = await this.getRoles(actor.userId);
    const proj = await this.getSecurityProjection(applicationId);
    if (!proj) return null;
    this.ensureCanAccess(roles, actor.userId, proj);
    return this.getById(applicationId);
  }

  async submit(actor: CurrentUser, applicationId: string, note: string | null) {
    const roles = await this.getRoles(actor.userId);
    const proj = await this.getSecurityProjection(applicationId);
    if (!proj) return null;
    this.ensureCanAccess(roles, actor.userId, proj);
    if (proj.status !== 'Draft') throw new Error('Only Draft applications can be submitted.');

    await this.db.execute(`update public.loan_applications set status='Submitted', submitted_at=now() where id=$1`, [applicationId]);
    await this.insertStatusHistory(null, applicationId, 'Draft', 'Submitted', actor.userId, note);
    await this.insertAuditLog(applicationId, 'SubmitApplication', actor.userId, { note });
    await this.createStatusNotifications(applicationId, 'Submitted', actor.userId, note);
    return this.getById(applicationId);
  }

  async changeStatus(actor: CurrentUser, applicationId: string, toStatus: string, note: string | null) {
    const roles = await this.getRoles(actor.userId);
    const proj = await this.getSecurityProjection(applicationId);
    if (!proj) return null;
    this.ensureCanAccess(roles, actor.userId, proj);
    this.ensureTransitionAllowed(roles, proj.status, toStatus);

    await this.db.execute(
      `update public.loan_applications set status=$1, submitted_at=case when $1='Submitted' and submitted_at is null then now() else submitted_at end where id=$2`,
      [toStatus, applicationId],
    );

    if (toStatus === 'InfoRequested') {
      await this.createInfoRequestedFollowUp(applicationId, note, actor.userId);
    }

    await this.insertStatusHistory(null, applicationId, proj.status, toStatus, actor.userId, note);
    await this.insertAuditLog(applicationId, 'ChangeApplicationStatus', actor.userId, { fromStatus: proj.status, toStatus, note });
    await this.createStatusNotifications(applicationId, toStatus, actor.userId, note);

    if (toStatus === 'Approved') {
      await this.ensureLoanCreatedForApproved(applicationId);
    }
    return this.getById(applicationId);
  }

  private async createInfoRequestedFollowUp(applicationId: string, note: string | null, actorUserId: string) {
    const proj = await this.db.queryOne<{ client_user_id: string | null }>(
      `select c.user_id as client_user_id from public.loan_applications la join public.clients c on c.id = la.client_id where la.id = $1`,
      [applicationId],
    );
    const taskTitle = note ? `Info requested from applicant: ${note}` : 'Info requested from applicant';
    await this.db.execute(
      `insert into public.tasks (id, application_id, title, status, assigned_to, due_date) values ($1,$2,$3,'Open',$4,current_date + 7)`,
      [randomUUID(), applicationId, taskTitle, proj?.client_user_id ?? null],
    );
    const noteBody = note ? `Additional information has been requested. Please review tasks and provide requested documents/details. Note: ${note}` : 'Additional information has been requested. Please review tasks and provide requested documents/details.';
    await this.db.execute(
      `insert into public.notes (id, application_id, body, created_by, created_at) values ($1,$2,$3,$4,now())`,
      [randomUUID(), applicationId, noteBody, actorUserId],
    );
  }

  async getHistory(actor: CurrentUser, applicationId: string) {
    const roles = await this.getRoles(actor.userId);
    const proj = await this.getSecurityProjection(applicationId);
    if (!proj) return [];
    this.ensureCanAccess(roles, actor.userId, proj);
    return this.db.query(
      `select id, application_id as "applicationId", from_status as "fromStatus", to_status as "toStatus", changed_by as "changedBy", changed_at as "changedAt", note from public.application_status_history where application_id=$1 order by changed_at asc`,
      [applicationId],
    );
  }

  async listNotes(actor: CurrentUser, applicationId: string) {
    const roles = await this.getRoles(actor.userId);
    const proj = await this.getSecurityProjection(applicationId);
    if (!proj) return [];
    this.ensureCanAccess(roles, actor.userId, proj);
    return this.db.query(
      `select id, application_id as "applicationId", body, created_by as "createdBy", created_at as "createdAt" from public.notes where application_id=$1 order by created_at asc`,
      [applicationId],
    );
  }

  async createNote(actor: CurrentUser, applicationId: string, body: string) {
    const roles = await this.getRoles(actor.userId);
    const proj = await this.getSecurityProjection(applicationId);
    if (!proj) return null;
    this.ensureCanAccess(roles, actor.userId, proj);
    const noteId = randomUUID();
    await this.db.execute(
      `insert into public.notes (id, application_id, body, created_by, created_at) values ($1,$2,$3,$4,now())`,
      [noteId, applicationId, body, actor.userId],
    );
    await this.db.execute(
      `insert into public.audit_log (id, entity, entity_id, action, actor_user_id, at, metadata) values ($1,'notes',$2,'CreateNote',$3,now(),$4::jsonb)`,
      [randomUUID(), noteId, actor.userId, JSON.stringify({ applicationId })],
    );
    return this.db.queryOne(
      `select id, application_id as "applicationId", body, created_by as "createdBy", created_at as "createdAt" from public.notes where id=$1`,
      [noteId],
    );
  }
}
```

- [ ] **Step 2: Create `backend-node/src/applications/applications.controller.ts`**

```typescript
import { Controller, Get, Post, Put, Param, Body, UseGuards, HttpCode } from '@nestjs/common';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { GetCurrentUser } from '../auth/current-user.decorator';
import { CurrentUser } from '../auth/roles.helper';
import { ApplicationsService } from './applications.service';

@Controller('api/applications')
@UseGuards(SupabaseAuthGuard)
export class ApplicationsController {
  constructor(private readonly svc: ApplicationsService) {}

  @Post()
  @HttpCode(201)
  create(@GetCurrentUser() user: CurrentUser, @Body() body: any) {
    return this.svc.create(user, body);
  }

  @Put(':id')
  update(@GetCurrentUser() user: CurrentUser, @Param('id') id: string, @Body() body: any) {
    return this.svc.update(user, id, body);
  }

  @Get()
  list(@GetCurrentUser() user: CurrentUser) {
    return this.svc.list(user);
  }

  @Get(':id')
  getOne(@GetCurrentUser() user: CurrentUser, @Param('id') id: string) {
    return this.svc.getOne(user, id);
  }

  @Post(':id/submit')
  submit(@GetCurrentUser() user: CurrentUser, @Param('id') id: string, @Body() body: any) {
    return this.svc.submit(user, id, body?.note ?? null);
  }

  @Post(':id/status')
  changeStatus(@GetCurrentUser() user: CurrentUser, @Param('id') id: string, @Body() body: any) {
    return this.svc.changeStatus(user, id, body.toStatus, body.note ?? null);
  }

  @Get(':id/history')
  history(@GetCurrentUser() user: CurrentUser, @Param('id') id: string) {
    return this.svc.getHistory(user, id);
  }

  @Get(':id/notes')
  listNotes(@GetCurrentUser() user: CurrentUser, @Param('id') id: string) {
    return this.svc.listNotes(user, id);
  }

  @Post(':id/notes')
  createNote(@GetCurrentUser() user: CurrentUser, @Param('id') id: string, @Body() body: any) {
    return this.svc.createNote(user, id, body.body);
  }
}
```

- [ ] **Step 3: Create `backend-node/src/applications/applications.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { ApplicationsController } from './applications.controller';
import { ApplicationsService } from './applications.service';
import { AuthModule } from '../auth/auth.module';

@Module({ imports: [AuthModule], controllers: [ApplicationsController], providers: [ApplicationsService] })
export class ApplicationsModule {}
```

- [ ] **Step 4: Build to verify**

```bash
cd /Users/thabomollomponya/Dev/prdf/prdf-lms/backend-node && npm run build
```

- [ ] **Step 5: Commit**

```bash
git add backend-node/
git commit -m "feat(backend-node): add applications module with full CRUD, submit, status, history, notes"
```

---

### Task 5: Documents (presign, confirm, list, verify), Loans, Tasks, Document Requirements, Notifications, Reports, and Background Job

**Files:**
- Create: `backend-node/src/applications/documents.service.ts` (document methods added to applications service)
- Create: `backend-node/src/loans/loans.service.ts`
- Create: `backend-node/src/loans/loans.controller.ts`
- Create: `backend-node/src/loans/loans.module.ts`
- Create: `backend-node/src/tasks/tasks.service.ts`
- Create: `backend-node/src/tasks/tasks.controller.ts`
- Create: `backend-node/src/tasks/tasks.module.ts`
- Create: `backend-node/src/documents/documents.service.ts`
- Create: `backend-node/src/documents/documents.controller.ts`
- Create: `backend-node/src/documents/documents.module.ts`
- Create: `backend-node/src/notifications/notifications.service.ts`
- Create: `backend-node/src/notifications/notifications.controller.ts`
- Create: `backend-node/src/notifications/notifications.module.ts`
- Create: `backend-node/src/reports/reports.service.ts`
- Create: `backend-node/src/reports/reports.controller.ts`
- Create: `backend-node/src/reports/reports.module.ts`
- Create: `backend-node/src/jobs/notification-sweep.job.ts`
- Modify: `backend-node/src/applications/applications.controller.ts` (add document routes)
- Modify: `backend-node/src/applications/applications.service.ts` (add document methods)

- [ ] **Step 1: Add document methods to `backend-node/src/applications/applications.service.ts`**

Add these methods to the `ApplicationsService` class (do not replace existing code, only append):

```typescript
  async presignUpload(actor: CurrentUser, applicationId: string, body: { docType: string; fileName: string; contentType?: string }) {
    const roles = await this.getRoles(actor.userId);
    const proj = await this.getSecurityProjection(applicationId);
    if (!proj) return null;
    this.ensureCanAccess(roles, actor.userId, proj);

    const safeFileName = body.fileName.replace(/ /g, '-');
    const storagePath = `applications/${applicationId}/${randomUUID().replace(/-/g, '')}-${safeFileName}`;
    const uploadUrl = await this.createSignedUploadUrl('loan-documents', storagePath);
    return { bucket: 'loan-documents', storagePath, uploadUrl, expiresInSeconds: 7200 };
  }

  async confirmUpload(actor: CurrentUser, applicationId: string, body: { docType: string; storagePath: string; status?: string }) {
    const roles = await this.getRoles(actor.userId);
    const proj = await this.getSecurityProjection(applicationId);
    if (!proj) return null;
    this.ensureCanAccess(roles, actor.userId, proj);

    const docId = randomUUID();
    await this.db.execute(
      `insert into public.loan_documents (id, application_id, doc_type, storage_path, status, uploaded_by, uploaded_at) values ($1,$2,$3,$4,$5,$6,now())`,
      [docId, applicationId, body.docType, body.storagePath, body.status || 'Pending', actor.userId],
    );
    await this.db.execute(
      `insert into public.audit_log (id, entity, entity_id, action, actor_user_id, at, metadata) values ($1,'loan_documents',$2,'ConfirmDocumentUpload',$3,now(),$4::jsonb)`,
      [randomUUID(), docId, actor.userId, JSON.stringify({ docType: body.docType, storagePath: body.storagePath })],
    );
    return this.db.queryOne(
      `select id, application_id as "applicationId", doc_type as "docType", storage_path as "storagePath", status, uploaded_by as "uploadedBy", uploaded_at as "uploadedAt" from public.loan_documents where id=$1`,
      [docId],
    );
  }

  async listDocuments(actor: CurrentUser, applicationId: string) {
    const roles = await this.getRoles(actor.userId);
    const proj = await this.getSecurityProjection(applicationId);
    if (!proj) return [];
    this.ensureCanAccess(roles, actor.userId, proj);
    return this.db.query(
      `select id, application_id as "applicationId", doc_type as "docType", storage_path as "storagePath", status, uploaded_by as "uploadedBy", uploaded_at as "uploadedAt" from public.loan_documents where application_id=$1 order by uploaded_at desc`,
      [applicationId],
    );
  }

  private async createSignedUploadUrl(bucket: string, storagePath: string): Promise<string> {
    const url = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) throw new Error('Supabase URL/service role key must be configured for presigned uploads.');

    const encodedPath = storagePath.split('/').map(encodeURIComponent).join('/');
    const endpoint = `${url.replace(/\/$/, '')}/storage/v1/object/upload/sign/${bucket}/${encodedPath}`;

    const response = await axios.post(endpoint, {}, {
      headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, 'Content-Type': 'application/json' },
    });

    const token = response.data?.token;
    if (!token) throw new Error('Supabase response did not include signed upload token.');
    return `${endpoint}?token=${encodeURIComponent(token)}`;
  }
```

Also add `import axios from 'axios';` at the top of applications.service.ts if not already present.

- [ ] **Step 2: Add document routes to `backend-node/src/applications/applications.controller.ts`**

Add these routes to the existing `ApplicationsController` class:

```typescript
  @Post(':id/documents/presign-upload')
  presignUpload(@GetCurrentUser() user: CurrentUser, @Param('id') id: string, @Body() body: any) {
    return this.svc.presignUpload(user, id, body);
  }

  @Post(':id/documents/confirm')
  confirmUpload(@GetCurrentUser() user: CurrentUser, @Param('id') id: string, @Body() body: any) {
    return this.svc.confirmUpload(user, id, body);
  }

  @Get(':id/documents')
  listDocuments(@GetCurrentUser() user: CurrentUser, @Param('id') id: string) {
    return this.svc.listDocuments(user, id);
  }
```

- [ ] **Step 3: Create `backend-node/src/loans/loans.service.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CurrentUser, isStaff, hasAnyRole, hasRole, STAFF_ROLES, ASSIGNED_ROLES } from '../auth/roles.helper';
import { randomUUID } from 'crypto';
import { PoolClient } from 'pg';

@Injectable()
export class LoansService {
  constructor(private readonly db: DatabaseService) {}

  private async getRoles(userId: string): Promise<string[]> {
    const rows = await this.db.query<{ name: string }>(
      `select r.name from public.user_roles ur join public.roles r on r.id = ur.role_id where ur.user_id = $1`,
      [userId],
    );
    return [...new Set(rows.map((r) => r.name))];
  }

  private async getLoanDetails(loanId: string) {
    const loan = await this.db.queryOne(
      `select id, application_id as "applicationId", principal_amount as "principalAmount", outstanding_principal as "outstandingPrincipal", interest_rate as "interestRate", term_months as "termMonths", status, disbursed_at as "disbursedAt", created_at as "createdAt" from public.loans where id=$1`,
      [loanId],
    );
    if (!loan) return null;
    const schedule = await this.db.query(
      `select id, installment_no as "installmentNo", due_date as "dueDate", due_principal as "duePrincipal", due_interest as "dueInterest", due_total as "dueTotal", paid_amount as "paidAmount", status, paid_at as "paidAt" from public.repayment_schedule where loan_id=$1 order by installment_no asc`,
      [loanId],
    );
    const repayments = await this.db.query(
      `select id, amount, principal_component as "principalComponent", interest_component as "interestComponent", paid_at as "paidAt", payment_reference as "paymentReference" from public.repayments where loan_id=$1 order by paid_at desc`,
      [loanId],
    );
    return { ...loan, schedule, repayments };
  }

  async getById(actor: CurrentUser, loanId: string) {
    const roles = await this.getRoles(actor.userId);
    const proj = await this.db.queryOne<{ loan_id: string; client_owner_user_id: string | null; assigned_to_user_id: string | null }>(
      `select l.id as loan_id, c.user_id as client_owner_user_id, la.assigned_to_user_id from public.loans l join public.loan_applications la on la.id=l.application_id join public.clients c on c.id=la.client_id where l.id=$1`,
      [loanId],
    );
    if (!proj) return null;
    if (!isStaff(roles) && !(hasAnyRole(roles, ...ASSIGNED_ROLES) && proj.assigned_to_user_id === actor.userId) && !(hasRole(roles, 'Client') && proj.client_owner_user_id === actor.userId)) {
      throw new Error('User cannot access this loan.');
    }
    return this.getLoanDetails(loanId);
  }

  async disburse(actor: CurrentUser, loanId: string, body: { amount: number; reference?: string }) {
    const roles = await this.getRoles(actor.userId);
    if (!isStaff(roles)) throw new Error('Only Admin or LoanOfficer can perform this action.');

    return this.db.withTransaction(async (client: PoolClient) => {
      const loanResult = await client.query(
        `select id, application_id, principal_amount, outstanding_principal, interest_rate, term_months, status from public.loans where id=$1 for update`,
        [loanId],
      );
      const loan = loanResult.rows[0];
      if (!loan) return null;

      if (loan.status !== 'PendingDisbursement' && loan.status !== 'Disbursed') throw new Error(`Loan status ${loan.status} cannot be disbursed.`);

      const amount = Math.min(body.amount, parseFloat(loan.outstanding_principal));
      if (amount <= 0) throw new Error('Disbursement amount must be greater than zero.');

      await client.query(
        `insert into public.disbursements (id, loan_id, amount, disbursed_at, disbursed_by, reference) values ($1,$2,$3,now(),$4,$5)`,
        [randomUUID(), loanId, amount, actor.userId, body.reference ?? null],
      );
      await client.query(`update public.loans set status='Disbursed', disbursed_at=coalesce(disbursed_at,now()) where id=$1`, [loanId]);

      const currentAppStatus = await client.query(`select status from public.loan_applications where id=$1`, [loan.application_id]);
      if (currentAppStatus.rows[0]?.status !== 'Disbursed') {
        await client.query(`update public.loan_applications set status='Disbursed' where id=$1`, [loan.application_id]);
        await client.query(
          `insert into public.application_status_history (id, application_id, from_status, to_status, changed_by, changed_at, note) values ($1,$2,$3,'Disbursed',$4,now(),$5)`,
          [randomUUID(), loan.application_id, currentAppStatus.rows[0]?.status ?? null, actor.userId, 'Loan disbursed.'],
        );
      }

      const schedCount = await client.query(`select count(*) as cnt from public.repayment_schedule where loan_id=$1`, [loanId]);
      if (parseInt(schedCount.rows[0].cnt) === 0) {
        await this.buildRepaymentSchedule(client, loan);
      }

      await client.query(
        `insert into public.audit_log (id, entity, entity_id, action, actor_user_id, at, metadata) values ($1,'loans',$2,'DisburseLoan',$3,now(),$4::jsonb)`,
        [randomUUID(), loanId, actor.userId, JSON.stringify({ amount, reference: body.reference })],
      );

      return null;
    }).then(() => this.getLoanDetails(loanId));
  }

  async recordRepayment(actor: CurrentUser, loanId: string, body: { amount: number; paidAt?: string; paymentReference?: string }) {
    const roles = await this.getRoles(actor.userId);
    if (!isStaff(roles)) throw new Error('Only Admin or LoanOfficer can perform this action.');

    return this.db.withTransaction(async (client: PoolClient) => {
      const loanResult = await client.query(
        `select id, application_id, outstanding_principal, status from public.loans where id=$1 for update`,
        [loanId],
      );
      const loan = loanResult.rows[0];
      if (!loan) return null;
      if (loan.status === 'Closed') throw new Error('Closed loan cannot accept repayments.');

      const outstanding = parseFloat(loan.outstanding_principal);
      const principalComponent = Math.min(body.amount, outstanding);
      const interestComponent = body.amount - principalComponent;
      const newOutstanding = Math.max(0, outstanding - principalComponent);
      const nextStatus = newOutstanding === 0 ? 'Closed' : 'InRepayment';
      const paidAt = body.paidAt ? new Date(body.paidAt) : new Date();

      await client.query(
        `insert into public.repayments (id, loan_id, amount, principal_component, interest_component, paid_at, payment_reference, recorded_by) values ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [randomUUID(), loanId, body.amount, principalComponent, interestComponent, paidAt, body.paymentReference ?? null, actor.userId],
      );
      await client.query(`update public.loans set outstanding_principal=$1, status=$2 where id=$3`, [newOutstanding, nextStatus, loanId]);

      await this.applyRepaymentToSchedule(client, loanId, body.amount, paidAt);

      const appStatus = nextStatus === 'Closed' ? 'Closed' : 'InRepayment';
      const currentAppStatusResult = await client.query(`select status from public.loan_applications where id=$1`, [loan.application_id]);
      if (currentAppStatusResult.rows[0]?.status !== appStatus) {
        await client.query(`update public.loan_applications set status=$1 where id=$2`, [appStatus, loan.application_id]);
        await client.query(
          `insert into public.application_status_history (id, application_id, from_status, to_status, changed_by, changed_at, note) values ($1,$2,$3,$4,$5,now(),$6)`,
          [randomUUID(), loan.application_id, currentAppStatusResult.rows[0]?.status ?? null, appStatus, actor.userId, 'Repayment recorded.'],
        );
      }

      await client.query(
        `insert into public.audit_log (id, entity, entity_id, action, actor_user_id, at, metadata) values ($1,'repayments',$2,'RecordRepayment',$3,now(),$4::jsonb)`,
        [randomUUID(), loanId, actor.userId, JSON.stringify({ amount: body.amount, principalComponent, interestComponent })],
      );
      return null;
    }).then(() => this.getLoanDetails(loanId));
  }

  private async buildRepaymentSchedule(client: PoolClient, loan: any) {
    const principal = parseFloat(loan.principal_amount);
    const termMonths = parseInt(loan.term_months);
    const interestRate = parseFloat(loan.interest_rate);
    const installmentPrincipal = Math.round((principal / termMonths) * 100) / 100;
    let remainingPrincipal = principal;
    const baseDate = new Date();

    for (let i = 1; i <= termMonths; i++) {
      const p = i === termMonths ? remainingPrincipal : installmentPrincipal;
      remainingPrincipal -= p;
      const interest = Math.round(p * (interestRate / 100) * 100) / 100;
      const total = p + interest;
      const dueDate = new Date(baseDate);
      dueDate.setMonth(dueDate.getMonth() + i);

      await client.query(
        `insert into public.repayment_schedule (id, loan_id, installment_no, due_date, due_principal, due_interest, due_total, paid_amount, status) values ($1,$2,$3,$4,$5,$6,$7,0,'Pending')`,
        [randomUUID(), loan.id, i, dueDate, Math.round(p * 100) / 100, interest, Math.round(total * 100) / 100],
      );
    }
  }

  private async applyRepaymentToSchedule(client: PoolClient, loanId: string, paymentAmount: number, paidAt: Date) {
    let remaining = paymentAmount;
    while (remaining > 0) {
      const next = await client.query(
        `select id, due_total, paid_amount from public.repayment_schedule where loan_id=$1 and paid_amount < due_total order by installment_no asc limit 1`,
        [loanId],
      );
      if (!next.rows[0]) break;
      const installment = next.rows[0];
      const dueRemaining = parseFloat(installment.due_total) - parseFloat(installment.paid_amount);
      const applied = Math.min(remaining, dueRemaining);
      remaining -= applied;
      const newPaid = parseFloat(installment.paid_amount) + applied;
      const newStatus = newPaid >= parseFloat(installment.due_total) ? 'Paid' : 'Pending';
      await client.query(
        `update public.repayment_schedule set paid_amount=$1, status=$2, paid_at=case when $2='Paid' then $3 else paid_at end where id=$4`,
        [newPaid, newStatus, paidAt, installment.id],
      );
    }
  }
}
```

- [ ] **Step 4: Create `backend-node/src/loans/loans.controller.ts`**

```typescript
import { Controller, Get, Post, Param, Body, UseGuards } from '@nestjs/common';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { GetCurrentUser } from '../auth/current-user.decorator';
import { CurrentUser } from '../auth/roles.helper';
import { LoansService } from './loans.service';

@Controller('api/loans')
@UseGuards(SupabaseAuthGuard)
export class LoansController {
  constructor(private readonly svc: LoansService) {}

  @Get(':id')
  getById(@GetCurrentUser() user: CurrentUser, @Param('id') id: string) {
    return this.svc.getById(user, id);
  }

  @Post(':id/disburse')
  disburse(@GetCurrentUser() user: CurrentUser, @Param('id') id: string, @Body() body: any) {
    return this.svc.disburse(user, id, body);
  }

  @Post(':id/repayments')
  recordRepayment(@GetCurrentUser() user: CurrentUser, @Param('id') id: string, @Body() body: any) {
    return this.svc.recordRepayment(user, id, body);
  }
}
```

- [ ] **Step 5: Create `backend-node/src/loans/loans.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { LoansController } from './loans.controller';
import { LoansService } from './loans.service';
import { AuthModule } from '../auth/auth.module';

@Module({ imports: [AuthModule], controllers: [LoansController], providers: [LoansService] })
export class LoansModule {}
```

- [ ] **Step 6: Create `backend-node/src/tasks/tasks.service.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CurrentUser, isStaff, hasAnyRole, hasRole, STAFF_ROLES, ASSIGNED_ROLES } from '../auth/roles.helper';
import { randomUUID } from 'crypto';

@Injectable()
export class TasksService {
  constructor(private readonly db: DatabaseService) {}

  private async getRoles(userId: string): Promise<string[]> {
    const rows = await this.db.query<{ name: string }>(`select r.name from public.user_roles ur join public.roles r on r.id=ur.role_id where ur.user_id=$1`, [userId]);
    return [...new Set(rows.map((r) => r.name))];
  }

  async list(actor: CurrentUser, applicationId?: string, assignedToMe?: boolean) {
    const roles = await this.getRoles(actor.userId);
    let sql = `select t.id, t.application_id as "applicationId", t.title, t.status, t.assigned_to as "assignedTo", t.due_date as "dueDate" from public.tasks t join public.loan_applications la on la.id=t.application_id join public.clients c on c.id=la.client_id where 1=1`;
    const params: any[] = [];
    let idx = 1;

    if (applicationId) { sql += ` and t.application_id=$${idx++}`; params.push(applicationId); }

    if (assignedToMe) {
      sql += ` and t.assigned_to=$${idx++}`; params.push(actor.userId);
    } else if (!isStaff(roles)) {
      sql += ` and (t.assigned_to=$${idx} or c.user_id=$${idx})`; params.push(actor.userId); idx++;
    }

    sql += ` order by t.due_date asc nulls last, t.title asc`;
    return this.db.query(sql, params);
  }

  async create(actor: CurrentUser, body: { applicationId: string; title: string; assignedTo?: string; dueDate?: string }) {
    const roles = await this.getRoles(actor.userId);
    if (!hasAnyRole(roles, 'Admin', 'LoanOfficer', 'Intern', 'Originator')) throw new Error('Only internal users can create tasks.');

    const proj = await this.db.queryOne<{ id: string; assigned_to_user_id: string | null; client_owner_user_id: string | null }>(
      `select la.id, la.assigned_to_user_id, c.user_id as client_owner_user_id from public.loan_applications la join public.clients c on c.id=la.client_id where la.id=$1`,
      [body.applicationId],
    );
    if (!proj) throw new Error('Application not found.');
    if (!isStaff(roles) && !(hasAnyRole(roles, ...ASSIGNED_ROLES) && proj.assigned_to_user_id === actor.userId) && !(hasRole(roles, 'Client') && proj.client_owner_user_id === actor.userId)) {
      throw new Error('User cannot access this application.');
    }

    const taskId = randomUUID();
    await this.db.execute(
      `insert into public.tasks (id, application_id, title, status, assigned_to, due_date) values ($1,$2,$3,'Open',$4,$5)`,
      [taskId, body.applicationId, body.title, body.assignedTo ?? null, body.dueDate ? new Date(body.dueDate) : null],
    );

    if (body.assignedTo && body.assignedTo !== actor.userId) {
      await this.db.execute(
        `insert into public.notifications (id, user_id, channel, type, title, message, status, payload, created_at, sent_at) values ($1,$2,'InApp','TaskAssigned','New task assigned',$3,'Sent',$4::jsonb,now(),now())`,
        [randomUUID(), body.assignedTo, body.title, JSON.stringify({ taskId, applicationId: body.applicationId })],
      );
    }

    return this.db.queryOne(
      `select id, application_id as "applicationId", title, status, assigned_to as "assignedTo", due_date as "dueDate" from public.tasks where id=$1`,
      [taskId],
    );
  }

  async update(actor: CurrentUser, taskId: string, body: { title?: string; assignedTo?: string; dueDate?: string }) {
    const task = await this.db.queryOne<{ id: string; application_id: string; assigned_to: string | null }>(
      `select id, application_id, assigned_to from public.tasks where id=$1`, [taskId],
    );
    if (!task) return null;
    const roles = await this.getRoles(actor.userId);
    const proj = await this.db.queryOne<{ id: string; assigned_to_user_id: string | null; client_owner_user_id: string | null }>(
      `select la.id, la.assigned_to_user_id, c.user_id as client_owner_user_id from public.loan_applications la join public.clients c on c.id=la.client_id where la.id=$1`,
      [task.application_id],
    );
    if (!proj) return null;
    if (!isStaff(roles) && task.assigned_to !== actor.userId && !(hasAnyRole(roles, ...ASSIGNED_ROLES) && proj.assigned_to_user_id === actor.userId) && !(hasRole(roles, 'Client') && proj.client_owner_user_id === actor.userId)) {
      throw new Error('User cannot access this application.');
    }

    await this.db.execute(
      `update public.tasks set title=coalesce($1, title), assigned_to=$2, due_date=$3 where id=$4`,
      [body.title ?? null, body.assignedTo ?? null, body.dueDate ? new Date(body.dueDate) : null, taskId],
    );
    return this.db.queryOne(`select id, application_id as "applicationId", title, status, assigned_to as "assignedTo", due_date as "dueDate" from public.tasks where id=$1`, [taskId]);
  }

  async complete(actor: CurrentUser, taskId: string, note?: string) {
    const task = await this.db.queryOne<{ id: string; application_id: string; assigned_to: string | null }>(
      `select id, application_id, assigned_to from public.tasks where id=$1`, [taskId],
    );
    if (!task) return null;
    const roles = await this.getRoles(actor.userId);
    await this.db.execute(`update public.tasks set status='Completed' where id=$1`, [taskId]);
    if (note) {
      await this.db.execute(
        `insert into public.notes (id, application_id, body, created_by, created_at) values ($1,$2,$3,$4,now())`,
        [randomUUID(), task.application_id, note, actor.userId],
      );
    }
    return this.db.queryOne(`select id, application_id as "applicationId", title, status, assigned_to as "assignedTo", due_date as "dueDate" from public.tasks where id=$1`, [taskId]);
  }
}
```

- [ ] **Step 7: Create `backend-node/src/tasks/tasks.controller.ts`**

```typescript
import { Controller, Get, Post, Put, Param, Body, Query, UseGuards } from '@nestjs/common';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { GetCurrentUser } from '../auth/current-user.decorator';
import { CurrentUser } from '../auth/roles.helper';
import { TasksService } from './tasks.service';

@Controller('api/tasks')
@UseGuards(SupabaseAuthGuard)
export class TasksController {
  constructor(private readonly svc: TasksService) {}

  @Get()
  list(@GetCurrentUser() u: CurrentUser, @Query('applicationId') appId?: string, @Query('assignedToMe') atm?: string) {
    return this.svc.list(u, appId, atm === 'true');
  }

  @Post()
  create(@GetCurrentUser() u: CurrentUser, @Body() body: any) { return this.svc.create(u, body); }

  @Put(':id')
  update(@GetCurrentUser() u: CurrentUser, @Param('id') id: string, @Body() body: any) { return this.svc.update(u, id, body); }

  @Post(':id/complete')
  complete(@GetCurrentUser() u: CurrentUser, @Param('id') id: string, @Body() body: any) { return this.svc.complete(u, id, body?.note); }
}
```

- [ ] **Step 8: Create `backend-node/src/tasks/tasks.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { AuthModule } from '../auth/auth.module';

@Module({ imports: [AuthModule], controllers: [TasksController], providers: [TasksService] })
export class TasksModule {}
```

- [ ] **Step 9: Create `backend-node/src/documents/documents.service.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CurrentUser, isStaff } from '../auth/roles.helper';
import { randomUUID } from 'crypto';

@Injectable()
export class DocumentsService {
  constructor(private readonly db: DatabaseService) {}

  private async getRoles(userId: string): Promise<string[]> {
    const rows = await this.db.query<{ name: string }>(`select r.name from public.user_roles ur join public.roles r on r.id=ur.role_id where ur.user_id=$1`, [userId]);
    return [...new Set(rows.map((r) => r.name))];
  }

  async listRequirements(actor: CurrentUser) {
    const roles = await this.getRoles(actor.userId);
    if (!isStaff(roles)) throw new Error('Only Admin or LoanOfficer can perform document compliance actions.');
    return this.db.query(
      `select id, loan_product_id as "loanProductId", required_at_status as "requiredAtStatus", doc_type as "docType", is_required as "isRequired", created_at as "createdAt" from public.document_requirements order by required_at_status asc, doc_type asc`,
    );
  }

  async createRequirement(actor: CurrentUser, body: { loanProductId?: string; requiredAtStatus: string; docType: string; isRequired: boolean }) {
    const roles = await this.getRoles(actor.userId);
    if (!isStaff(roles)) throw new Error('Only Admin or LoanOfficer can perform document compliance actions.');
    const id = randomUUID();
    await this.db.execute(
      `insert into public.document_requirements (id, loan_product_id, required_at_status, doc_type, is_required, created_at) values ($1,$2,$3,$4,$5,now())`,
      [id, body.loanProductId ?? null, body.requiredAtStatus, body.docType, body.isRequired],
    );
    return this.db.queryOne(
      `select id, loan_product_id as "loanProductId", required_at_status as "requiredAtStatus", doc_type as "docType", is_required as "isRequired", created_at as "createdAt" from public.document_requirements where id=$1`,
      [id],
    );
  }

  async verifyDocument(actor: CurrentUser, applicationId: string, documentId: string, status: string, note?: string) {
    const roles = await this.getRoles(actor.userId);
    if (!isStaff(roles)) throw new Error('Only Admin or LoanOfficer can perform document compliance actions.');
    const affected = await this.db.execute(
      `update public.loan_documents set status=$1, verification_note=$2, verified_by=$3, verified_at=now() where id=$4 and application_id=$5`,
      [status, note ?? null, actor.userId, documentId, applicationId],
    );
    if (affected === 0) throw new Error('Document not found for application.');
    await this.db.execute(
      `insert into public.audit_log (id, entity, entity_id, action, actor_user_id, at, metadata) values ($1,'loan_documents',$2,'VerifyDocument',$3,now(),$4::jsonb)`,
      [randomUUID(), documentId, actor.userId, JSON.stringify({ status, note })],
    );
  }
}
```

- [ ] **Step 10: Create `backend-node/src/documents/documents.controller.ts`**

```typescript
import { Controller, Get, Post, Param, Body, UseGuards, HttpCode } from '@nestjs/common';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { GetCurrentUser } from '../auth/current-user.decorator';
import { CurrentUser } from '../auth/roles.helper';
import { DocumentsService } from './documents.service';

@Controller('api')
@UseGuards(SupabaseAuthGuard)
export class DocumentsController {
  constructor(private readonly svc: DocumentsService) {}

  @Get('document-requirements')
  list(@GetCurrentUser() u: CurrentUser) { return this.svc.listRequirements(u); }

  @Post('document-requirements')
  create(@GetCurrentUser() u: CurrentUser, @Body() body: any) { return this.svc.createRequirement(u, body); }

  @Post('applications/:appId/documents/:docId/verify')
  @HttpCode(204)
  async verify(@GetCurrentUser() u: CurrentUser, @Param('appId') appId: string, @Param('docId') docId: string, @Body() body: any) {
    await this.svc.verifyDocument(u, appId, docId, body.status, body.note);
  }
}
```

- [ ] **Step 11: Create `backend-node/src/documents/documents.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { AuthModule } from '../auth/auth.module';

@Module({ imports: [AuthModule], controllers: [DocumentsController], providers: [DocumentsService] })
export class DocumentsModule {}
```

- [ ] **Step 12: Create `backend-node/src/notifications/notifications.service.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CurrentUser } from '../auth/roles.helper';
import { randomUUID } from 'crypto';

@Injectable()
export class NotificationsService {
  constructor(private readonly db: DatabaseService) {}

  async list(actor: CurrentUser, unreadOnly: boolean) {
    let sql = `select id, user_id as "userId", channel, type, title, message, status, created_at as "createdAt", sent_at as "sentAt", read_at as "readAt", payload::text as payload from public.notifications where user_id=$1`;
    if (unreadOnly) sql += ` and read_at is null`;
    sql += ` order by created_at desc limit 200`;
    return this.db.query(sql, [actor.userId]);
  }

  async markRead(actor: CurrentUser, notificationId: string) {
    await this.db.execute(
      `update public.notifications set read_at=coalesce(read_at,now()), status=case when status='Sent' then 'Read' else status end where id=$1 and user_id=$2`,
      [notificationId, actor.userId],
    );
    await this.db.execute(
      `insert into public.audit_log (id, entity, entity_id, action, actor_user_id, at, metadata) values ($1,'notifications',$2,'MarkNotificationRead',$3,now(),$4::jsonb)`,
      [randomUUID(), notificationId, actor.userId, JSON.stringify({ notificationId })],
    );
  }

  async runReminderScans() {
    await this.db.execute(`
      insert into public.notifications (id, user_id, channel, type, title, message, status, payload, created_at, sent_at)
      select gen_random_uuid(), c.user_id, 'InApp', 'ArrearsReminder', 'Repayment overdue', 'Your repayment is overdue. Please make payment as soon as possible.', 'Sent',
             jsonb_build_object('loanId', l.id, 'applicationId', l.application_id), now(), now()
      from public.repayment_schedule rs
      join public.loans l on l.id=rs.loan_id
      join public.loan_applications la on la.id=l.application_id
      join public.clients c on c.id=la.client_id
      where rs.due_date < current_date and rs.due_total > rs.paid_amount and c.user_id is not null
        and not exists (select 1 from public.notifications n where n.user_id=c.user_id and n.type='ArrearsReminder' and (n.payload->>'loanId')::uuid=l.id and n.created_at::date=current_date)`);

    await this.db.execute(`
      insert into public.notifications (id, user_id, channel, type, title, message, status, payload, created_at, sent_at)
      select gen_random_uuid(), t.assigned_to, 'InApp', 'TaskReminder', 'Task reminder', 'You have an open task due soon.', 'Sent',
             jsonb_build_object('taskId', t.id, 'applicationId', t.application_id), now(), now()
      from public.tasks t
      where t.assigned_to is not null and t.status='Open' and t.due_date is not null and t.due_date <= current_date + 1
        and not exists (select 1 from public.notifications n where n.user_id=t.assigned_to and n.type='TaskReminder' and (n.payload->>'taskId')::uuid=t.id and n.created_at::date=current_date)`);

    await this.db.execute(`
      insert into public.notifications (id, user_id, channel, type, title, message, status, payload, created_at, sent_at)
      select gen_random_uuid(), coalesce(la.assigned_to_user_id, c.user_id), 'InApp', 'StaleApplicationFollowUp', 'Application follow-up', 'This application has been pending follow-up for over 7 days.', 'Sent',
             jsonb_build_object('applicationId', la.id, 'status', la.status), now(), now()
      from public.loan_applications la join public.clients c on c.id=la.client_id
      where la.status in ('Submitted','UnderReview','InfoRequested') and la.created_at < now() - interval '7 days' and coalesce(la.assigned_to_user_id, c.user_id) is not null
        and not exists (select 1 from public.notifications n where n.user_id=coalesce(la.assigned_to_user_id, c.user_id) and n.type='StaleApplicationFollowUp' and (n.payload->>'applicationId')::uuid=la.id and n.created_at::date=current_date)`);
  }
}
```

- [ ] **Step 13: Create `backend-node/src/notifications/notifications.controller.ts`**

```typescript
import { Controller, Get, Post, Param, Query, UseGuards, HttpCode } from '@nestjs/common';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { GetCurrentUser } from '../auth/current-user.decorator';
import { CurrentUser } from '../auth/roles.helper';
import { NotificationsService } from './notifications.service';

@Controller('api/notifications')
@UseGuards(SupabaseAuthGuard)
export class NotificationsController {
  constructor(private readonly svc: NotificationsService) {}

  @Get()
  list(@GetCurrentUser() u: CurrentUser, @Query('unreadOnly') unreadOnly?: string) {
    return this.svc.list(u, unreadOnly === 'true');
  }

  @Post(':id/read')
  @HttpCode(204)
  async markRead(@GetCurrentUser() u: CurrentUser, @Param('id') id: string) {
    await this.svc.markRead(u, id);
  }
}
```

- [ ] **Step 14: Create `backend-node/src/notifications/notifications.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { AuthModule } from '../auth/auth.module';

@Module({ imports: [AuthModule], controllers: [NotificationsController], providers: [NotificationsService], exports: [NotificationsService] })
export class NotificationsModule {}
```

- [ ] **Step 15: Create `backend-node/src/reports/reports.service.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CurrentUser, isStaff } from '../auth/roles.helper';

@Injectable()
export class ReportsService {
  constructor(private readonly db: DatabaseService) {}

  private async ensureStaff(actor: CurrentUser) {
    const roles = await this.db.query<{ name: string }>(`select r.name from public.user_roles ur join public.roles r on r.id=ur.role_id where ur.user_id=$1`, [actor.userId]);
    if (!isStaff(roles.map((r) => r.name))) throw new Error('Only Admin or LoanOfficer can access reports.');
  }

  async portfolio(actor: CurrentUser) {
    await this.ensureStaff(actor);
    return this.db.queryOne(
      `select cast(count(*) as int) as "totalLoans", cast(count(*) filter (where status in ('Disbursed','InRepayment')) as int) as "activeLoans", coalesce(sum(principal_amount),0) as "totalPrincipal", coalesce(sum(outstanding_principal),0) as "outstandingPrincipal" from public.loans`,
    );
  }

  async arrears(actor: CurrentUser) {
    await this.ensureStaff(actor);
    return this.db.query(
      `select rs.loan_id as "loanId", l.application_id as "applicationId", rs.installment_no as "installmentNo", rs.due_date as "dueDate", rs.due_total as "dueTotal", rs.paid_amount as "paidAmount", cast(greatest(rs.due_total-rs.paid_amount,0) as numeric(18,2)) as "outstandingAmount", cast(greatest((current_date-rs.due_date),0) as int) as "daysOverdue" from public.repayment_schedule rs join public.loans l on l.id=rs.loan_id where rs.due_date<current_date and rs.due_total>rs.paid_amount and l.status<>'Closed' order by rs.due_date asc`,
    );
  }

  async audit(actor: CurrentUser, from?: string, to?: string, limit = 200) {
    await this.ensureStaff(actor);
    return this.db.query(
      `select id, entity, entity_id as "entityId", action, actor_user_id as "actorUserId", at, metadata::text as metadata from public.audit_log where ($1::timestamptz is null or at>=$1::timestamptz) and ($2::timestamptz is null or at<=$2::timestamptz) order by at desc limit $3`,
      [from ?? null, to ?? null, limit],
    );
  }

  async turnaround(actor: CurrentUser) {
    await this.ensureStaff(actor);
    return this.db.queryOne(
      `with submitted as (select application_id, min(changed_at) as submitted_at from public.application_status_history where to_status='Submitted' group by application_id), approved as (select application_id, min(changed_at) as approved_at from public.application_status_history where to_status='Approved' group by application_id) select cast(count(*) as int) as count, cast(coalesce(avg(extract(epoch from (a.approved_at-s.submitted_at))/86400.0),0) as double precision) as "averageDays" from submitted s join approved a on a.application_id=s.application_id where a.approved_at>=s.submitted_at`,
    );
  }

  async pipelineConversion(actor: CurrentUser) {
    await this.ensureStaff(actor);
    return this.db.query(
      `select from_status as "fromStatus", to_status as "toStatus", cast(count(*) as int) as count from public.application_status_history group by from_status, to_status order by count(*) desc`,
    );
  }

  async productivity(actor: CurrentUser) {
    await this.ensureStaff(actor);
    return this.db.query(
      `with task_stats as (select coalesce(assigned_to, changed_by) as user_id, cast(count(*) filter (where status='Completed') as int) as tasks_completed from public.tasks t left join public.application_status_history h on h.application_id=t.application_id group by coalesce(assigned_to, changed_by)), app_stats as (select assigned_to_user_id as user_id, cast(count(*) as int) as applications_handled from public.loan_applications where assigned_to_user_id is not null group by assigned_to_user_id) select coalesce(t.user_id, a.user_id) as "userId", coalesce(t.tasks_completed,0) as "tasksCompleted", coalesce(a.applications_handled,0) as "applicationsHandled" from task_stats t full join app_stats a on a.user_id=t.user_id where coalesce(t.user_id,a.user_id) is not null order by coalesce(t.tasks_completed,0) desc`,
    );
  }
}
```

- [ ] **Step 16: Create `backend-node/src/reports/reports.controller.ts`**

```typescript
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { GetCurrentUser } from '../auth/current-user.decorator';
import { CurrentUser } from '../auth/roles.helper';
import { ReportsService } from './reports.service';

@Controller('api/reports')
@UseGuards(SupabaseAuthGuard)
export class ReportsController {
  constructor(private readonly svc: ReportsService) {}

  @Get('portfolio') portfolio(@GetCurrentUser() u: CurrentUser) { return this.svc.portfolio(u); }
  @Get('arrears') arrears(@GetCurrentUser() u: CurrentUser) { return this.svc.arrears(u); }
  @Get('audit') audit(@GetCurrentUser() u: CurrentUser, @Query('from') from?: string, @Query('to') to?: string, @Query('limit') limit?: string) { return this.svc.audit(u, from, to, limit ? parseInt(limit) : 200); }
  @Get('turnaround') turnaround(@GetCurrentUser() u: CurrentUser) { return this.svc.turnaround(u); }
  @Get('pipeline-conversion') pipelineConversion(@GetCurrentUser() u: CurrentUser) { return this.svc.pipelineConversion(u); }
  @Get('productivity') productivity(@GetCurrentUser() u: CurrentUser) { return this.svc.productivity(u); }
}
```

- [ ] **Step 17: Create `backend-node/src/reports/reports.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { AuthModule } from '../auth/auth.module';

@Module({ imports: [AuthModule], controllers: [ReportsController], providers: [ReportsService] })
export class ReportsModule {}
```

- [ ] **Step 18: Create `backend-node/src/jobs/notification-sweep.job.ts`**

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class NotificationSweepJob {
  private readonly logger = new Logger(NotificationSweepJob.name);

  constructor(private readonly notificationsService: NotificationsService) {}

  @Cron(CronExpression.EVERY_HOUR)
  async handle() {
    this.logger.log('Running notification sweep...');
    try {
      await this.notificationsService.runReminderScans();
      this.logger.log('Notification sweep complete.');
    } catch (err) {
      this.logger.error('Notification sweep failed', err);
    }
  }
}
```

- [ ] **Step 19: Register the job in `backend-node/src/app.module.ts`**

Add `NotificationSweepJob` to the imports/providers. Update `app.module.ts` to include it:

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { HealthController } from './health/health.controller';
import { MeController } from './me/me.controller';
import { AdminModule } from './admin/admin.module';
import { ClientsModule } from './clients/clients.module';
import { ApplicationsModule } from './applications/applications.module';
import { LoansModule } from './loans/loans.module';
import { TasksModule } from './tasks/tasks.module';
import { DocumentsModule } from './documents/documents.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ReportsModule } from './reports/reports.module';
import { NotificationSweepJob } from './jobs/notification-sweep.job';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    AuthModule,
    AdminModule,
    ClientsModule,
    ApplicationsModule,
    LoansModule,
    TasksModule,
    DocumentsModule,
    NotificationsModule,
    ReportsModule,
  ],
  controllers: [HealthController, MeController],
  providers: [NotificationSweepJob],
})
export class AppModule {}
```

- [ ] **Step 20: Build to verify everything compiles**

```bash
cd /Users/thabomollomponya/Dev/prdf/prdf-lms/backend-node && npm run build
```

Expected: No TypeScript errors. `dist/` updated.

- [ ] **Step 21: Commit**

```bash
git add backend-node/
git commit -m "feat(backend-node): add all domain modules - loans, tasks, documents, notifications, reports, background job"
```

---

## Environment Variables Summary

For Railway deployment, set these environment variables on the `backend-node` service:

| Variable | Source |
|----------|--------|
| `SUPABASE_URL` | Supabase project settings |
| `SUPABASE_ANON_KEY` | Supabase project settings |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase project settings |
| `SUPABASE_JWT_AUDIENCE` | `authenticated` |
| `SUPABASE_DB_CONNECTION_STRING` | Supabase project → Database → Connection string (URI) |
| `ALLOWED_ORIGINS` | Comma-separated client/admin Railway URLs |
| `PORT` | `3000` (Railway sets this automatically) |

**Root Directory on Railway:** Set to `backend-node` so Railway picks up the `railway.toml` and `Dockerfile` from there.
