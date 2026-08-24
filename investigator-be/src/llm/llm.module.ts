import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LLM_PROVIDER, LlmProvider } from '@/llm/llm.types';
import { BedrockLlmProvider } from '@/llm/providers/bedrock.provider';
import { FakeLlmProvider } from '@/llm/providers/fake.provider';
import { LlmCostTracker } from '@/llm/llm.cost';

/**
 * Selects the LLM provider once, at boot.
 *
 * Resolution order:
 *   1. LLM_PROVIDER=fake|bedrock  — explicit override, always wins.
 *   2. AWS credentials present    — use Bedrock.
 *   3. otherwise                  — use the offline fake.
 *
 * Defaulting to the fake rather than crashing is deliberate: a fresh clone
 * with no .env should still boot, serve the UI, and run a full investigation
 * so the project can be evaluated without anyone provisioning cloud access.
 */
@Global()
@Module({
  providers: [
    BedrockLlmProvider,
    {
      provide: FakeLlmProvider,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => new FakeLlmProvider(config),
    },
    LlmCostTracker,
    {
      provide: LLM_PROVIDER,
      inject: [ConfigService, BedrockLlmProvider, FakeLlmProvider],
      useFactory: (
        config: ConfigService,
        bedrock: BedrockLlmProvider,
        fake: FakeLlmProvider,
      ): LlmProvider => {
        const logger = new Logger('LlmModule');
        const override = config.get<string>('LLM_PROVIDER')?.toLowerCase();

        if (override === 'fake') {
          logger.log('LLM provider: fake (forced by LLM_PROVIDER=fake)');
          return fake;
        }
        if (override === 'bedrock') {
          logger.log('LLM provider: bedrock (forced by LLM_PROVIDER=bedrock)');
          return bedrock;
        }

        const hasCreds =
          Boolean(config.get<string>('AWS_ACCESS_KEY_ID')) &&
          Boolean(config.get<string>('AWS_SECRET_ACCESS_KEY')) &&
          Boolean(config.get<string>('AWS_REGION'));

        if (hasCreds) {
          logger.log('LLM provider: bedrock (AWS credentials detected)');
          return bedrock;
        }

        logger.warn(
          'LLM provider: fake — no AWS credentials found. Investigations will ' +
            'run the full tool loop offline and cite real lines, but no model ' +
            'is consulted. Set AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / ' +
            'AWS_REGION for live answers.',
        );
        return fake;
      },
    },
  ],
  exports: [LLM_PROVIDER, LlmCostTracker],
})
export class LlmModule {}
