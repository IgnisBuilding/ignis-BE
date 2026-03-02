import { IsString, IsEnum, IsNumber, IsOptional } from 'class-validator';

export class CreateHazardDto {
  @IsString()
  type: string;

  @IsOptional()
  @IsNumber()
  apartmentId?: number;

  @IsOptional()
  @IsNumber()
  nodeId?: number;

  @IsOptional()
  @IsNumber()
  roomId?: number;

  @IsOptional()
  @IsNumber()
  floorId?: number;

  @IsString()
  severity: string;

  @IsString()
  status: string;
}

export class UpdateHazardDto {
  @IsString()
  status: string;
}
