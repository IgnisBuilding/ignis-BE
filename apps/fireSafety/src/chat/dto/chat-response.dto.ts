import { IsIn, IsObject, IsString, ValidateNested, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

class ChatVoiceDto {
  @IsIn(['normal', 'high'])
  priority: 'normal' | 'high';

  @IsIn(['en', 'ur'])
  language: 'en' | 'ur';

  @IsString()
  text: string;
}

export class ChatResponseDto {
  @IsOptional()
  @IsString()
  sessionId?: string;

  @IsString()
  text: string;

  @IsIn(['normal', 'emergency'])
  mode: 'normal' | 'emergency';

  @IsObject()
  @ValidateNested()
  @Type(() => ChatVoiceDto)
  voice: ChatVoiceDto;
}
