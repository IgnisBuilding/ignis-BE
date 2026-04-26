import { Injectable } from '@nestjs/common';
import { ChatInputDto } from './dto/chat-input.dto';
import { ChatResponseDto } from './dto/chat-response.dto';
import { ChatOrchestratorService } from '../ai/orchestrator/chat-orchestrator.service';

interface AuthUser {
  userId?: number | string;
  role?: string;
}

@Injectable()
export class ChatService {
  constructor(
    private readonly chatOrchestratorService: ChatOrchestratorService,
  ) {}

  async chat(
    input: ChatInputDto,
    authUser?: AuthUser,
  ): Promise<ChatResponseDto> {
    return this.chatOrchestratorService.orchestrate(input, authUser);
  }
}
