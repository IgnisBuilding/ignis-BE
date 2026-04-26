import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { McpChatMessage } from './mcp_chat_message.entity';

@Entity('mcp_chat_sessions')
export class McpChatSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'int', nullable: true })
  userId: number | null;

  @Column({ type: 'varchar', length: 255, default: 'New Chat' })
  title: string;

  @OneToMany(() => McpChatMessage, message => message.session)
  messages: McpChatMessage[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
