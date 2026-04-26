import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class ChatInputDto {
  @IsOptional()
  @IsString()
  sessionId?: string;

  @IsString()
  message: string;

  @IsOptional()
  @IsIn(['en', 'ur'])
  language?: 'en' | 'ur' = 'en';

  @IsOptional()
  @IsIn(['auto', 'global', 'society', 'building'])
  contextMode?: 'auto' | 'global' | 'society' | 'building' = 'auto';

  @IsOptional()
  @IsInt()
  @Min(1)
  buildingId?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  societyId?: number;

  @IsOptional()
  @IsString()
  buildingName?: string;

  @IsOptional()
  @IsString()
  societyName?: string;
}
