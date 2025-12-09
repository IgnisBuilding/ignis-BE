// CREATE THIS NEW FILE
import {
  IsArray,
  IsString,
  IsEnum,
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
 * DTO for placing multiple fire zones
 */
export class PlaceFiresDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FireZoneDto)
  fireZones: FireZoneDto[];

  @IsEnum(['HIGH', 'CRITICAL'])
  severity: 'HIGH' | 'CRITICAL';

  @IsString()
  type: string; // 'manual_fire'

  @IsString()
  status: string; // 'ACTIVE'
}
