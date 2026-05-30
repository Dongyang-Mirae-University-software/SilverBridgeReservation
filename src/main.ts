import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

function resolveCorsOrigins(): boolean | string[] {
  const raw = process.env.CORS_ORIGINS?.trim();
  if (raw === '*' || raw?.toLowerCase() === 'true') {
    return true;
  }
  if (raw) {
    return raw.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return [
    'https://reservation.dmu.gosky.kr',
    'https://testai.gosky.kr',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:6015',
    'http://127.0.0.1:6015',
    'http://localhost:6018',
    'http://127.0.0.1:6018',
    'https://localhost:6018',
  ];
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: resolveCorsOrigins(), credentials: true });
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());

  const config = new DocumentBuilder()
    .setTitle('SilverBridge Reservation API')
    .setDescription('병원 예약 더미 API (MedGemma/MCP 연동용)')
    .setVersion('0.1')
    .addBearerAuth()
    .addApiKey({ type: 'apiKey', in: 'header', name: 'X-API-Key' }, 'api-key')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  const port = process.env.PORT ?? 6015;
  await app.listen(port);
}

bootstrap();
