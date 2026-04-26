import { Injectable, Logger } from '@nestjs/common';
import { ChatInputDto } from '../../chat/dto/chat-input.dto';
import { ChatResponseDto } from '../../chat/dto/chat-response.dto';
import { ScopeResolverService } from '../context/scope-resolver.service';
import { SafetyEngineService } from '../safety/safety-engine.service';
import { ContextBuilderService } from '../context/context-builder.service';
import { PromptBuilderService } from '../prompt-builder/prompt-builder.service';
import { LLMRouterService } from '../llm-router/llm-router.service';

interface AuthUser {
  userId?: number | string;
  role?: string;
}

@Injectable()
export class ChatOrchestratorService {
  private readonly logger = new Logger(ChatOrchestratorService.name);

  constructor(
    private readonly scopeResolverService: ScopeResolverService,
    private readonly safetyEngineService: SafetyEngineService,
    private readonly contextBuilderService: ContextBuilderService,
    private readonly promptBuilderService: PromptBuilderService,
    private readonly llmRouterService: LLMRouterService,
  ) {}

  async orchestrate(
    input: ChatInputDto,
    authUser?: AuthUser,
  ): Promise<ChatResponseDto> {
    const userId = authUser?.userId ?? 0;
    const userRole = (authUser?.role || 'unknown').toLowerCase();
    const language = input.language || 'en';

    try {
      // 1) Resolve scope
      const scope = await this.scopeResolverService.resolve({
        contextMode: input.contextMode,
        buildingId: input.buildingId,
        societyId: input.societyId,
        buildingName: input.buildingName,
        societyName: input.societyName,
        userId,
        userRole,
      });

      // 2) Safety check
      const safetyResult = await this.safetyEngineService.check({
        userId,
        userRole,
        language,
        message: input.message,
        scope,
      });

      // 3) Emergency immediate return
      if (safetyResult.override && safetyResult.response) {
        return {
          text: safetyResult.response.text,
          sessionId: input.sessionId,
          mode: 'emergency',
          voice: {
            priority: 'high',
            language,
            text: this.shortenVoiceText(safetyResult.response.voiceText),
          },
        };
      }

      // 4) Build context
      const builtContext = await this.contextBuilderService.build({
        scope,
        userRole,
        language,
        userId,
      });

      // 5) Build prompts
      const prompts = this.promptBuilderService.build({
        systemContext: builtContext.systemPromptContext,
        userMessage: input.message,
        language,
        userRole,
        scopeLevel: scope.level,
      });

      // 6) LLM route
      const routeResult = await this.llmRouterService.generate({
        systemPrompt: prompts.systemPrompt,
        userMessage: prompts.userPrompt,
        scope,
        sessionId: input.sessionId,
        userId: Number(userId),
      });

      // 7) Map to ChatResponseDto + short voice text
      return {
        text: routeResult.text,
        sessionId: routeResult.sessionId,
        mode: 'normal',
        voice: {
          priority: 'normal',
          language,
          text: this.shortenVoiceText(routeResult.text),
        },
      };
    } catch (error) {
      this.logger.warn(
        `Chat orchestration failed. ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
      return {
        text: 'I cannot complete the full analysis right now. Please follow verified fire-safety protocol and official on-site guidance.',
        sessionId: input.sessionId,
        mode: 'normal',
        voice: {
          priority: 'normal',
          language,
          text: 'Follow verified fire-safety protocol and official on-site guidance.',
        },
      };
    }
  }

  private shortenVoiceText(text: string): string {
    const cleaned = (text || '').replace(/\s+/g, ' ').trim();
    if (!cleaned) return 'No response available.';
    if (cleaned.length <= 220) return cleaned;
    return `${cleaned.slice(0, 217).trimEnd()}...`;
  }
}
