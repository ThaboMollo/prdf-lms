import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import * as Sentry from '@sentry/node';
import { requestContext } from '../tenancy/request-context';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';

    // Structured detail from an HttpException body (per-tenant cron results,
    // field-level validation errors) is preserved rather than collapsed into a
    // single string. Extracting only `message` silently discarded everything
    // else — the cron sweep's per-tenant breakdown vanished into a generic
    // "Internal server error", which defeats the point of reporting it.
    // See docs/validation-spec.md §A2.
    let extra: Record<string, unknown> = {};

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (res && typeof res === 'object') {
        const body = res as Record<string, unknown>;
        message = (body.message as string) ?? message;
        const { message: _message, statusCode: _statusCode, error: _error, ...rest } = body;
        extra = rest;
      }
    } else if (isInfrastructureError(exception)) {
      // Checked BEFORE the message matching below, and deliberately so.
      //
      // A dead database raises `database "x" does not exist`, which contains
      // "does not exist" — the substring rule classified that as 404. The
      // consequences were all bad: monitoring saw a client error rather than an
      // outage, only 500s reach Sentry so nothing alerted, and the raw message
      // (including the internal database name) was returned to the caller.
      //
      // Infrastructure failures identify themselves by an error CODE — a
      // Postgres SQLSTATE or a Node system errno — not by prose, so classify on
      // that and never echo the detail outward.
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'Internal server error';
      const slug = requestContext.getStore()?.tenant.slug ?? 'no-tenant';
      const code = (exception as { code?: string }).code;
      this.logger.error(
        `[${slug}] infrastructure failure (${code}): ${(exception as Error).message}`,
        (exception as Error).stack,
      );
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
        // Prefix with the tenant so a log search can separate one tenant's
        // failures from another's. Read defensively: routes excluded from
        // tenant resolution (health, cron) legitimately have no tenant.
        const slug = requestContext.getStore()?.tenant.slug ?? 'no-tenant';
        this.logger.error(`[${slug}] ${exception.message}`, exception.stack);
      }
    }

    // Only genuine 500s (unmatched errors, or non-Error/non-HttpException
    // throws) are worth alerting on — 4xx branches above are expected
    // control flow (bad input, permission checks), not incidents.
    if (status === HttpStatus.INTERNAL_SERVER_ERROR) {
      Sentry.captureException(exception);
    }

    response.status(status).json({ statusCode: status, message, path: request.url, ...extra });
  }
}

/**
 * Distinguishes "the platform is broken" from "the caller asked for something
 * invalid". Postgres errors carry a five-character SQLSTATE; Node system
 * errors carry an ENOENT/ECONNREFUSED-style errno. Application errors thrown
 * by services carry neither.
 */
function isInfrastructureError(exception: unknown): boolean {
  if (!(exception instanceof Error)) return false;
  const code = (exception as { code?: unknown }).code;
  if (typeof code !== 'string' || !code) return false;

  // Postgres SQLSTATE, e.g. 3D000 (invalid_catalog_name), 28P01 (bad password),
  // 57P03 (cannot_connect_now).
  if (/^[0-9A-Z]{5}$/.test(code)) return true;

  // Node system errors: ECONNREFUSED, ENOTFOUND, ETIMEDOUT, EAI_AGAIN, ...
  return /^(E[A-Z_]+|EAI_[A-Z]+)$/.test(code);
}
