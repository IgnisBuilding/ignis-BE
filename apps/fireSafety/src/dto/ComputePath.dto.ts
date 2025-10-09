import { IsNotEmpty, IsNumberString } from 'class-validator';

/**
 * Data Transfer Object for validating the query parameters
 * when computing a shortest path.
 */
export class ComputePathDto {
  /**
   * The ID of the starting node for the path calculation.
   * Must be a string that represents a number.
   * @example "1"
   */
  @IsNumberString()
  @IsNotEmpty()
  start: string;

  /**
   * The ID of the ending node for the path calculation.
   * Must be a string that represents a number.
   * @example "6"
   */
  @IsNumberString()
  @IsNotEmpty()
  end: string;
}