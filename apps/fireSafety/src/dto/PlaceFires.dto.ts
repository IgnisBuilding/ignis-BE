import {
  IsArray,
  IsString,
  IsIn,
  ValidateNested,
  IsInt,
  IsNumber,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO for individual fire zone
 */
class FireZoneDto {
  @IsInt()
  nodeId: number;

  @IsString()
  roomName: string;

  @IsInt()
  roomId: number;

  @IsNumber()
  longitude: number;

  @IsNumber()
  latitude: number;

  @IsInt()
  floorLevel: number;
}

/**
 * Severity levels for fire hazards (must match database constraint)
 */
const SEVERITY_LEVELS = ['low', 'medium', 'high', 'critical'] as const;

/**
 * Status values for hazards (must match database constraint)
 */
const STATUS_VALUES = ['active', 'responded', 'resolved', 'false_alarm', 'pending'] as const;

/**
 * Hazard types (must match database constraint)
 */
const HAZARD_TYPES = ['fire', 'smoke', 'gas_leak', 'structural', 'electrical', 'chemical', 'flood', 'other'] as const;

/**
 * DTO for placing multiple fire zones
 */
export class PlaceFiresDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FireZoneDto)
  fireZones: FireZoneDto[];

  @IsIn(SEVERITY_LEVELS, { message: 'severity must be one of: low, medium, high, critical' })
  severity: 'low' | 'medium' | 'high' | 'critical';

  @IsIn(HAZARD_TYPES, { message: 'type must be one of: fire, smoke, gas_leak, structural, electrical, chemical, flood, other' })
  type: string;

  @IsIn(STATUS_VALUES, { message: 'status must be one of: active, responded, resolved, false_alarm, pending' })
  status: string;
}
