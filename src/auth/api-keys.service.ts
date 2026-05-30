import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';
import { ApiKey } from '@prisma/client';

type ApiKeySummary = {
  id: number;
  name: string;
  keyPrefix: string;
  isActive: boolean;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

@Injectable()
export class ApiKeysService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: number, dto: CreateApiKeyDto) {
    const rawApiKey = this.buildRawApiKey();
    const apiKey = await this.prisma.apiKey.create({
      data: {
        userId,
        name: dto.name?.trim() || '기본 API 키',
        keyPrefix: this.extractPrefix(rawApiKey),
        keyHash: this.hashApiKey(rawApiKey),
      },
    });

    return {
      apiKey: rawApiKey,
      key: this.toSummary(apiKey),
    };
  }

  async list(userId: number) {
    const keys = await this.prisma.apiKey.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });

    return {
      keys: keys.map((key) => this.toSummary(key)),
    };
  }

  async reissue(userId: number, apiKeyId: number) {
    const current = await this.prisma.apiKey.findFirst({
      where: { id: apiKeyId, userId },
    });
    if (!current) {
      throw new NotFoundException('API 키를 찾을 수 없습니다.');
    }
    if (current.revokedAt) {
      throw new BadRequestException('폐기된 API 키는 재발급할 수 없습니다.');
    }

    const rawApiKey = this.buildRawApiKey();
    const now = new Date();

    const created = await this.prisma.$transaction(async (tx) => {
      const next = await tx.apiKey.create({
        data: {
          userId,
          name: current.name,
          keyPrefix: this.extractPrefix(rawApiKey),
          keyHash: this.hashApiKey(rawApiKey),
        },
      });
      await tx.apiKey.update({
        where: { id: current.id },
        data: { revokedAt: now },
      });
      return next;
    });

    return {
      apiKey: rawApiKey,
      key: this.toSummary(created),
      replacedKeyId: current.id,
    };
  }

  async revoke(userId: number, apiKeyId: number) {
    const current = await this.prisma.apiKey.findFirst({
      where: { id: apiKeyId, userId },
    });
    if (!current) {
      throw new NotFoundException('API 키를 찾을 수 없습니다.');
    }
    if (current.revokedAt) {
      return {
        key: this.toSummary(current),
        message: '이미 폐기된 API 키입니다.',
      };
    }

    const updated = await this.prisma.apiKey.update({
      where: { id: current.id },
      data: { revokedAt: new Date() },
    });

    return {
      key: this.toSummary(updated),
      message: 'API 키가 폐기되었습니다.',
    };
  }

  async validate(rawApiKey: string) {
    const parsed = this.parseRawApiKey(rawApiKey);
    if (!parsed) {
      return null;
    }

    const key = await this.prisma.apiKey.findFirst({
      where: {
        keyPrefix: parsed.prefix,
        revokedAt: null,
      },
      include: {
        user: true,
      },
    });
    if (!key) {
      return null;
    }
    if (!this.matchesHash(rawApiKey, key.keyHash)) {
      return null;
    }

    await this.prisma.apiKey.update({
      where: { id: key.id },
      data: { lastUsedAt: new Date() },
    });

    return key.user;
  }

  private buildRawApiKey() {
    const prefix = randomBytes(8).toString('hex');
    const secret = randomBytes(32).toString('hex');
    return `sbk_${prefix}.${secret}`;
  }

  private extractPrefix(rawApiKey: string) {
    const parsed = this.parseRawApiKey(rawApiKey);
    if (!parsed) {
      throw new BadRequestException('API 키 형식이 올바르지 않습니다.');
    }
    return parsed.prefix;
  }

  private parseRawApiKey(rawApiKey: string) {
    if (!rawApiKey?.startsWith('sbk_')) {
      return null;
    }

    const body = rawApiKey.slice(4);
    const [prefix, secret] = body.split('.');
    if (!prefix || !secret) {
      return null;
    }

    return { prefix, secret };
  }

  private hashApiKey(rawApiKey: string) {
    return createHash('sha256').update(rawApiKey).digest('hex');
  }

  private matchesHash(rawApiKey: string, storedHash: string) {
    const nextHash = Buffer.from(this.hashApiKey(rawApiKey), 'hex');
    const currentHash = Buffer.from(storedHash, 'hex');
    if (nextHash.length !== currentHash.length) {
      return false;
    }
    return timingSafeEqual(nextHash, currentHash);
  }

  private toSummary(apiKey: ApiKey): ApiKeySummary {
    return {
      id: apiKey.id,
      name: apiKey.name,
      keyPrefix: apiKey.keyPrefix,
      isActive: !apiKey.revokedAt,
      lastUsedAt: apiKey.lastUsedAt ? apiKey.lastUsedAt.toISOString() : null,
      revokedAt: apiKey.revokedAt ? apiKey.revokedAt.toISOString() : null,
      createdAt: apiKey.createdAt.toISOString(),
      updatedAt: apiKey.updatedAt.toISOString(),
    };
  }
}
