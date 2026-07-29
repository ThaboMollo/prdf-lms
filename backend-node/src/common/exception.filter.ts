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
import { DomainError, DomainErrorCode } from './errors';

/** The error's TYPE decides the status — never its wording. */
const DOMAIN_ERROR_STATUS: Record<DomainErrorCode, HttpStatus> = {
  validation: HttpStatus.BAD_REQUEST,
  permission: HttpStatus.FORBIDDEN,
  not_found: HttpStatus.NOT_FOUND,
  conflict: HttpStatus.CONFLICT,
};

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
    } else if (exception instanceof DomainError) {
      // Explicit mapping. See src/common/errors.ts for what the substring
      // rules below were doing to these — 18 of 38 thrown messages in this
      // codebase returned 500 and raised a Sentry alert for ordinary user
      // errors, with the message replaced by "Internal server error".
      status = DOMAIN_ERROR_STATUS[exception.code];
      message = exception.message;
      // A service-level rule that names a field reports it exactly the way DTO
      // validation does (§2), so the frontend needs no second code path.
      if (exception.field) {
        extra = { errors: [{ field: exception.field, message: exception.message, code: exception.code }] };
      }
    } else if (databaseRuleStatus(exception) !== null) {
      // Business rules enforced by the SCHEMA, not by a service. The status is
      // decided by SQLSTATE class — a machine-assigned code — rather than by
      // the prose of the RAISE, which is what left these classified at random:
      //
      //   'Requested amount % is outside the allowed range'  -> 500 (no keyword)
      //   'Term % months is outside the allowed range'       -> 500 (no keyword)
      //   'Unsupported role assignment'                      -> 500 (no keyword)
      //   'Admin role required'                              -> 400 ('required')
      //   'Invalid status transition: % -> %'                -> 400 ('invalid')
      //
      // Only the last two landed anywhere sensible, and only by accident.
      status = databaseRuleStatus(exception)!;
      message = safeDatabaseMessage(exception, status);
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
      // DEPRECATED substring fallback. Every throw site in this repo has been
      // migrated to the typed errors above; this remains only so that a service
      // added without them degrades to the old behaviour rather than becoming
      // an unexplained 500. Delete once nothing reaches it.
      //
      // Do not extend these rules. They are why the wording of an error was
      // also its status code.
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
 * Status for a rule the DATABASE enforced, or null if this isn't one.
 *
 * PL/pgSQL `raise exception` and integrity constraints are how a large part of
 * this schema states its rules — status transitions, product limits, required
 * documents, immutable columns. They reach the filter as ordinary Errors
 * carrying a SQLSTATE, so classifying them on that code is both stable and
 * honest, where matching their English was neither.
 */
function databaseRuleStatus(exception: unknown): HttpStatus | null {
  if (!(exception instanceof Error)) return null;
  const code = (exception as { code?: unknown }).code;
  if (typeof code !== 'string') return null;

  // 42501 insufficient_privilege — RLS or an explicit privilege check refused.
  if (code === '42501') return HttpStatus.FORBIDDEN;

  // 23505 unique_violation — the row already exists. Retrying unchanged will
  // not help, but refetching and reconciling will, which is what 409 means.
  // This is also what turned a double-submitted draft into a bare 500.
  if (code === '23505') return HttpStatus.CONFLICT;

  // Remaining 23xxx (foreign key, not-null, check) are malformed input.
  if (/^23/.test(code)) return HttpStatus.BAD_REQUEST;

  // P0xxx — PL/pgSQL RAISE. Every business rule in this schema surfaces here.
  if (/^P0/.test(code)) return HttpStatus.BAD_REQUEST;

  return null;
}

/**
 * What to show the caller for a database-enforced rule.
 *
 * P0001 messages are written for humans ("Requested amount 9999 is outside the
 * allowed range (50000 - 500000) for this loan product") and are safe to show.
 * Constraint violations are NOT — their text carries constraint and column
 * names, which describes the schema to anyone who can trigger one.
 */
function safeDatabaseMessage(exception: unknown, status: HttpStatus): string {
  const code = (exception as { code?: string }).code ?? '';
  if (/^P0/.test(code)) return (exception as Error).message;
  if (status === HttpStatus.CONFLICT) return 'That record already exists.';
  if (status === HttpStatus.FORBIDDEN) return 'You do not have permission to perform this action.';
  return 'That request could not be completed. Please check the values and try again.';
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

  // Postgres SQLSTATE. Two classes are deliberately EXCLUDED because they are
  // the database enforcing application rules, not the platform failing:
  //
  //   P0xxx — PL/pgSQL RAISE. Every business rule in this schema surfaces this
  //           way: "Invalid status transition", "missing required document(s)",
  //           "Cannot approve application". Treating those as infrastructure
  //           returned 500 to the user and raised a Sentry alert for what is
  //           ordinary, expected rejection.
  //   23xxx — integrity constraint violations (unique, foreign key, check).
  //           A duplicate or a bad reference is a caller problem.
  //
  // What remains is genuine platform failure: 08 connection, 3D missing
  // database, 28 bad credentials, 53 out of resources, 57 shutdown, XX internal.
  if (/^(P0|23)/.test(code)) return false;
  if (/^[0-9A-Z]{5}$/.test(code)) return true;

  // Node system errors: ECONNREFUSED, ENOTFOUND, ETIMEDOUT, EAI_AGAIN, ...
  return /^(E[A-Z_]+|EAI_[A-Z]+)$/.test(code);
}
