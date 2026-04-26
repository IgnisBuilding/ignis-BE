export interface ResolvedScope {
  level: 'global' | 'society' | 'building';
  buildingId?: number;
  societyId?: number;
  buildingName?: string;
  societyName?: string;
  source: 'input_id' | 'input_name' | 'user_default' | 'auto_resolver';
}
