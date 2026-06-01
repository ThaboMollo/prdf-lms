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
