import { IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class RiskSummaryRequestDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  buildingId?: number;
}

export class ActiveHazardsContextRequestDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  buildingId?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class RecentDetectionsRequestDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsString()
  buildingName?: string;
}

export class McpToolRequestDto {
  @IsString()
  toolName: string;

  @IsOptional()
  args?: Record<string, unknown>;
}

export interface RiskSummaryResult {
  totalHazards: number;
  activeHazards: number;
  resolvedHazards: number;
  activeSensors: number;
  alertSensors: number;
  generatedAt: string;
}

export interface ActiveHazardsContextResult {
  hazards: Array<{
    id: number;
    type: string;
    severity: string;
    status: string;
    createdAt: string;
    apartmentId?: number;
    roomId?: number;
    floorId?: number;
  }>;
  count: number;
}

export interface RecentDetectionsResult {
  detections: Array<{
    id: number;
    cameraCode: string;
    confidence: number;
    detectedAt: string;
    hazardId?: number;
  }>;
  count: number;
}

export interface McpChatContextOptions {
  sessionId?: string;
  buildingId?: number;
  societyId?: number;
  systemContext?: string;
  scopeLevel?: 'global' | 'society' | 'building';
}

export class McpChatRequestDto {
  @IsString()
  message: string;

  @IsOptional()
  @IsUUID()
  sessionId?: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  buildingId?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  societyId?: number;

  @IsOptional()
  @IsString()
  scopeLevel?: 'global' | 'society' | 'building';
}

export class McpSessionTitleDto {
  @IsString()
  title: string;
}

// ── New tool result interfaces ──────────────────────────────────────────────

export interface BuildingInfoResult {
  found: boolean;
  id?: number;
  name?: string;
  address?: string;
  type?: string;
  totalFloors?: number;
  hasFloorPlan?: boolean;
  societyId?: number;
  message?: string;
}

export interface SensorsForBuildingResult {
  found: boolean;
  buildingName?: string;
  sensors: Array<{
    id: number;
    name: string;
    type: string;
    status: string;
    value?: number;
    unit?: string;
    lastReading?: string;
  }>;
  summary: { total: number; alert: number; active: number; inactive: number };
  message?: string;
}

export interface CamerasForBuildingResult {
  found: boolean;
  buildingName?: string;
  cameras: Array<{
    id: number;
    name: string;
    cameraCode: string;
    status: string;
    isFireDetectionEnabled: boolean;
    floorId?: number;
  }>;
  summary: { total: number; active: number; fireDetectionEnabled: number };
  message?: string;
}

export interface ApartmentInfoResult {
  found: boolean;
  unitNumber?: string;
  floorLevel?: number;
  occupied?: boolean;
  ownerName?: string;
  ownerEmail?: string;
  ownerPhone?: string;
  buildingName?: string;
  message?: string;
}

export interface ActiveAlertsResult {
  alerts: Array<{
    id: number;
    title: string;
    description: string;
    severity: string;
    status: string;
    buildingId: number;
    createdAt: string;
  }>;
  count: number;
}

export interface SocietyOverviewResult {
  found: boolean;
  societyName?: string;
  buildingCount?: number;
  buildings?: Array<{
    id: number;
    name: string;
    activeHazards: number;
    alertSensors: number;
  }>;
  message?: string;
}

export interface SensorStatsResult {
  found: boolean;
  buildingName?: string;
  total?: number;
  active?: number;
  alert?: number;
  inactive?: number;
  message?: string;
}

export interface HazardActionResult {
  found: boolean;
  hazardId?: number;
  type?: string;
  severity?: string;
  previousStatus?: string;
  newStatus?: string;
  location?: string;
  message?: string;
}
