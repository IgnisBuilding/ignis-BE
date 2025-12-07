import { IsInt, IsOptional } from 'class-validator';

/**
 * DTO for finding the safest point when exits are blocked
 */
export class FindSafestPointDto {
  @IsInt()
  currentNodeId: number;

  @IsInt()
  @IsOptional()
  floorId?: number;
}
