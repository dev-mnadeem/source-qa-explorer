import { INestApplication, ValidationPipe } from '@nestjs/common';

/**
 * HTTP behaviour shared by the server and the e2e tests, so the tests
 * exercise the same prefix and validation rules that production serves.
 */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
}
