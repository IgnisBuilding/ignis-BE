import { IsString, IsEnum, IsOptional, IsNumber } from 'class-validator';
import { AlertSeverity, AlertStatus } from '@app/entities';

export class CreateAlertDto {
  @IsString()
  title: string;

  @IsString()
  description: string;

  @IsEnum(AlertSeverity)
  severity: AlertSeverity;

  @IsNumber()
  buildingId: number;

  @IsOptional()
  @IsNumber()
  apartmentId?: number;
}

export class UpdateAlertDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(AlertSeverity)
  severity?: AlertSeverity;

  @IsOptional()
  @IsEnum(AlertStatus)
  status?: AlertStatus;
}
