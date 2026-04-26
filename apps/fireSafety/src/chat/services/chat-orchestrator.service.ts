import { Injectable, Logger } from '@nestjs/common';
import { ChatRequestDto } from '../dto/chat.dto';
import { LLMRouterService } from './llm-router.service';
import { PromptBuilderService } from './prompt-builder.service';
import { SafetyEngineService } from './safety-engine.service';
import { ContextBuilderService } from './context-builder.service';
import { OrchestratedChatResponse } from '../chat.types';

interface AuthUser {
  userId?: number;
  role?: string;
}

@Injectable()
export class ChatOrchestratorService {
  private readonly logger = new Logger(ChatOrchestratorService.name);

  constructor(
    private readonly safetyEngineService: SafetyEngineService,
    private readonly contextBuilderService: ContextBuilderService,
    private readonly promptBuilderService: PromptBuilderService,
    private readonly llmRouterService: LLMRouterService,
  ) {}

  async chat(
    input: ChatRequestDto,
    authUser?: AuthUser,
  ): Promise<OrchestratedChatResponse> {
    try {
      const context = await this.contextBuilderService.build(input, authUser);
      const safetyDecision = await this.safetyEngineService.evaluate(context);
      const prompt = this.promptBuilderService.build(
        input,
        context,
        safetyDecision.mode,
      );
      const text = await this.llmRouterService.route(prompt, input.model);

      return {
        text,
        mode: safetyDecision.mode,
        voice: {
          enabled: true,
          locale: 'en-IN',
          priority: safetyDecision.mode === 'emergency' ? 'urgent' : 'normal',
        },
      };
    } catch (error) {
      this.logger.warn(
        `Chat orchestration fallback triggered: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return {
        text: 'I am unable to fetch full AI context right now. Follow standard fire safety protocol, verify on-site sensor alerts, and contact emergency services immediately if there is any active fire risk.',
        mode: 'normal',
        voice: {
          enabled: true,
          locale: 'en-IN',
          priority: 'normal',
        },
      };
    }
  }
}
