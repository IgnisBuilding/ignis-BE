import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class ChatRequestDto {
  @IsString()
  message: string;

  @IsOptional()
  @IsString()
  model?: string;

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
