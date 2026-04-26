import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import {
  ResponseCreateParamsNonStreaming,
  ResponseCreateParamsStreaming,
  ResponseStreamEvent,
} from 'openai/resources/responses/responses';
import { McpServerService } from './mcp.server';
import { McpChatContextOptions } from './mcp.types';
import { getAiConfig, LlmProvider } from '../lib/ai-config';
import {
  OPERATOR_SYSTEM_PROMPT,
  RESIDENT_SYSTEM_PROMPT,
  buildPlannerPrompt,
  buildGroundedAnswerPrompt,
} from './ignis-prompts';
import { McpChatSessionRepository } from './mcp-chat-session.repository';

type ChatRole = 'system' | 'user' | 'assistant';

interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  argsSchema: Record<string, string>;
}

interface ToolPlan {
  action: 'respond' | 'tool_call';
  response?: string;
  toolName?: string;
  args?: Record<string, unknown>;
}

export type McpChatStreamChunk =
  | { type: 'session_start'; sessionId: string }
  | { type: 'delta'; content: string }
  | { type: 'is_emergency'; value: boolean }
  | { type: 'complete'; answer: string };

@Injectable()
export class McpProxyService {
  private readonly logger = new Logger(McpProxyService.name);
  private readonly openAIClient: OpenAI | null;
  private readonly llmProvider: LlmProvider;
  private readonly aiConfig = getAiConfig();

  constructor(
    private readonly mcpServerService: McpServerService,
    private readonly chatSessionRepo: McpChatSessionRepository,
  ) {
    this.llmProvider = this.aiConfig.provider;
    const apiKey = this.aiConfig.openAiApiKey;
    this.openAIClient = apiKey ? new OpenAI({ apiKey }) : null;
  }

  private getLlmTimeoutMs(): number {
    return this.aiConfig.llmTimeoutMs;
  }

