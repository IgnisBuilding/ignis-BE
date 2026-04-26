import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { McpToolsService } from './mcp.tools';
import { getAiConfig } from '../lib/ai-config';

@Injectable()
export class McpServerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(McpServerService.name);
  private readonly config = getAiConfig();
  private server: McpServer;
  private stdioTransport: StdioServerTransport | null = null;

  constructor(private readonly mcpToolsService: McpToolsService) {}

  async onModuleInit(): Promise<void> {
    this.server = new McpServer({
      name: 'ignis-fire-safety-mcp',
      version: '1.0.0',
    });

    this.mcpToolsService.registerTools(this.server);
    this.logger.log('MCP tools registered successfully');

    if (this.config.mcpTransport === 'stdio') {
      this.stdioTransport = new StdioServerTransport();
      await this.server.connect(this.stdioTransport);
      this.logger.log('MCP stdio transport connected');
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.stdioTransport) {
      await this.stdioTransport.close();
      this.logger.log('MCP stdio transport closed');
    }
  }

  async callTool(
    toolName: string,
    args?: Record<string, unknown>,
  ): Promise<unknown> {
    return this.mcpToolsService.executeTool(toolName, args);
  }

  getToolTimeoutMs(): number {
    return this.config.mcpToolTimeoutMs;
  }

  getRetryCount(): number {
    return this.config.mcpRetryCount;
  }
}
