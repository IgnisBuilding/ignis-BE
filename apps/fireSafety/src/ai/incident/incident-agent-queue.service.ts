import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import Redis from 'ioredis';
import { Repository } from 'typeorm';
import { McpChatMessage, McpChatSession, Notification } from '@app/entities';

interface DetectionPayload {
  camera_id: string;
  bbox: number[];
  confidence: number;
  label: string;
  timestamp: string;
}

interface IncidentJob {
  hazardId: number;
  severity: string;
  chatMessage: string;
  chatContext: Record<string, unknown>;
  detectionEvents: DetectionPayload[];
  frame_b64?: string; // Base64-encoded JPEG for VLM reasoning in ignis-AI
}

interface AgentDecision {
  summary?: string;
  confidence?: number;
  severity?: number;
  rationale?: string;
}

interface AgenticAiResponse {
  decision?: AgentDecision;
  notification?: {
    sent: boolean;
    channel?: string;
    detail: string;
  };
  degraded_mode?: boolean;
  degraded_reason?: string | null;
}

@Injectable()
export class IncidentAgentQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IncidentAgentQueueService.name);
  private readonly queueKey = 'ignis:incident:jobs';
  private readonly aiTimeoutMs = Number(process.env.IGNIS_AI_TIMEOUT_MS || 60000);
  private readonly aiMaxAttempts = Number(process.env.IGNIS_AI_MAX_ATTEMPTS || 3);
  private redisClient: Redis | null = null;
  private redisWorker: Redis | null = null;
  private running = false;

  constructor(
    @InjectRepository(McpChatSession)
    private readonly sessionRepo: Repository<McpChatSession>,
    @InjectRepository(McpChatMessage)
    private readonly messageRepo: Repository<McpChatMessage>,
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
  ) {}

  async onModuleInit(): Promise<void> {
    const redisHost = process.env.REDIS_HOST || 'localhost';
    const redisPort = Number(process.env.REDIS_PORT || 6379);

    this.redisClient = new Redis({ host: redisHost, port: redisPort, lazyConnect: true });
    this.redisWorker = new Redis({ host: redisHost, port: redisPort, lazyConnect: true });

    await this.redisClient.connect();
    await this.redisWorker.connect();
    this.running = true;
    this.processLoop().catch((error: unknown) => {
      this.logger.error(`Incident queue loop crashed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    });
    this.logger.log(`Incident queue ready on redis://${redisHost}:${redisPort}`);
  }

  async onModuleDestroy(): Promise<void> {
    this.running = false;
    await this.redisClient?.quit();
    await this.redisWorker?.quit();
  }

  async enqueue(job: IncidentJob): Promise<void> {
    if (!this.redisClient) {
      this.logger.warn('Incident queue not initialized; skipping enqueue.');
      return;
    }
    await this.redisClient.lpush(this.queueKey, JSON.stringify(job));
  }

  private async processLoop(): Promise<void> {
    while (this.running && this.redisWorker) {
      try {
        const result = await this.redisWorker.brpop(this.queueKey, 2);
        if (!result || result.length < 2) continue;
        const payload = JSON.parse(result[1]) as IncidentJob;
        await this.processJob(payload);
      } catch (error: unknown) {
        this.logger.warn(`Incident queue processing error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  }

  private async processJob(job: IncidentJob): Promise<void> {
    let aiResponse: AgenticAiResponse;
    try {
      aiResponse = await this.callIgnisAiWithRetry(job);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown ignis-AI error';
      this.logger.warn(`ignis-AI failed for hazard ${job.hazardId}: ${message}`);
      aiResponse = {
        decision: {
          summary: `Agentic analysis failed for incident ${job.hazardId}. Manual verification required.`,
          confidence: 0,
          severity: 0,
          rationale: message,
        },
        notification: { sent: false, detail: 'ignis-AI request failed.' },
        degraded_mode: true,
        degraded_reason: message,
      };
    }
    const decision = aiResponse?.decision || {};
    const severityFromAi = Number(decision.severity ?? 0);
    await this.persistAiMetadata(job, aiResponse);

    await this.createEscalationNotifications(job, severityFromAi, String(decision.summary || job.chatMessage));
  }

  private async persistAiMetadata(job: IncidentJob, aiResponse: AgenticAiResponse): Promise<void> {
    const session = await this.ensureIncidentSession(job.hazardId);
    const decision = aiResponse?.decision || {};
    const content = String(decision.summary || `Incident ${job.hazardId} agentic decision recorded.`);

    const metadata = {
      kind: 'incident_agentic_reasoning',
      hazard_id: job.hazardId,
      hazard_severity: job.severity,
      model: 'ignis-ai',
      chat_context: job.chatContext,
      detection_events: job.detectionEvents,
      decision,
      notification: aiResponse?.notification || null,
      degraded_mode: Boolean(aiResponse?.degraded_mode),
      degraded_reason: aiResponse?.degraded_reason || null,
      processed_at: new Date().toISOString(),
    };

    const message = this.messageRepo.create({
      sessionId: session.id,
      role: 'assistant',
      content,
      metadata,
    });
    await this.messageRepo.save(message);
    await this.sessionRepo.update(session.id, { updatedAt: new Date() });
  }

  private async ensureIncidentSession(hazardId: number): Promise<McpChatSession> {
    const title = `Incident #${hazardId}`;
    const existing = await this.sessionRepo.findOne({
      where: { userId: null, title },
      order: { updatedAt: 'DESC' },
    });
    if (existing) return existing;

    const session = this.sessionRepo.create({
      userId: null,
      title,
    });
    return this.sessionRepo.save(session);
  }

  private async callIgnisAiWithRetry(job: IncidentJob): Promise<AgenticAiResponse> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= this.aiMaxAttempts; attempt += 1) {
      try {
        return await this.callIgnisAi(job);
      } catch (error) {
        lastError = error;
        this.logger.warn(
          `ignis-AI attempt ${attempt}/${this.aiMaxAttempts} failed for hazard ${job.hazardId}: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`,
        );
        if (attempt < this.aiMaxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, attempt * 500));
        }
      }
    }
    throw lastError instanceof Error ? lastError : new Error('ignis-AI request failed');
  }

  private async callIgnisAi(job: IncidentJob): Promise<AgenticAiResponse> {
    const base = process.env.IGNIS_AI_URL || 'http://localhost:5551';
    const url = `${base.replace(/\/$/, '')}/v1/agentic/respond`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.aiTimeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_message: job.chatMessage,
          chat_context: job.chatContext,
          detection_events: job.detectionEvents,
          frame_b64: job.frame_b64 ?? null,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`ignis-AI returned ${response.status}`);
      }
      return response.json() as Promise<AgenticAiResponse>;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`ignis-AI request timed out after ${this.aiTimeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async createEscalationNotifications(
    job: IncidentJob,
    aiSeverity: number,
    summary: string,
  ): Promise<void> {
    const channels = this.resolveRoleTargets(job.severity, aiSeverity);
    const priority = aiSeverity >= 0.9 ? 'urgent' : aiSeverity >= 0.75 ? 'high' : 'medium';

    for (const roleTarget of channels) {
      const notification = this.notificationRepo.create({
        title: `Fire incident escalation (${roleTarget})`,
        type: 'fire_alert',
        message: summary,
        priority,
        roleTarget,
        userId: null,
      });
      await this.notificationRepo.save(notification);
    }
  }

  private resolveRoleTargets(hazardSeverity: string, aiSeverity: number): string[] {
    const normalized = hazardSeverity.toLowerCase();
    if (normalized === 'critical' || aiSeverity >= 0.9) {
      return ['admin', 'building_authority', 'commander', 'firefighter_district'];
    }
    if (normalized === 'high' || aiSeverity >= 0.75) {
      return ['admin', 'building_authority'];
    }
    return ['admin'];
  }
}
