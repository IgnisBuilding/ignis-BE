import { IsNumber, IsOptional, IsBoolean } from 'class-validator';

export class AssignApartmentDto {
  @IsNumber()
  userId: number;
}

export class UpdateApartmentDto {
  @IsNumber()
  @IsOptional()
  userId?: number;

  @IsBoolean()
  @IsOptional()
  occupied?: boolean;
}
