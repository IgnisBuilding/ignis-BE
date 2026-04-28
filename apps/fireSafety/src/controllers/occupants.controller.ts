import {
  Controller,
  Get,
  Query,
  UseGuards,
  HttpException,
  HttpStatus,
  Logger,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { Public } from '../decorators/public.decorator';
import { PresenceBrokerService, OccupantPresence } from '../services/presence-broker.service';

// Extend Express Request to include user payload from JWT
interface AuthRequest extends Request {
  user?: {
    id: number;
    sub: number;
    role?: 'firefighter' | 'admin' | 'building_authority' | 'evacuee';
    email?: string;
  };
}

/**
 * Occupants API - Provides REST fallback for peer position queries
 * Primary communication is via WebSocket (NavigationGateway)
 * Used for:
 * - Initial load of occupants on page load
 * - Fallback if WebSocket connection fails
 * - Batch queries by building/floor
 */
@Controller('occupants')
@UseGuards(JwtAuthGuard)
export class OccupantsController {
  private readonly logger = new Logger(OccupantsController.name);

  constructor(private readonly presenceBroker: PresenceBrokerService) {}

  /**
   * GET /occupants/positions
   * Fetch occupants visible to requesting user
   * 
   * Query params:
   * - building_id (required): Building to query
   * - floor_id (optional): Filter to specific floor
   * 
   * Returns: Array of OccupantPresence visible to user based on their role
   */
  @Get('positions')
  @Public()
  async getOccupants(
    @Query('building_id') buildingId: string,
    @Query('floor_id') floorId?: string,
    @Req() req?: AuthRequest,
  ) {
    try {
      if (!buildingId) {
        throw new HttpException(
          'building_id query parameter is required',
          HttpStatus.BAD_REQUEST,
        );
      }

      const buildingIdNum = parseInt(buildingId, 10);
      if (isNaN(buildingIdNum)) {
        throw new HttpException(
          'building_id must be a valid number',
          HttpStatus.BAD_REQUEST,
        );
      }

      // Get user info from JWT token in request
      // User must be authenticated to see occupant data
      const userId = req?.user?.id || -1;
      const userRole = (req?.user?.role || 'evacuee') as
        | 'firefighter'
        | 'admin'
        | 'building_authority'
        | 'evacuee';

      // Get occupants from broker
      let occupants: OccupantPresence[];

      if (floorId) {
        const floorIdNum = parseInt(floorId, 10);
        if (isNaN(floorIdNum)) {
          throw new HttpException(
            'floor_id must be a valid number',
            HttpStatus.BAD_REQUEST,
          );
        }
        occupants = this.presenceBroker.getOccupantsByFloor(
          buildingIdNum,
          floorIdNum,
          userRole,
        );
      } else {
        occupants = this.presenceBroker.getVisibleOccupants(
          buildingIdNum,
          userId,
          userRole,
        );
      }

      return {
        success: true,
        building_id: buildingIdNum,
        floor_id: floorId ? parseInt(floorId, 10) : undefined,
        occupant_count: occupants.length,
        occupants: occupants.map((occ) => ({
          user_id: occ.userId,
          floor_id: occ.floorId,
          node_id: occ.nodeId,
          x: occ.x,
          y: occ.y,
          heading: occ.heading,
          speed: occ.speed,
          confidence: occ.confidence,
          role: occ.role,
          status: occ.status,
          current_instruction: occ.currentInstruction,
          progress_percent: occ.progressPercent,
          last_update: occ.lastUpdate,
        })),
        timestamp: Date.now(),
      };
    } catch (error) {
      this.logger.error(`Error fetching occupants: ${error.message}`);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          success: false,
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /occupants/stats
   * Get broker statistics (for debugging/monitoring)
   * Only accessible to admins
   */
  @Get('stats')
  getStats(@Req() req: AuthRequest) {
    const userRole = req?.user?.role;

    // Only admins can see stats
    if (userRole !== 'admin') {
      throw new HttpException(
        'Only admins can access occupant statistics',
        HttpStatus.FORBIDDEN,
      );
    }

    const stats = this.presenceBroker.getStats();
    return {
      success: true,
      ...stats,
      timestamp: Date.now(),
    };
  }

  /**
   * GET /occupants/single/:userId
   * Get specific occupant info by user_id
   * Respects role-based visibility
   */
  @Get('single/:userId')
  async getSingleOccupant(
    @Query('building_id') buildingId: string,
    @Req() req: AuthRequest,
  ) {
    try {
      if (!buildingId) {
        throw new HttpException(
          'building_id query parameter is required',
          HttpStatus.BAD_REQUEST,
        );
      }

      // Extract userId from path - passed as query for simplicity
      const buildingIdNum = parseInt(buildingId, 10);
      if (isNaN(buildingIdNum)) {
        throw new HttpException(
          'building_id must be a valid number',
          HttpStatus.BAD_REQUEST,
        );
      }

      const userRole = (req?.user?.role || 'evacuee') as
        | 'firefighter'
        | 'admin'
        | 'building_authority'
        | 'evacuee';

      // Get all visible occupants and filter
      const visible = this.presenceBroker.getVisibleOccupants(
        buildingIdNum,
        req?.user?.id || -1,
        userRole,
      );

      if (visible.length === 0) {
        throw new HttpException(
          'No occupants found or access denied',
          HttpStatus.NOT_FOUND,
        );
      }

      return {
        success: true,
        occupants: visible.map((occ) => ({
          user_id: occ.userId,
          floor_id: occ.floorId,
          node_id: occ.nodeId,
          x: occ.x,
          y: occ.y,
          heading: occ.heading,
          speed: occ.speed,
          confidence: occ.confidence,
          role: occ.role,
          status: occ.status,
          current_instruction: occ.currentInstruction,
          progress_percent: occ.progressPercent,
          last_update: occ.lastUpdate,
        })),
        timestamp: Date.now(),
      };
    } catch (error) {
      this.logger.error(`Error fetching occupant: ${error.message}`);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          success: false,
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
