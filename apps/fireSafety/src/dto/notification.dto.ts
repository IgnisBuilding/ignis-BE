import { IsString, IsOptional, IsNumber, IsIn } from 'class-validator';

export class CreateNotificationDto {
  @IsString()
  title: string;

  @IsString()
  type: string;

  @IsString()
  message: string;

  @IsOptional()
  @IsNumber()
  userId?: number;

  @IsOptional()
  @IsIn(['low', 'medium', 'high', 'critical'])
  priority?: string;

  @IsOptional()
  @IsString()
  roleTarget?: string;
}
