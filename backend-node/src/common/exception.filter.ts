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

    // Only genuine 500s (unmatched errors, or non-Error/non-HttpException
    // throws) are worth alerting on — 4xx branches above are expected
    // control flow (bad input, permission checks), not incidents.
    if (status === HttpStatus.INTERNAL_SERVER_ERROR) {
      Sentry.captureException(exception);
    }

    response.status(status).json({ statusCode: status, message, path: request.url, ...extra });
  }
}
