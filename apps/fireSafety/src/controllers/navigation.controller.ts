import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
  HttpException,
  HttpStatus,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { NavigationService } from '../services/navigation.service';
import { NavigationGateway } from '../gateways/navigation.gateway';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { Public } from '../decorators/public.decorator';
import {
  PositionUpdateDto,
  StartNavigationDto,
  StopNavigationDto,
} from '../dto/navigation.dto';

/**
 * REST fallback endpoints for navigation
 * Primary communication is via WebSocket (NavigationGateway)
 * These endpoints provide fallback for devices with WebSocket issues
 */
@Controller('navigation')
@UseGuards(JwtAuthGuard)
export class NavigationController {
  constructor(
    private readonly navigationService: NavigationService,
    @Inject(forwardRef(() => NavigationGateway))
    private readonly navigationGateway: NavigationGateway,
  ) {}

  // ═══════════════════════════════════════════════════════════════
  // POSITION UPDATES (REST Fallback)
  // ═══════════════════════════════════════════════════════════════

  /**
   * Update user position via REST (fallback for WebSocket)
   * Primary method should be WebSocket for real-time updates
   */
  @Post('position')
  @Public()
  async updatePosition(@Body() dto: PositionUpdateDto) {
    try {
      const position = await this.navigationService.updatePosition({
        user_id: dto.user_id,
        building_id: dto.building_id,
        floor_id: dto.floor_id,
        x: dto.x,
        y: dto.y,
        node_id: dto.node_id,
        accuracy: dto.accuracy,
        heading: dto.heading,
        speed: dto.speed,
        confidence: dto.confidence,
        device_id: dto.device_id,
        position_source: dto.position_source,
      });

      // Check if user has active navigation session
      const session = await this.navigationService.getActiveSession(dto.user_id);

      // Broadcast position to monitoring dashboard via WebSocket
      this.navigationGateway.server
        ?.to(`building:${dto.building_id}:tracking`)
        .emit('evacuee.position', {
          user_id: dto.user_id,
          building_id: dto.building_id,
          floor_id: dto.floor_id,
          coordinates: [dto.x, dto.y],
          heading: dto.heading,
          status: session ? 'navigating' : 'active',
          current_instruction: session?.instructions?.[session.currentInstructionIndex]?.text,
          progress: session?.progressPercent,
          last_update: Date.now(),
        });

      if (session) {
        // Update navigation progress
        const progress = await this.navigationService.updateProgress(
          session.id,
          position,
        );

        return {
          success: true,
          position: {
            id: position.id,
            x: position.x,
            y: position.y,
            floor_id: position.floorId,
            nearest_node_id: position.nearestNodeId,
          },
          navigation: {
            session_id: session.id,
            current_instruction: progress.currentInstruction,
            next_instruction: progress.nextInstruction,
            distance_to_next: progress.distanceToNext,
            approaching_turn: progress.approachingTurn,
            reached_turn: progress.reachedTurn,
            reached_destination: progress.reachedDestination,
          },
        };
      }

      return {
        success: true,
        position: {
          id: position.id,
          x: position.x,
          y: position.y,
          floor_id: position.floorId,
          nearest_node_id: position.nearestNodeId,
        },
        navigation: null,
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          error: error.message,
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Batch position sync — receives array of queued position updates
   * Used by Android app to sync offline-queued positions when back online
   */
  @Post('positions/batch')
  @Public()
  async batchPositionSync(@Body() positions: PositionUpdateDto[]) {
    let synced = 0;
    let failed = 0;

    // Only process the latest position per user for DB storage
    // but broadcast all for real-time tracking
    for (const dto of positions) {
      try {
        // Always broadcast via WebSocket for firefighter visibility
        this.navigationGateway.server
          ?.to(`building:${dto.building_id}:tracking`)
          .emit('evacuee.position', {
            user_id: dto.user_id,
            building_id: dto.building_id,
            floor_id: dto.floor_id,
            coordinates: [dto.x, dto.y],
            heading: dto.heading,
            status: 'active',
            last_update: Date.now(),
          });

        // Persist in DB (now supports anonymous users via device_id)
        await this.navigationService.updatePosition({
          user_id: dto.user_id,
          building_id: dto.building_id,
          floor_id: dto.floor_id,
          x: dto.x,
          y: dto.y,
          node_id: dto.node_id,
          accuracy: dto.accuracy,
          heading: dto.heading,
          speed: dto.speed,
          confidence: dto.confidence,
          device_id: dto.device_id,
          position_source: dto.position_source,
        });

        synced++;
      } catch (e) {
        failed++;
      }
    }

    return { synced, failed };
  }

  // ═══════════════════════════════════════════════════════════════
  // NAVIGATION SESSIONS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Start navigation session via REST
   */
  @Post('start')
  @Public()
  async startNavigation(@Body() dto: StartNavigationDto) {
    try {
      // Get current position
      const position = await this.navigationService.getLatestPosition(dto.user_id);

      if (!position) {
        throw new Error('No position data available. Send position update first.');
      }

      // Parse destination
      let destination: 'nearest_exit' | 'safe_point' | number;
      if (dto.destination === 'nearest_exit' || dto.destination === 'safe_point') {
        destination = dto.destination;
      } else {
        destination = parseInt(dto.destination, 10);
        if (isNaN(destination)) {
          throw new Error('Invalid destination. Use "nearest_exit", "safe_point", or a node ID.');
        }
      }

      const session = await this.navigationService.startNavigation(
        dto.user_id,
        dto.building_id,
        position,
        destination,
      );

      return {
        success: true,
        session_id: session.id,
        route: {
          geometry: session.routeGeojson,
          distance: session.totalDistance,
          eta_seconds: session.etaSeconds,
          destination: {
            type: session.destinationType,
            node_id: session.destinationNodeId,
          },
        },
        instructions: session.instructions,
        first_instruction: (session.instructions as any[])?.[0] || null,
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          error: error.message,
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Stop navigation session via REST
   */
  @Post('stop')
  @Public()
  async stopNavigation(@Body() dto: StopNavigationDto) {
    try {
      await this.navigationService.endSession(dto.session_id, 'aborted');

      return {
        success: true,
        session_id: dto.session_id,
        timestamp: Date.now(),
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          error: error.message,
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // STATUS & MONITORING
  // ═══════════════════════════════════════════════════════════════

  /**
   * Get active evacuees for a building (for monitoring dashboards)
   */
  @Get('active/:buildingId')
  @Public()
  async getActiveEvacuees(@Param('buildingId', ParseIntPipe) buildingId: number) {
    try {
      const sessions = await this.navigationService.getActiveSessionsByBuilding(buildingId);
      const stats = await this.navigationService.getEvacuationStats(buildingId);

      return {
        success: true,
        stats,
        evacuees: sessions.map((session) => ({
          user_id: session.userId,
          session_id: session.id,
          destination_type: session.destinationType,
          progress_percent: session.progressPercent,
          remaining_distance: session.remainingDistance,
          eta_seconds: session.etaSeconds,
          current_instruction_index: session.currentInstructionIndex,
          status: session.status,
          started_at: session.createdAt,
        })),
      };
    } catch (error) {
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
   * Get user's current navigation status
   */
  @Get('status/:userId')
  @Public()
  async getUserStatus(@Param('userId', ParseIntPipe) userId: number) {
    try {
      const position = await this.navigationService.getLatestPosition(userId);
      const session = await this.navigationService.getActiveSession(userId);

      if (!position) {
        return {
          success: true,
          has_position: false,
          is_navigating: false,
          position: null,
          navigation: null,
        };
      }

      const response: any = {
        success: true,
        has_position: true,
        is_navigating: !!session,
        position: {
          x: position.x,
          y: position.y,
          floor_id: position.floorId,
          building_id: position.buildingId,
          nearest_node_id: position.nearestNodeId,
          accuracy: position.accuracyMeters,
          heading: position.heading,
          status: position.status,
          timestamp: position.timestamp,
        },
        navigation: null,
      };

      if (session) {
        const instructions = session.instructions as any[];
        const currentInstruction = instructions?.[session.currentInstructionIndex];
        const nextInstruction = instructions?.[session.currentInstructionIndex + 1];

        response.navigation = {
          session_id: session.id,
          destination_type: session.destinationType,
          destination_node_id: session.destinationNodeId,
          total_distance: session.totalDistance,
          remaining_distance: session.remainingDistance,
          eta_seconds: session.etaSeconds,
          progress_percent: session.progressPercent,
          current_instruction: currentInstruction,
          next_instruction: nextInstruction,
          reroute_count: session.rerouteCount,
          status: session.status,
        };
      }

      return response;
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // ROUTE CALCULATION (Standalone)
  // ═══════════════════════════════════════════════════════════════

  /**
   * Calculate evacuation route without starting a session
   * Useful for preview or planning
   */
  @Post('route')
  @Public()
  async calculateRoute(@Body() dto: StartNavigationDto) {
    try {
      const position = await this.navigationService.getLatestPosition(dto.user_id);

      if (!position) {
        throw new Error('No position data available. Send position update first.');
      }

      // Parse destination
      let destination: 'nearest_exit' | 'safe_point' | number;
      if (dto.destination === 'nearest_exit' || dto.destination === 'safe_point') {
        destination = dto.destination;
      } else {
        destination = parseInt(dto.destination, 10);
        if (isNaN(destination)) {
          throw new Error('Invalid destination. Use "nearest_exit", "safe_point", or a node ID.');
        }
      }

      // Start a session to get route data, then immediately end it
      const session = await this.navigationService.startNavigation(
        dto.user_id,
        dto.building_id,
        position,
        destination,
      );

      // End the session as this is just for route preview
      await this.navigationService.endSession(session.id, 'aborted');

      return {
        success: true,
        route: {
          geometry: session.routeGeojson,
          distance: session.totalDistance,
          eta_seconds: session.etaSeconds,
          destination: {
            type: session.destinationType,
            node_id: session.destinationNodeId,
          },
        },
        instructions: session.instructions,
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          error: error.message,
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
