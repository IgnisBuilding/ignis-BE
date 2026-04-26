import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  hazards,
  Sensor,
  fire_detection_log,
  building,
  floor,
  apartment,
  camera,
  Alert,
  User,
  Society,
  McpChatSession,
  McpChatMessage,
} from '@app/entities';
import { McpToolsService } from './mcp.tools';
import { McpServerService } from './mcp.server';
import { McpProxyService } from './mcp-proxy.service';
import { McpProxyController } from './mcp-proxy.controller';
import { McpChatSessionRepository } from './mcp-chat-session.repository';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      hazards,
      Sensor,
      fire_detection_log,
      building,
      floor,
      apartment,
      camera,
      Alert,
      User,
      Society,
      McpChatSession,
      McpChatMessage,
    ]),
  ],
  providers: [McpToolsService, McpServerService, McpProxyService, McpChatSessionRepository],
  controllers: [McpProxyController],
  exports: [McpProxyService],
})
export class McpModule {}
