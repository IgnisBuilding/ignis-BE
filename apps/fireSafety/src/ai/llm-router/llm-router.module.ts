import { Module } from '@nestjs/common';
import { McpModule } from '../../mcp/mcp.module';
import { LLMRouterService } from './llm-router.service';

@Module({
  imports: [McpModule],
  providers: [LLMRouterService],
  exports: [LLMRouterService],
})
export class LLMRouterModule {}
