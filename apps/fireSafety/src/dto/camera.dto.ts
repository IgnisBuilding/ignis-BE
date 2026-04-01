import { IsNotEmpty, IsNumber, IsOptional, IsString, IsBoolean, MaxLength } from 'class-validator';

export class CreateCameraDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  rtsp_url: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  camera_id: string; // Unique identifier matching fire-detect camera_id

  @IsNumber()
  @IsNotEmpty()
  building_id: number;

  @IsNumber()
  @IsOptional()
  floor_id?: number;

  @IsNumber()
  @IsOptional()
  room_id?: number;

  @IsString()
  @IsOptional()
  @MaxLength(20)
  status?: string; // active, inactive, maintenance

  @IsString()
  @IsOptional()
  @MaxLength(255)
  location_description?: string;

  @IsBoolean()
  @IsOptional()
  is_fire_detection_enabled?: boolean;

  @IsBoolean()
  @IsOptional()
  privacy_mode?: boolean;
}

export class UpdateCameraDto {
  @IsString()
  @IsOptional()
  @MaxLength(100)
  name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  rtsp_url?: string;

  @IsNumber()
  @IsOptional()
  building_id?: number;

  @IsNumber()
  @IsOptional()
  floor_id?: number;

  @IsNumber()
  @IsOptional()
  room_id?: number;

  @IsString()
  @IsOptional()
  @MaxLength(20)
  status?: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  location_description?: string;

  @IsBoolean()
  @IsOptional()
  is_fire_detection_enabled?: boolean;

  @IsBoolean()
  @IsOptional()
  privacy_mode?: boolean;
}
