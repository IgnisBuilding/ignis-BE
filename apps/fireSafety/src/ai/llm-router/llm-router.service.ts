import { Injectable, Logger } from '@nestjs/common';
import { McpProxyService } from '../../mcp/mcp-proxy.service';
import { ResolvedScope } from '../context/interfaces/resolved-scope.interface';

export interface LLMRouterInput {
  systemPrompt: string;
  userMessage: string;
  scope: ResolvedScope;
  model?: string;
  sessionId?: string;
  userId?: number;
}

export interface LLMRouterOutput {
  text: string;
  sessionId?: string;
}

@Injectable()
export class LLMRouterService {
  private readonly logger = new Logger(LLMRouterService.name);

  constructor(private readonly mcpProxyService: McpProxyService) {}

  async route(input: LLMRouterInput): Promise<LLMRouterOutput> {
    try {
      const result = await this.mcpProxyService.chatWithAssistant(
        input.userMessage,
        input.model,
        {
          scopeLevel: input.scope.level,
          buildingId: input.scope.buildingId,
          societyId: input.scope.societyId,
          systemContext: input.systemPrompt,
          sessionId: input.sessionId,
        },
        input.userId,
      );

      this.logger.log(
        `LLM route completed provider=${result.providerUsed} fallback=${result.fallbackTriggered} scope=${input.scope.level}`,
      );

      return { text: result.answer, sessionId: result.sessionId };
    } catch (error) {
      this.logger.warn(
        `LLM route failed scope=${input.scope.level}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
      return { text: 'I cannot generate a detailed response right now. Please follow standard fire safety protocol and continue with verified on-site instructions.', sessionId: input.sessionId };
    }
  }

  async generate(input: LLMRouterInput): Promise<LLMRouterOutput> {
    return this.route(input);
  }
}
