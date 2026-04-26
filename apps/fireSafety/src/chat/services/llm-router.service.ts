import { Injectable } from '@nestjs/common';
import { McpProxyService } from '../../mcp/mcp-proxy.service';

@Injectable()
export class LLMRouterService {
  constructor(private readonly mcpProxyService: McpProxyService) {}

  async route(prompt: string, model?: string): Promise<string> {
    const result = await this.mcpProxyService.chatWithAssistant(prompt, model);
    return result.answer;
  }
}
