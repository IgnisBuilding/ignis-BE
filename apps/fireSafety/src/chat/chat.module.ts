import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { OrchestratorModule } from '../ai/orchestrator/orchestrator.module';

@Module({
  imports: [OrchestratorModule],
  controllers: [ChatController],
  providers: [ChatService],
  exports: [ChatService],
})
export class ChatModule {}
