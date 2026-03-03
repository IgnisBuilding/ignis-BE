import { IsInt, IsNumber, IsString, IsOptional, IsIn, Min, Max } from 'class-validator';

/**
 * DTO for requesting an evacuation route
 */
export class NavigationRouteDto {
  @IsInt()
  user_id: number;

  @IsInt()
  building_id: number;

  @IsString()
  @IsIn(['nearest_exit', 'safe_point'])
  destination: 'nearest_exit' | 'safe_point';
}

/**
 * DTO for position updates via REST (fallback for WebSocket)
 */
export class PositionUpdateDto {
  @IsOptional()
  @IsInt()
  user_id: number;

  @IsInt()
  building_id: number;

  @IsInt()
  floor_id: number;

  @IsNumber()
  x: number;

  @IsNumber()
  y: number;

  @IsOptional()
  @IsInt()
  node_id?: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  accuracy: number;

  @IsOptional()
  @IsNumber()
  heading?: number;

  @IsOptional()
  @IsNumber()
  speed?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence?: number;

  @IsOptional()
  @IsString()
  device_id?: string;

  @IsOptional()
  @IsString()
  position_source?: string;
}

/**
 * DTO for starting a navigation session via REST
 */
export class StartNavigationDto {
  @IsInt()
  user_id: number;

  @IsInt()
  building_id: number;

  @IsString()
  destination: string; // 'nearest_exit', 'safe_point', or node ID as string
}

/**
 * DTO for stopping a navigation session
 */
export class StopNavigationDto {
  @IsInt()
  session_id: number;
}
