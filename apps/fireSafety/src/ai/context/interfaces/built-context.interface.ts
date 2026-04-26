export interface BuiltContext {
  systemPromptContext: string;
  structuredData: {
    level: 'global' | 'society' | 'building';
    fireStatus: 'none' | 'suspected' | 'confirmed';
    riskSummary: Record<string, unknown>;
    activeIncidents: Array<Record<string, unknown>>;
    recentDetections: Array<Record<string, unknown>>;
    building?: {
      id: number;
      name?: string;
    };
    society?: {
      id: number;
      name?: string;
    };
    timestamp: string;
  };
}
