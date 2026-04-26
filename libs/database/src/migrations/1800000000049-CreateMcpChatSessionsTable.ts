import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateMcpChatSessionsTable1800000000049 implements MigrationInterface {
    name = 'CreateMcpChatSessionsTable1800000000049'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE EXTENSION IF NOT EXISTS "pgcrypto";

            CREATE TABLE mcp_chat_sessions (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id INTEGER,
                title VARCHAR(255) DEFAULT 'New Chat',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );

            CREATE TABLE mcp_chat_messages (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                session_id UUID NOT NULL REFERENCES mcp_chat_sessions(id) ON DELETE CASCADE,
                role VARCHAR(50) NOT NULL,
                content TEXT NOT NULL,
                metadata JSONB,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );

            CREATE INDEX idx_chat_messages_session_id ON mcp_chat_messages(session_id);
            CREATE INDEX idx_chat_sessions_user_id ON mcp_chat_sessions(user_id);
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DROP TABLE mcp_chat_messages;
            DROP TABLE mcp_chat_sessions;
        `);
    }
}
