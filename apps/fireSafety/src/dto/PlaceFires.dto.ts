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
 * Severity levels for fire hazards
 */
const SEVERITY_LEVELS = ['HIGH', 'CRITICAL'] as const;

/**
 * DTO for placing multiple fire zones
 */
export class PlaceFiresDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FireZoneDto)
  fireZones: FireZoneDto[];

  @IsIn(SEVERITY_LEVELS, { message: 'severity must be either HIGH or CRITICAL' })
  severity: 'HIGH' | 'CRITICAL';

  @IsString()
  type: string; // 'manual_fire'

  @IsString()
  status: string; // 'ACTIVE'
}
