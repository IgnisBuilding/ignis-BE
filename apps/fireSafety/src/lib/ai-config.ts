export type LlmProvider = 'openai' | 'ollama';
export type McpTransport = 'none' | 'stdio';

export interface AiConfig {
  provider: LlmProvider;
  mcpTransport: McpTransport;
  openAiApiKey?: string;
  openAiModel: string;
  ollamaApiKey?: string;
  ollamaBaseUrl: string;
  ollamaModel: string;
  llmTimeoutMs: number;
  mcpToolTimeoutMs: number;
  mcpRetryCount: number;
}

function parsePositiveInt(
  value: string | undefined,
  defaultValue: number,
): number {
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) || parsed <= 0 ? defaultValue : parsed;
}

function parseProvider(value: string | undefined): LlmProvider {
  return value?.toLowerCase() === 'ollama' ? 'ollama' : 'openai';
}

function parseTransport(value: string | undefined): McpTransport {
  return value === 'stdio' ? 'stdio' : 'none';
}

let cachedConfig: AiConfig | null = null;

export function getAiConfig(): AiConfig {
  if (cachedConfig) return cachedConfig;

  cachedConfig = {
    provider: parseProvider(process.env.LLM_PROVIDER),
    mcpTransport: parseTransport(process.env.MCP_TRANSPORT),
    openAiApiKey: process.env.OPENAI_API_KEY,
    openAiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    ollamaApiKey: process.env.OLLAMA_API_KEY,
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL || '',
    ollamaModel: process.env.OLLAMA_MODEL || 'gemma4:31b',
    llmTimeoutMs: parsePositiveInt(process.env.LLM_TIMEOUT_MS, 30000),
    mcpToolTimeoutMs: parsePositiveInt(process.env.MCP_TOOL_TIMEOUT_MS, 15000),
    mcpRetryCount: parsePositiveInt(process.env.MCP_RETRY_COUNT, 1),
  };

  return cachedConfig;
}

export function validateAiConfig(config = getAiConfig()): void {
  if (config.provider === 'openai' && !config.openAiApiKey) {
    throw new Error(
      'Invalid AI configuration: OPENAI_API_KEY is required when LLM_PROVIDER=openai.',
    );
  }

  if (config.provider === 'ollama' && !config.ollamaBaseUrl) {
    throw new Error(
      'Invalid AI configuration: OLLAMA_BASE_URL is required when LLM_PROVIDER=ollama.',
    );
  }
}
