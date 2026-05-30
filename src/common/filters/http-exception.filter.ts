import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'object' && res !== null && 'success' in res && (res as { success: boolean }).success === false) {
        return response.status(status).json(res);
      }
      const message =
        typeof res === 'string'
          ? res
          : (res as { message?: string | string[] }).message;
      const msg = Array.isArray(message) ? message.join(', ') : message ?? '요청을 처리할 수 없습니다.';
      return response.status(status).json({
        success: false,
        code: status === HttpStatus.UNAUTHORIZED ? 'UNAUTHORIZED' : 'HTTP_ERROR',
        message: msg,
      });
    }

    console.error(exception);
    return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      code: 'INTERNAL_ERROR',
      message: '서버 오류가 발생했습니다.',
    });
  }
}
