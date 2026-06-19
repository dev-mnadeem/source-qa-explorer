import { AnthropicBedrock } from '@anthropic-ai/bedrock-sdk';
import { Logger, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Provides } from '@/shared/constants';

/**
 * Returns an AnthropicBedrock client. Credentials are read lazily at boot,
 * so the app can start without AWS env vars present — calls only fail when
 * an actual request is made (so health/sessions endpoints stay usable).
 *
 * The SDK auto-reads AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY,
 * AWS_SESSION_TOKEN, and AWS_REGION from the environment if not passed
 * explicitly, but we wire them through ConfigService for clarity.
 */
export const AnthropicProvider: Provider = {
  provide: Provides.Anthropic,
  inject: [ConfigService],
  useFactory: (config: ConfigService): AnthropicBedrock => {
    const logger = new Logger('AnthropicProvider');
    const awsAccessKey = config.get<string>('AWS_ACCESS_KEY_ID');
    const awsSecretKey = config.get<string>('AWS_SECRET_ACCESS_KEY');
    const awsRegion = config.get<string>('AWS_REGION');

    if (!awsAccessKey || !awsSecretKey || !awsRegion) {
      logger.warn(
        'AWS Bedrock credentials are not fully configured. Agent / audit calls will fail until AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_REGION are set.',
      );
    }

    return new AnthropicBedrock({
      awsAccessKey: awsAccessKey ?? '',
      awsSecretKey: awsSecretKey ?? '',
      awsRegion: awsRegion ?? 'us-east-1',
    });
  },
};
