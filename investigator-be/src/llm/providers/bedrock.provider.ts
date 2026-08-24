import { AnthropicBedrock } from '@anthropic-ai/bedrock-sdk';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  LlmCompletionRequest,
  LlmCompletionResponse,
  LlmProvider,
} from '@/llm/llm.types';

/**
 * Live provider: Anthropic models hosted on AWS Bedrock.
 *
 * Credentials are read at construction but never asserted — the app must boot
 * without them so that health checks, session listing and the fake-backed demo
 * all keep working. A missing key surfaces as a failed completion, not a
 * failed boot.
 */
@Injectable()
export class BedrockLlmProvider implements LlmProvider {
  readonly name = 'bedrock';
  readonly isLive = true;

  private readonly logger = new Logger(BedrockLlmProvider.name);
  private readonly client: AnthropicBedrock;

  constructor(config: ConfigService) {
    this.client = new AnthropicBedrock({
      awsAccessKey: config.get<string>('AWS_ACCESS_KEY_ID') ?? '',
      awsSecretKey: config.get<string>('AWS_SECRET_ACCESS_KEY') ?? '',
      awsRegion: config.get<string>('AWS_REGION') ?? 'us-east-1',
    });
  }

  async complete(
    request: LlmCompletionRequest,
  ): Promise<LlmCompletionResponse> {
    const response = await this.client.messages.create({
      model: request.model,
      max_tokens: request.maxTokens,
      system: request.system,
      messages: request.messages,
      ...(request.tools ? { tools: request.tools } : {}),
    });

    return {
      content: response.content,
      stopReason: response.stop_reason,
      usage: {
        inputTokens: response.usage?.input_tokens ?? 0,
        outputTokens: response.usage?.output_tokens ?? 0,
      },
    };
  }
}
