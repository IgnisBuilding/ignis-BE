import { IsString, IsEnum, IsNumber } from 'class-validator';

export class CreateHazardDto {
  @IsString()
  type: string;

  @IsNumber()
  apartmentId: number;

  @IsNumber()
  nodeId: number;

  @IsString()
  severity: string;

  @IsString()
  status: string;
}

export class UpdateHazardDto {
  @IsString()
  status: string;
}
