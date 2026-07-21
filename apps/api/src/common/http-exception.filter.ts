import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import type { ApiErrorBody } from '@delayance/shared-types';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let error = 'Internal Server Error';
    let details: unknown;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (typeof body === 'object' && body !== null) {
        const record = body as Record<string, unknown>;
        message = String(record.message ?? message);
        error = String(record.error ?? exception.name);
        details = record.details;
      }
      error = HttpStatus[status] ?? error;
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    const payload: ApiErrorBody = {
      statusCode: status,
      message,
      error,
      details,
    };

    response.status(status).json(payload);
  }
}
