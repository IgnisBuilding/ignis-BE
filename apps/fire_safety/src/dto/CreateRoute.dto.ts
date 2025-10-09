import { IsInt, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateRouteDto {
  @IsInt()
  @IsNotEmpty()
  startNodeId: number;

  @IsInt()
  @IsNotEmpty()
  endNodeId: number;

  @IsInt()
  @IsOptional()
  assignedTo?: number;
}