import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { McpChatSession } from './mcp_chat_session.entity';

@Entity('mcp_chat_messages')
export class McpChatMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'session_id', type: 'uuid' })
  sessionId: string;

  @Column({ type: 'varchar', length: 50 })
  role: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => McpChatSession, session => session.messages, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'session_id' })
  session: McpChatSession;
}