  async callTool(
    toolName: string,
    args?: Record<string, unknown>,
  ): Promise<unknown> {
    const maxAttempts = this.mcpServerService.getRetryCount() + 1;
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const start = Date.now();
      try {
        const timeoutMs = this.mcpServerService.getToolTimeoutMs();
        const result = await Promise.race([
          this.mcpServerService.callTool(toolName, args),
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error(`Tool timeout after ${timeoutMs}ms`)),
              timeoutMs,
            ),
          ),
        ]);

        this.logger.log(
          JSON.stringify({
            event: 'mcp_tool_call',
            toolName,
            attempt,
            success: true,
            latencyMs: Date.now() - start,
          }),
        );
        return result;
      } catch (error) {
        lastError = error;
        this.logger.warn(
          JSON.stringify({
            event: 'mcp_tool_call',
            toolName,
            attempt,
            success: false,
            latencyMs: Date.now() - start,
            error: error instanceof Error ? error.message : 'Unknown MCP error',
          }),
        );
      }
    }

    throw this.normalizeError(lastError);
  }

  private normalizeError(error: unknown): Error {
    if (error instanceof Error) {
      return new Error(`MCP proxy request failed: ${error.message}`);
    }
    return new Error('MCP proxy request failed');
  }

  async *streamChatWithAssistant(
    message: string,
    model?: string,
    options?: McpChatContextOptions,
    userId?: number,
  ): AsyncGenerator<McpChatStreamChunk> {
    const selectedModel = model || this.getDefaultModelForProvider(this.llmProvider);
    const tools = this.getToolDefinitions();
    const scopedMessage = this.composeScopedMessage(message, options);

    // ── Resolve or create session ───────────────────────────────────────────
    let sessionId = options?.sessionId;
    if (sessionId) {
      const existing = await this.chatSessionRepo.findSession(sessionId);
      if (!existing) sessionId = undefined;
    }
    if (!sessionId) {
      const session = await this.chatSessionRepo.createSession(userId);
      sessionId = session.id;
    }

    yield { type: 'session_start', sessionId };

    // ── Persist user message ────────────────────────────────────────────────
    await this.chatSessionRepo.addMessage(sessionId, 'user', message, {
      scopeLevel: options?.scopeLevel,
      buildingId: options?.buildingId,
      societyId: options?.societyId,
      systemContext: options?.systemContext,
    });
    await this.chatSessionRepo.maybeTitleSession(sessionId, message);

    const allHistory = await this.chatSessionRepo.getRecentMessages(sessionId);
    const history: ChatMessage[] = allHistory.slice(0, -1).map((m) => ({
      role: m.role as ChatRole,
      content: m.content,
    }));

    let fullAnswer = '';
    let finalEmergency = false;

    try {
      const stream = this.executeStreamChatFlow(
        scopedMessage,
        tools,
        selectedModel,
        this.llmProvider,
        options,
        history,
      );

      for await (const chunk of stream) {
        if (chunk.type === 'delta') {
          fullAnswer += chunk.content;
          yield chunk;
        } else if (chunk.type === 'is_emergency') {
          finalEmergency = chunk.value;
          yield chunk;
        }
      }

      await this.chatSessionRepo.addMessage(sessionId, 'assistant', fullAnswer, {
        isEmergency: finalEmergency,
      });
      yield { type: 'complete', answer: fullAnswer };
    } catch (error) {
      this.logger.error(`mcp_stream_failed: ${error.message}`);
      const errorMsg = 'I encountered an error while generating a response.';
      yield { type: 'delta', content: errorMsg };
      await this.chatSessionRepo.addMessage(sessionId, 'assistant', errorMsg);
      yield { type: 'complete', answer: errorMsg };
    }
  }

  async chatWithAssistant(
    message: string,
    model?: string,
    options?: McpChatContextOptions,
    userId?: number,
  ): Promise<{
    answer: string;
    isEmergency: boolean;
    sessionId: string;
    model: string;
    providerUsed: LlmProvider | 'fallback_static';
    fallbackTriggered: boolean;
  }> {
    const selectedModel = model || this.getDefaultModelForProvider(this.llmProvider);
    const tools = this.getToolDefinitions();
    const scopedMessage = this.composeScopedMessage(message, options);

    // ── Resolve or create session ───────────────────────────────────────────
    let sessionId = options?.sessionId;
    if (sessionId) {
      const existing = await this.chatSessionRepo.findSession(sessionId);
      if (!existing) sessionId = undefined; // session not found — create fresh
    }
    if (!sessionId) {
      const session = await this.chatSessionRepo.createSession(userId);
      sessionId = session.id;
    }

    // ── Persist user message ────────────────────────────────────────────────
    await this.chatSessionRepo.addMessage(sessionId, 'user', message, {
      scopeLevel: options?.scopeLevel,
      buildingId: options?.buildingId,
      societyId: options?.societyId,
      systemContext: options?.systemContext,
    });
    await this.chatSessionRepo.maybeTitleSession(sessionId, message);

    // ── Load history (excluding the message just saved) ─────────────────────
    const allHistory = await this.chatSessionRepo.getRecentMessages(sessionId);
    // Drop the last entry (the user message we just added), then map DB rows
    // to ChatMessage — entity role is `string`, LLM layer expects `ChatRole`.
    const history: ChatMessage[] = allHistory.slice(0, -1).map((m) => ({
      role: m.role as ChatRole,
      content: m.content,
    }));

    const preferredProvider = this.llmProvider;
    const fallbackProvider: LlmProvider =
      preferredProvider === 'openai' ? 'ollama' : 'openai';
    const fallbackModel = model || this.getDefaultModelForProvider(fallbackProvider);

    const persist = async (answer: string, isEmergency: boolean) => {
      await this.chatSessionRepo.addMessage(sessionId, 'assistant', answer, { isEmergency });
    };

    try {
      const { answer, isEmergency } = await this.executeChatFlow(
        scopedMessage,
        tools,
        selectedModel,
        preferredProvider,
        options,
        history,
      );
      this.logger.log(
        `mcp_chat provider=${preferredProvider} fallback=false scope=${options?.scopeLevel || 'global'} isEmergency=${isEmergency}`,
      );
      await persist(answer, isEmergency);
      return { answer, isEmergency, sessionId, model: selectedModel, providerUsed: preferredProvider, fallbackTriggered: false };
    } catch (primaryError) {
      this.logger.warn(
        `mcp_chat primary_failed provider=${preferredProvider} scope=${options?.scopeLevel || 'global'} error=${primaryError instanceof Error ? primaryError.message : 'Unknown error'}`,
      );
    }

    try {
      const { answer, isEmergency } = await this.executeChatFlow(
        scopedMessage,
        tools,
        fallbackModel,
        fallbackProvider,
        options,
        history,
      );
      this.logger.warn(
        `mcp_chat fallback_triggered provider=${fallbackProvider} scope=${options?.scopeLevel || 'global'}`,
      );
      await persist(answer, isEmergency);
      return { answer, isEmergency, sessionId, model: fallbackModel, providerUsed: fallbackProvider, fallbackTriggered: true };
    } catch (fallbackError) {
      this.logger.error(
        `mcp_chat failed_all_providers scope=${options?.scopeLevel || 'global'} error=${fallbackError instanceof Error ? fallbackError.message : 'Unknown error'}`,
      );
      const staticAnswer = 'I am unable to retrieve AI analysis right now. Please continue with established fire safety procedures and verified on-site instructions.';
      await persist(staticAnswer, false);
      return { answer: staticAnswer, isEmergency: false, sessionId, model: fallbackModel, providerUsed: 'fallback_static', fallbackTriggered: true };
    }
  }

  private getDefaultModelForProvider(provider: LlmProvider): string {
    return provider === 'ollama'
      ? this.aiConfig.ollamaModel
      : this.aiConfig.openAiModel;
  }

  private async *executeStreamChatFlow(
    message: string,
    tools: ToolDefinition[],
    selectedModel: string,
    provider: LlmProvider,
    options?: McpChatContextOptions,
    history: ChatMessage[] = [],
  ): AsyncGenerator<{ type: 'delta'; content: string } | { type: 'is_emergency'; value: boolean }> {
    const plan = await this.planToolUsage(message, tools, selectedModel, provider, history);
    const scopedPlan = this.enforceScopedPlan(plan, tools, options);

    if (scopedPlan.action === 'tool_call' && scopedPlan.toolName) {
      const toolResult = await this.callTool(scopedPlan.toolName, scopedPlan.args || {});
      const isEmergency = this.computeIsEmergency(scopedPlan.toolName, toolResult);
      yield { type: 'is_emergency', value: isEmergency };

      const stream = this.runModelStream(
        [
          { role: 'system', content: buildGroundedAnswerPrompt(scopedPlan.toolName, toolResult, isEmergency) },
          ...history,
          { role: 'user', content: message },
        ],
        selectedModel,
        provider,
      );

      for await (const delta of stream) {
        yield { type: 'delta', content: delta };
      }
      return;
    }

    if (scopedPlan.response?.trim()) {
      yield { type: 'delta', content: scopedPlan.response.trim() };
      return;
    }

    yield { type: 'is_emergency', value: false };
    const systemPrompt = options?.scopeLevel === 'building' ? RESIDENT_SYSTEM_PROMPT : OPERATOR_SYSTEM_PROMPT;
    const stream = this.runModelStream(
      [
        { role: 'system', content: systemPrompt },
        ...history,
        { role: 'user', content: message },
      ],
      selectedModel,
      provider,
    );

    for await (const delta of stream) {
      yield { type: 'delta', content: delta };
    }
  }

  private async executeChatFlow(
    message: string,
    tools: ToolDefinition[],
    selectedModel: string,
    provider: LlmProvider,
    options?: McpChatContextOptions,
    history: ChatMessage[] = [],
  ): Promise<{ answer: string; isEmergency: boolean }> {
    const plan = await this.planToolUsage(message, tools, selectedModel, provider, history);
    const scopedPlan = this.enforceScopedPlan(plan, tools, options);

    if (scopedPlan.action === 'tool_call' && scopedPlan.toolName) {
      const toolResult = await this.callTool(scopedPlan.toolName, scopedPlan.args || {});
      const isEmergency = this.computeIsEmergency(scopedPlan.toolName, toolResult);
      const answer = await this.generateGroundedAnswer(
        message, scopedPlan.toolName, toolResult, isEmergency, selectedModel, provider, history,
      );
      return { answer, isEmergency };
    }

    if (scopedPlan.response?.trim()) {
      return { answer: scopedPlan.response.trim(), isEmergency: false };
    }

    const answer = await this.generateDirectAnswer(message, selectedModel, provider, options, history);
    return { answer, isEmergency: false };
  }

  private async chatWithOllama(
    messages: ChatMessage[],
    model: string,
  ): Promise<string> {
    const baseUrl = this.aiConfig.ollamaBaseUrl;
    const controller = new AbortController();
    const timeoutMs = this.getLlmTimeoutMs();
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.aiConfig.ollamaApiKey || ''}`,
        },
        body: JSON.stringify({
          model,
          stream: false,
          messages,
        }),
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`LLM request timed out after ${timeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutHandle);
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama request failed: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as { message?: { content?: string } };
    return data.message?.content?.trim() || 'No response generated.';
  }

  private async generateDirectAnswer(
    message: string,
    selectedModel: string,
    provider?: LlmProvider,
    options?: McpChatContextOptions,
    history: ChatMessage[] = [],
  ): Promise<string> {
    const systemPrompt =
      options?.scopeLevel === 'building' ? RESIDENT_SYSTEM_PROMPT : OPERATOR_SYSTEM_PROMPT;
    const content = await this.runModel(
      [
        { role: 'system', content: systemPrompt },
        ...history,
        { role: 'user', content: message },
      ],
      selectedModel,
      provider,
    );
    return this.normalizeAssistantText(content);
  }

  private async planToolUsage(
    message: string,
    tools: ToolDefinition[],
    selectedModel: string,
    provider?: LlmProvider,
    history: ChatMessage[] = [],
  ): Promise<ToolPlan> {
    const plannerPrompt = buildPlannerPrompt(tools);

    const output = await this.runModel(
      [
        { role: 'system', content: plannerPrompt },
        ...history,
        { role: 'user', content: message },
      ],
      selectedModel,
      provider,
      true,
    );

    const plan = this.extractJson<ToolPlan>(output);
    if (!plan || !plan.action) {
      return { action: 'respond' };
    }

    if (plan.action === 'tool_call') {
      const exists = tools.some((tool) => tool.name === plan.toolName);
      if (!exists) return { action: 'respond' };
      return {
        action: 'tool_call',
        toolName: plan.toolName,
        args: plan.args || {},
      };
    }

    return { action: 'respond', response: plan.response };
  }

  private async generateGroundedAnswer(
    userMessage: string,
    toolName: string,
    toolResult: unknown,
    isEmergency: boolean,
    selectedModel: string,
    provider?: LlmProvider,
    history: ChatMessage[] = [],
  ): Promise<string> {
    const groundedPrompt = buildGroundedAnswerPrompt(toolName, toolResult, isEmergency);

    const response = await this.runModel(
      [
        { role: 'system', content: groundedPrompt },
        ...history,
        { role: 'user', content: userMessage },
      ],
      selectedModel,
      provider,
    );
    return this.normalizeAssistantText(response);
  }

  /**
   * Derive emergency status from tool result data — no extra LLM call required.
   * Flags true only when live data confirms a critical/high-severity hazard is
   * still active or being responded to, or when camera confidence ≥ 0.70.
   */
  private computeIsEmergency(toolName: string, toolResult: unknown): boolean {
    if (!toolResult || typeof toolResult !== 'object') return false;
    const result = toolResult as Record<string, unknown>;

    if (toolName === 'get_active_hazards_context') {
      const hazards = result['hazards'];
      if (!Array.isArray(hazards)) return false;
      return hazards.some(
        (h: Record<string, unknown>) =>
          ['critical', 'high'].includes(String(h['severity'])) &&
          ['active', 'responding'].includes(String(h['status'])),
      );
    }

    if (toolName === 'query_risk_summary') {
      return Number(result['activeHazards']) > 0 && Number(result['alertSensors']) > 0;
    }

    if (toolName === 'get_active_alerts') {
      const alerts = result['alerts'];
      if (!Array.isArray(alerts)) return false;
      return alerts.some(
        (a: Record<string, unknown>) =>
          String(a['severity']) === 'critical' && String(a['status']) === 'active',
      );
    }

    if (toolName === 'get_recent_fire_detections') {
      const detections = result['detections'];
      if (!Array.isArray(detections)) return false;
      return detections.some((d: Record<string, unknown>) => Number(d['confidence']) >= 0.7);
    }

    return false;
  }

  private async runModel(
    messages: ChatMessage[],
    selectedModel: string,
    provider?: LlmProvider,
    jsonMode = false,
  ): Promise<string> {
    const selectedProvider = provider || this.llmProvider;

    if (selectedProvider === 'ollama') {
      const ollamaMessages = jsonMode
        ? messages.map((m, i) =>
          i === 0 && m.role === 'system'
            ? { ...m, content: `${m.content}\n\nYou MUST respond with valid JSON only. No markdown, no prose, no code fences.` }
            : m,
        )
        : messages;
      return this.chatWithOllama(ollamaMessages, selectedModel);
    }

    if (!this.openAIClient) {
      throw new Error(
        'OpenAI is not configured. Set OPENAI_API_KEY in backend environment.',
      );
    }

    const createOptions: ResponseCreateParamsNonStreaming = {
      model: selectedModel,
      input: messages,
      stream: false,
      ...(jsonMode ? { text: { format: { type: 'json_object' as const } } } : {}),
    };

    const response = await this.withTimeout(
      this.openAIClient.responses.create(createOptions),
      this.getLlmTimeoutMs(),
    );
    return response.output_text || '';
  }

  private async *runModelStream(
    messages: ChatMessage[],
    selectedModel: string,
    provider?: LlmProvider,
  ): AsyncGenerator<string> {
    const selectedProvider = provider || this.llmProvider;

    // Ollama streaming not implemented in this quick pass, falling back to non-stream for Ollama
    if (selectedProvider === 'ollama') {
      const result = await this.chatWithOllama(messages, selectedModel);
      yield result;
      return;
    }

    if (!this.openAIClient) {
      yield 'OpenAI not configured.';
      return;
    }

    const createOptions: ResponseCreateParamsStreaming = {
      model: selectedModel,
      input: messages,
      stream: true,
    };

    const stream = await this.openAIClient.responses.create(createOptions);

    for await (const event of stream) {
      if (event.type === 'response.output_text.delta') {
        yield event.delta;
      }
    }
  }

  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
  ): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        setTimeout(
          () => reject(new Error(`LLM request timed out after ${timeoutMs}ms`)),
          timeoutMs,
        );
      }),
    ]);
  }

  private composeScopedMessage(
    message: string,
    options?: McpChatContextOptions,
  ): string {
    const lines: string[] = [];
    if (options?.scopeLevel) lines.push(`Scope level: ${options.scopeLevel}`);
    if (options?.buildingId) lines.push(`Building ID: ${options.buildingId}`);
    if (options?.societyId) lines.push(`Society ID: ${options.societyId}`);
    if (options?.systemContext?.trim()) {
      lines.push(`System context: ${options.systemContext.trim()}`);
    }
    if (!lines.length) return message;
    return `${lines.join('\n')}\n\n${message}`;
  }

  private enforceScopedPlan(
    plan: ToolPlan,
    tools: ToolDefinition[],
    options?: McpChatContextOptions,
  ): ToolPlan {
    if (plan.action !== 'tool_call' || !plan.toolName) return plan;

    const tool = tools.find((item) => item.name === plan.toolName);
    const args: Record<string, unknown> = { ...(plan.args || {}) };

    if (options?.buildingId) {
      const supportsBuildingId = Boolean(tool?.argsSchema?.['buildingId']);
      if (!supportsBuildingId) {
        return {
          action: 'respond',
          response:
            'I cannot safely run a scoped live query for this request with the current building scope. Please ask for a scoped risk or hazard summary.',
        };
      }
      if (args['buildingId'] === undefined || args['buildingId'] === null) {
        args['buildingId'] = options.buildingId;
      }
    } else if (options?.scopeLevel === 'society' && options.societyId) {
      const supportsSociety = Boolean(tool?.argsSchema?.['societyId']);
      if (!supportsSociety) {
        return {
          action: 'respond',
          response:
            'Society-scoped live data is not directly available for this tool, so I cannot run a safe scoped query.',
        };
      }
      if (args['societyId'] === undefined || args['societyId'] === null) {
        args['societyId'] = options.societyId;
      }
    }

    return { ...plan, args };
  }

  private getToolDefinitions(): ToolDefinition[] {
    return [
      {
        name: 'query_risk_summary',
        description:
          'Get aggregate hazard and sensor counts (total, active, resolved, alert sensors) for one building or all buildings. Use when the user asks for an overall risk overview, risk count, or how many active hazards exist.',
        argsSchema: { buildingId: 'number (optional)' },
      },
      {
        name: 'get_active_hazards_context',
        description:
          'Return a list of active, pending, and responding hazards with type, severity, status, and timestamps. Use when the user asks what hazards are active, what is currently on fire, or what emergencies are ongoing.',
        argsSchema: { buildingId: 'number (optional)', limit: 'number (optional, max 100)' },
      },
      {
        name: 'get_recent_fire_detections',
        description:
          'Return recent camera-based fire detection events with confidence scores and timestamps. Use when the user asks about recent fire detections, camera events, or detection history.',
        argsSchema: { limit: 'number (optional, max 100)', buildingName: 'string (optional)' },
      },
      {
        name: 'get_building_info',
        description:
          'Get structural details for a building: address, building type, floor count, and floor plan availability. Use when the user asks about a building by name or wants to know its physical details.',
        argsSchema: { buildingName: 'string' },
      },
      {
        name: 'get_sensors_for_building',
        description:
          'Return all sensors (or filtered by type: smoke, gas, heat) for a named building, including status, last reading value, and unit. Use when the user asks about sensor status, smoke detectors, gas sensors, or heat sensors in a specific building.',
        argsSchema: { buildingName: 'string', sensorType: 'string (optional, e.g. smoke, gas, heat)' },
      },
      {
        name: 'get_cameras_for_building',
        description:
          'Return surveillance cameras and their fire-detection status for a named building. Use when the user asks about cameras, surveillance, or which cameras have fire detection enabled.',
        argsSchema: { buildingName: 'string' },
      },
      {
        name: 'get_apartment_info',
        description:
          'Return apartment/unit details including floor level, occupancy status, and owner contact information. Use when the user asks who lives in a unit, about apartment ownership, or needs to reach a resident.',
        argsSchema: { buildingName: 'string', unitNumber: 'string' },
      },
      {
        name: 'get_active_alerts',
        description:
          'Return currently active system alerts with severity and description, system-wide or for a specific building. Use when the user asks about current alerts, alarms, or system warnings.',
        argsSchema: { buildingName: 'string (optional)' },
      },
      {
        name: 'get_society_overview',
        description:
          'Return a summary of a residential society/complex: building count, and per-building active hazard and alert sensor counts. Use when the user asks about a society, gated community, or residential complex.',
        argsSchema: { societyName: 'string' },
      },
      {
        name: 'get_building_sensor_stats',
        description:
          'Return a count breakdown of sensors by status (active, alert, inactive) for a named building. Use when the user wants a quick sensor health summary without individual sensor details.',
        argsSchema: { buildingName: 'string' },
      },
      {
        name: 'respond_to_hazard',
        description:
          'Mark the most recent active or pending hazard in a building as "responding". Use when a responder says they are on their way to, or are responding to, a fire or hazard at a location.',
        argsSchema: { buildingName: 'string', hazardType: 'string (optional)', floorNumber: 'number (optional)' },
      },
      {
        name: 'resolve_hazard',
        description:
          'Mark the most recent active, pending, or responding hazard in a building as "resolved". Use when the user says a fire or hazard has been extinguished, cleared, or resolved.',
        argsSchema: { buildingName: 'string', hazardType: 'string (optional)', floorNumber: 'number (optional)' },
      },
    ];
  }

  private extractJson<T>(content: string): T | null {
    if (!content) return null;
    try {
      return JSON.parse(content) as T;
    } catch {
      const match = content.match(/\{[\s\S]*\}/);
      if (!match) return null;
      try {
        return JSON.parse(match[0]) as T;
      } catch {
        return null;
      }
    }
  }

  private normalizeAssistantText(content: string): string {
    if (!content?.trim()) return 'No response generated.';

    let text = content.trim();

    // Remove common markdown emphasis and heading markers.
    text = text.replace(/\*\*(.*?)\*\*/g, '$1');
    text = text.replace(/\*(.*?)\*/g, '$1');
    text = text.replace(/^#{1,6}\s*/gm, '');
    text = text.replace(/`([^`]+)`/g, '$1');

    // Flatten list-like lines into sentence flow.
    text = text.replace(/^\s*[-*]\s+/gm, '');
    text = text.replace(/^\s*\d+\.\s+/gm, '');

    // Normalize excessive whitespace/newlines.
    text = text.replace(/\n{2,}/g, '\n').trim();
    return text || 'No response generated.';
  }
}
