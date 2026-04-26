import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  Sse,
  MessageEvent,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { Roles } from '../decorators/roles.decorator';
import { Role } from '../enums/role.enum';
import {
  ActiveHazardsContextRequestDto,
  McpChatRequestDto,
  McpSessionTitleDto,
  McpToolRequestDto,
  RecentDetectionsRequestDto,
  RiskSummaryRequestDto,
} from './mcp.types';
import { McpProxyService } from './mcp-proxy.service';
import { McpChatSessionRepository } from './mcp-chat-session.repository';

type JwtUser = { userId?: number; role?: string };

@Controller('mcp')
@UseGuards(JwtAuthGuard, RolesGuard)
export class McpProxyController {
  constructor(
    private readonly mcpProxyService: McpProxyService,
    private readonly chatSessionRepo: McpChatSessionRepository,
  ) {}

  // ── AI Chat ─────────────────────────────────────────────────────────────

  @Post('chat')
  @Roles(
    Role.ADMIN, Role.MANAGEMENT, Role.BUILDING_AUTHORITY,
    Role.COMMANDER, Role.FIREFIGHTER, Role.FIREFIGHTER_DISTRICT,
    Role.FIREFIGHTER_STATE, Role.FIREFIGHTER_HQ, Role.RESIDENT,
  )
  async chat(@Body() body: McpChatRequestDto, @Req() req: Request) {
    const user = req.user as JwtUser | undefined;
    const userId = user?.userId;
    try {
      const result = await this.mcpProxyService.chatWithAssistant(
        body.message,
        body.model,
        {
          sessionId: body.sessionId,
          buildingId: body.buildingId,
          societyId: body.societyId,
          scopeLevel: body.scopeLevel,
        },
        userId,
      );
      return { success: true, ...result };
    } catch (error) {
      throw new HttpException(
        { success: false, error: error instanceof Error ? error.message : 'Chat error' },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Sse('chat/stream')
  @Roles(
    Role.ADMIN, Role.MANAGEMENT, Role.BUILDING_AUTHORITY,
    Role.COMMANDER, Role.FIREFIGHTER, Role.FIREFIGHTER_DISTRICT,
    Role.FIREFIGHTER_STATE, Role.FIREFIGHTER_HQ, Role.RESIDENT,
  )
  chatStream(@Body() body: McpChatRequestDto, @Req() req: Request): Observable<MessageEvent> {
    const user = req.user as JwtUser | undefined;
    const userId = user?.userId;

    return from(
      this.mcpProxyService.streamChatWithAssistant(
        body.message,
        body.model,
        {
          sessionId: body.sessionId,
          buildingId: body.buildingId,
          societyId: body.societyId,
          scopeLevel: body.scopeLevel,
        },
        userId,
      ),
    ).pipe(
      map((chunk) => ({
        data: chunk,
      } as MessageEvent)),
    );
  }

  // ── Session management ───────────────────────────────────────────────────

  @Get('sessions')
  @Roles(
    Role.ADMIN, Role.MANAGEMENT, Role.BUILDING_AUTHORITY,
    Role.COMMANDER, Role.FIREFIGHTER, Role.FIREFIGHTER_DISTRICT,
    Role.FIREFIGHTER_STATE, Role.FIREFIGHTER_HQ, Role.RESIDENT,
  )
  async listSessions(@Req() req: Request) {
    const user = req.user as JwtUser | undefined;
    const userId = user?.userId;
    if (!userId) throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    return this.chatSessionRepo.listSessions(userId);
  }

  @Get('sessions/:id/messages')
  @Roles(
    Role.ADMIN, Role.MANAGEMENT, Role.BUILDING_AUTHORITY,
    Role.COMMANDER, Role.FIREFIGHTER, Role.FIREFIGHTER_DISTRICT,
    Role.FIREFIGHTER_STATE, Role.FIREFIGHTER_HQ, Role.RESIDENT,
  )
  async getSessionMessages(@Param('id', ParseUUIDPipe) id: string) {
    const session = await this.chatSessionRepo.findSession(id);
    if (!session) throw new HttpException('Session not found', HttpStatus.NOT_FOUND);
    const messages = await this.chatSessionRepo.getSessionMessages(id);
    return { session, messages };
  }

  @Patch('sessions/:id/title')
  @Roles(
    Role.ADMIN, Role.MANAGEMENT, Role.BUILDING_AUTHORITY,
    Role.COMMANDER, Role.FIREFIGHTER, Role.FIREFIGHTER_DISTRICT,
    Role.FIREFIGHTER_STATE, Role.FIREFIGHTER_HQ, Role.RESIDENT,
  )
  async renameSession(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: McpSessionTitleDto,
  ) {
    const session = await this.chatSessionRepo.findSession(id);
    if (!session) throw new HttpException('Session not found', HttpStatus.NOT_FOUND);
    await this.chatSessionRepo.updateTitle(id, body.title);
    return { success: true };
  }

  @Delete('sessions/:id')
  @Roles(
    Role.ADMIN, Role.MANAGEMENT, Role.BUILDING_AUTHORITY,
    Role.COMMANDER, Role.FIREFIGHTER, Role.FIREFIGHTER_DISTRICT,
    Role.FIREFIGHTER_STATE, Role.FIREFIGHTER_HQ, Role.RESIDENT,
  )
  async deleteSession(@Param('id', ParseUUIDPipe) id: string) {
    const session = await this.chatSessionRepo.findSession(id);
    if (!session) throw new HttpException('Session not found', HttpStatus.NOT_FOUND);
    await this.chatSessionRepo.deleteSession(id);
    return { success: true };
  }

  // ── Legacy tool endpoints ────────────────────────────────────────────────

  @Post('queryRiskSummary')
  @Roles(Role.ADMIN, Role.MANAGEMENT, Role.BUILDING_AUTHORITY, Role.COMMANDER)
  async queryRiskSummary(@Body() body: RiskSummaryRequestDto) {
    return this.execute('query_risk_summary', { ...body });
  }

  @Post('getActiveHazardsContext')
  @Roles(
    Role.ADMIN, Role.MANAGEMENT, Role.BUILDING_AUTHORITY, Role.COMMANDER,
    Role.FIREFIGHTER, Role.FIREFIGHTER_DISTRICT, Role.FIREFIGHTER_STATE, Role.FIREFIGHTER_HQ,
  )
  async getActiveHazardsContext(@Body() body: ActiveHazardsContextRequestDto) {
    return this.execute('get_active_hazards_context', { ...body });
  }

  @Post('getRecentFireDetections')
  @Roles(
    Role.ADMIN, Role.MANAGEMENT, Role.BUILDING_AUTHORITY, Role.COMMANDER,
    Role.FIREFIGHTER, Role.FIREFIGHTER_DISTRICT, Role.FIREFIGHTER_STATE, Role.FIREFIGHTER_HQ,
  )
  async getRecentFireDetections(@Body() body: RecentDetectionsRequestDto) {
    return this.execute('get_recent_fire_detections', { ...body });
  }

  @Post('callTool')
  @Roles(Role.ADMIN)
  async callTool(@Body() body: McpToolRequestDto) {
    return this.execute(body.toolName, body.args);
  }

  private async execute(toolName: string, args?: Record<string, unknown>) {
    try {
      const result = await this.mcpProxyService.callTool(toolName, args);
      return { success: true, toolName, result };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          toolName,
          error: error instanceof Error ? error.message : 'Unexpected MCP proxy error',
        },
        HttpStatus.BAD_GATEWAY,
      );
    }
  }
}
