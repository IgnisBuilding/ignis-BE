import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { McpChatSession, McpChatMessage } from '@app/entities';

/** Maximum conversation history messages loaded per turn (user + assistant pairs). */
const HISTORY_LIMIT = 20;

@Injectable()
export class McpChatSessionRepository {
  private readonly logger = new Logger(McpChatSessionRepository.name);

  constructor(
    @InjectRepository(McpChatSession)
    private readonly sessionRepo: Repository<McpChatSession>,
    @InjectRepository(McpChatMessage)
    private readonly messageRepo: Repository<McpChatMessage>,
  ) {}

  // ── Session CRUD ──────────────────────────────────────────────────────────

  async createSession(userId?: number, title = 'New Chat'): Promise<McpChatSession> {
    const session = this.sessionRepo.create({ userId: userId ?? null, title });
    return this.sessionRepo.save(session);
  }

  async findSession(id: string): Promise<McpChatSession | null> {
    return this.sessionRepo.findOne({ where: { id } });
  }

  async listSessions(userId: number): Promise<McpChatSession[]> {
    return this.sessionRepo.find({
      where: { userId },
      order: { updatedAt: 'DESC' },
    });
  }

  async updateTitle(id: string, title: string): Promise<void> {
    await this.sessionRepo.update(id, { title });
  }

  async deleteSession(id: string): Promise<void> {
    await this.sessionRepo.delete(id);
  }

  // ── Message persistence ───────────────────────────────────────────────────

  async addMessage(
    sessionId: string,
    role: 'user' | 'assistant',
    content: string,
    metadata?: Record<string, unknown>,
  ): Promise<McpChatMessage> {
    const msg = this.messageRepo.create({ sessionId, role, content, metadata: metadata ?? null });
    const saved = await this.messageRepo.save(msg);
    // Bump session updatedAt so listing sorts correctly
    await this.sessionRepo.update(sessionId, { updatedAt: new Date() });
    return saved;
  }

  /**
   * Returns the last HISTORY_LIMIT messages ordered oldest-first so they can
   * be injected directly into a ChatMessage[] array.
   */
  async getRecentMessages(sessionId: string): Promise<McpChatMessage[]> {
    // Fetch the most recent N in DESC order, then reverse to chronological
    const rows = await this.messageRepo.find({
      where: { sessionId },
      order: { createdAt: 'DESC' },
      take: HISTORY_LIMIT,
    });
    return rows.reverse();
  }

  async getSessionMessages(sessionId: string): Promise<McpChatMessage[]> {
    return this.messageRepo.find({
      where: { sessionId },
      order: { createdAt: 'ASC' },
    });
  }

  /**
   * Auto-title a session from the first user message if the title is still default.
   */
  async maybeTitleSession(sessionId: string, firstUserMessage: string): Promise<void> {
    const session = await this.findSession(sessionId);
    if (session && session.title === 'New Chat') {
      const title = firstUserMessage.trim().slice(0, 60);
      await this.updateTitle(sessionId, title || 'New Chat');
    }
  }
}
