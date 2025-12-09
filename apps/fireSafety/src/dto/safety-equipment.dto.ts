import { IsString, IsEnum, IsNumber, IsOptional, IsDate } from 'class-validator';
import { Type } from 'class-transformer';
import { EquipmentType, EquipmentStatus } from '@app/entities';

export class CreateSafetyEquipmentDto {
  @IsEnum(EquipmentType)
  type: EquipmentType;

  @IsString()
  name: string;

  @IsEnum(EquipmentStatus)
  status: EquipmentStatus;

  @IsDate()
  @Type(() => Date)
  lastChecked: Date;

  @IsOptional()
  @IsDate()
  @Type(() => Date)
  nextCheckDue?: Date;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsNumber()
  apartmentId?: number;

  @IsOptional()
  @IsNumber()
  buildingId?: number;
}

export class UpdateSafetyEquipmentDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(EquipmentStatus)
  status?: EquipmentStatus;

  @IsOptional()
  @IsDate()
  @Type(() => Date)
  lastChecked?: Date;

  @IsOptional()
  @IsDate()
  @Type(() => Date)
  nextCheckDue?: Date;

  @IsOptional()
  @IsString()
  notes?: string;
}
