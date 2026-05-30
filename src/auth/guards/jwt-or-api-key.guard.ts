import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { isObservable, lastValueFrom } from 'rxjs';
import { ApiKeysService } from '../api-keys.service';

@Injectable()
export class JwtOrApiKeyGuard extends AuthGuard('jwt') implements CanActivate {
  constructor(private readonly apiKeys: ApiKeysService) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      const jwtResult = super.canActivate(context) as any;
      const allowed = isObservable(jwtResult) ? await lastValueFrom(jwtResult) : await jwtResult;
      if (allowed) {
        return true;
      }
    } catch {
      // JWT가 없거나 유효하지 않으면 API 키 인증으로 전환한다.
    }

    const request = context.switchToHttp().getRequest();
    const rawApiKey = this.extractApiKey(request);
    if (!rawApiKey) {
      throw new UnauthorizedException('인증 정보가 필요합니다.');
    }

    const user = await this.apiKeys.validate(rawApiKey);
    if (!user) {
      throw new UnauthorizedException('API 키가 올바르지 않거나 폐기되었습니다.');
    }

    request.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      phone: user.phone,
    };
    request.authType = 'api-key';

    return true;
  }

  private extractApiKey(request: { headers?: Record<string, unknown>; get?: (name: string) => unknown }) {
    const headerValue = request.get?.('x-api-key') ?? request.headers?.['x-api-key'];
    if (typeof headerValue === 'string' && headerValue.trim()) {
      return headerValue.trim();
    }
    if (Array.isArray(headerValue) && typeof headerValue[0] === 'string' && headerValue[0].trim()) {
      return headerValue[0].trim();
    }

    const authorization = request.get?.('authorization') ?? request.headers?.authorization;
    if (typeof authorization !== 'string') {
      return null;
    }

    const [scheme, ...rest] = authorization.trim().split(/\s+/);
    if (scheme !== 'ApiKey' || rest.length === 0) {
      return null;
    }

    const token = rest.join(' ').trim();
    return token || null;
  }
}
