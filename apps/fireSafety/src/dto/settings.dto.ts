import { IsOptional, IsIn, IsBoolean } from 'class-validator';

export class UpdateSettingsDto {
  @IsOptional()
  @IsIn(['light', 'dark', 'system'])
  theme?: string;

  @IsOptional()
  @IsIn(['en', 'ur'])
  language?: string;

  @IsOptional()
  @IsBoolean()
  notifyPush?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyEmail?: boolean;

  @IsOptional()
  @IsBoolean()
  notifySms?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyMaintenance?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyCommunity?: boolean;
}
