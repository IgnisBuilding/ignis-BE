export type ChatMode = 'normal' | 'emergency';

export interface VoiceMetadata {
  enabled: boolean;
  locale: string;
  priority: 'normal' | 'urgent';
}

export interface OrchestratedChatResponse {
  text: string;
  mode: ChatMode;
  voice: VoiceMetadata;
}

export interface ResolvedContextScope {
  mode: 'global' | 'society' | 'building';
  societyId?: number;
  societyName?: string;
  buildingId?: number;
  buildingName?: string;
}

export interface BuiltContext extends ResolvedContextScope {
  summary: string;
}
