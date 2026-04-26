import { Module } from '@nestjs/common';
import { ContextModule } from '../context/context.module';
import { SafetyModule } from '../safety/safety.module';
import { PromptBuilderModule } from '../prompt-builder/prompt-builder.module';
import { LLMRouterModule } from '../llm-router/llm-router.module';
import { ChatOrchestratorService } from './chat-orchestrator.service';

@Module({
  imports: [ContextModule, SafetyModule, PromptBuilderModule, LLMRouterModule],
  providers: [ChatOrchestratorService],
  exports: [ChatOrchestratorService],
})
export class OrchestratorModule {}
