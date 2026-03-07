import { IsInt, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateRouteDto {
  @IsInt()
  @IsNotEmpty()
  startNodeId: number;

  @IsInt()
  @IsOptional()
  endNodeId?: number;

  @IsInt()
  @IsOptional()
  assignedTo?: number;
}
