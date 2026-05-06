import { Injectable } from '@nestjs/common';
import { ChatInputDto } from './dto/chat-input.dto';
import { ChatResponseDto } from './dto/chat-response.dto';
import { AiOrchestratorService } from '../ai/orchestrator/ai-orchestrator.service';

interface AuthUser {
  userId?: number | string;
  role?: string;
}

@Injectable()
export class ChatService {
  constructor(
    private readonly aiOrchestratorService: AiOrchestratorService,
  ) {}

  async chat(
    input: ChatInputDto,
    authUser?: AuthUser,
  ): Promise<ChatResponseDto> {
    return this.aiOrchestratorService.route(input, authUser);
  }

  getJob(jobId: string) {
    return this.aiOrchestratorService.getJob(jobId);
  }
}
