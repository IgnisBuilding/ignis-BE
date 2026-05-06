import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ChatInputDto } from '../../chat/dto/chat-input.dto';
import { ChatResponseDto } from '../../chat/dto/chat-response.dto';
import { ChatOrchestratorService } from './chat-orchestrator.service';

interface AuthUser {
  userId?: number | string;
  role?: string;
}

type JobStatus = 'queued' | 'processing' | 'completed' | 'failed';

interface AiJobRecord {
  id: string;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
  payload: ChatInputDto;
  result?: ChatResponseDto;
  error?: string;
}

@Injectable()
export class AiOrchestratorService {
  private readonly logger = new Logger(AiOrchestratorService.name);
  private readonly jobs = new Map<string, AiJobRecord>();

  constructor(
    private readonly chatOrchestratorService: ChatOrchestratorService,
  ) {}

  async route(
    input: ChatInputDto,
    authUser?: AuthUser,
  ): Promise<ChatResponseDto> {
    const mode = this.resolveMode(input);
    if (mode === 'async') {
      const job = this.enqueueJob(input, authUser);
      return {
        text: 'Vision/reasoning task accepted and queued for processing.',
        sessionId: input.sessionId,
        mode: 'normal',
        voice: {
          priority: 'normal',
          language: input.language || 'en',
          text: 'Task queued for AI processing.',
        },
        status: 'queued',
        jobId: job.id,
      };
    }

    const syncResult = await this.chatOrchestratorService.orchestrate(input, authUser);
    return { ...syncResult, sessionId: syncResult.sessionId || input.sessionId, status: 'completed' };
  }

  getJob(jobId: string): AiJobRecord | null {
    return this.jobs.get(jobId) || null;
  }

  private enqueueJob(input: ChatInputDto, authUser?: AuthUser): AiJobRecord {
    const now = new Date().toISOString();
    const record: AiJobRecord = {
      id: randomUUID(),
      status: 'queued',
      createdAt: now,
      updatedAt: now,
      payload: input,
    };

    this.jobs.set(record.id, record);
    this.executeJob(record.id, input, authUser).catch((error: unknown) => {
      this.logger.warn(
        `Async AI job failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    });
    return record;
  }

  private async executeJob(
    jobId: string,
    input: ChatInputDto,
    authUser?: AuthUser,
  ): Promise<void> {
    this.updateJob(jobId, { status: 'processing' });
    try {
      const result = await this.chatOrchestratorService.orchestrate(input, authUser);
      this.updateJob(jobId, {
        status: 'completed',
        result: { ...result, sessionId: result.sessionId || input.sessionId, status: 'completed', jobId },
      });
    } catch (error) {
      this.updateJob(jobId, {
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown async job error',
      });
    }
  }

  private updateJob(jobId: string, patch: Partial<AiJobRecord>): void {
    const current = this.jobs.get(jobId);
    if (!current) return;
    this.jobs.set(jobId, {
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
    });
  }

  private resolveMode(input: ChatInputDto): 'sync' | 'async' {
    if (input.processingMode === 'sync') return 'sync';
    if (input.processingMode === 'async') return 'async';
    return input.taskType === 'vision_reasoning' ? 'async' : 'sync';
  }
}
