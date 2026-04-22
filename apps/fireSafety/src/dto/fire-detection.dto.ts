import { IsNotEmpty, IsNumber, IsOptional, IsString, IsArray, ValidateNested, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

// Detection bounding box
export class DetectionBoundingBox {
  @IsNumber()
  x1: number;

  @IsNumber()
  y1: number;

  @IsNumber()
  x2: number;

  @IsNumber()
  y2: number;
}

// Individual detection from fire-detect pipeline
export class DetectionItem {
  @IsArray()
  bbox: number[]; // [x1, y1, x2, y2]

  @IsNumber()
  score: number;

  @IsString()
  label: string;
}

// Fire detection alert from fire-detect pipeline
export class FireDetectionAlertDto {
  @IsString()
  @IsNotEmpty()
  camera_id: string; // Camera code from fire-detect

  @IsNumber()
  @IsNotEmpty()
  timestamp: number; // Unix timestamp from fire-detect

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DetectionItem)
  detections: DetectionItem[];

  @IsNumber()
  @IsOptional()
  latency?: number; // Inference latency in seconds
}

// Response from fire detection alert endpoint
export class FireDetectionAlertResponseDto {
  received: boolean;
  logged: boolean;
  alert_triggered: boolean;
  hazard_id?: number;
  reason?: string;
  camera?: {
    id: number;
    name: string;
    room_id: number;
    floor_id: number;
    building_id: number;
  };
}

// Fire alert configuration DTO
export class CreateFireAlertConfigDto {
  @IsNumber()
  @IsNotEmpty()
  building_id: number;

  @IsNumber()
  @IsOptional()
  min_confidence?: number; // Default: 0.40

  @IsNumber()
  @IsOptional()
  consecutive_detections?: number; // Default: 3

  @IsNumber()
  @IsOptional()
  cooldown_seconds?: number; // Default: 60

  @IsBoolean()
  @IsOptional()
  auto_create_hazard?: boolean; // Default: true

  @IsBoolean()
  @IsOptional()
  auto_notify_firefighters?: boolean; // Default: true
}

export class UpdateFireAlertConfigDto {
  @IsNumber()
  @IsOptional()
  min_confidence?: number;

  @IsNumber()
  @IsOptional()
  consecutive_detections?: number;

  @IsNumber()
  @IsOptional()
  cooldown_seconds?: number;

  @IsBoolean()
  @IsOptional()
  auto_create_hazard?: boolean;

  @IsBoolean()
  @IsOptional()
  auto_notify_firefighters?: boolean;
}

// Forwarded sensor alert from a local ignis-BE instance (for deployed-backend AND logic)
export class SensorAlertForwardDto {
  @IsNumber()
  @IsOptional()
  room_id?: number;

  @IsNumber()
  @IsOptional()
  floor_id?: number;

  @IsNumber()
  @IsOptional()
  building_id?: number;

  @IsNumber()
  @IsNotEmpty()
  timestamp: number;
}
