import { Injectable, Logger } from '@nestjs/common';
import { McpProxyService } from '../../mcp/mcp-proxy.service';
import { BuiltContext, ChatMode } from '../chat.types';

interface SafetyDecision {
  mode: ChatMode;
  reason: string;
}

@Injectable()
export class SafetyEngineService {
  private readonly logger = new Logger(SafetyEngineService.name);

  constructor(private readonly mcpProxyService: McpProxyService) {}

  async evaluate(context: BuiltContext): Promise<SafetyDecision> {
    try {
      const riskSummary = (await this.mcpProxyService.callTool(
        'query_risk_summary',
        {
          buildingId: context.buildingId,
        },
      )) as { activeHazards?: number; alertSensors?: number };

      const activeHazards = Number(riskSummary?.activeHazards || 0);
      const alertSensors = Number(riskSummary?.alertSensors || 0);

      const emergency = activeHazards > 0 || alertSensors > 0;
      return {
        mode: emergency ? 'emergency' : 'normal',
        reason: emergency
          ? `Detected active hazards (${activeHazards}) or alert sensors (${alertSensors}).`
          : 'No active hazards or alert sensors detected.',
      };
    } catch (error) {
      this.logger.warn(
        `Safety evaluation failed, defaulting to safe mode. ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return {
        mode: 'normal',
        reason:
          'Safety data unavailable; using conservative normal response mode.',
      };
    }
  }
}
