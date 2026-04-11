import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, Inject, forwardRef } from '@nestjs/common';
import { NavigationService } from '../services/navigation.service';
import { FireDetectionGateway } from './fire-detection.gateway';

export interface PositionUpdatePayload {
  user_id: number;
  device_id?: string; // Anonymous device UUID (for login-free Android app)
  building_id: number;
  floor_id: number;
  x: number;
  y: number;
  node_id?: number;
  accuracy: number;
  heading?: number;
  speed?: number;
  confidence?: number;
  sensor_data?: object;
  position_source?: string; // 'wifi', 'gps', 'pdr'
}

export interface NavigationStartPayload {
  user_id: number;
  building_id: number;
  destination: 'nearest_exit' | 'safe_point' | number;
}

export interface TurnInstruction {
  index: number;
  type: string;
  distance_meters: number;
  cumulative_distance: number;
  node_id: number;
  coordinates: [number, number];
  floor_id: number;
  floor_name: string;
  heading: number;
  text: string;
  voice_text: string;
  landmark?: string;
  is_floor_change: boolean;
  warning?: string;
}

@WebSocketGateway({
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true,
  },
  namespace: '/navigation',
})
export class NavigationGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(NavigationGateway.name);

  @WebSocketServer()
  server: Server;

  // Track connected clients and their sessions
  private connectedClients = new Map<string, { userId: number; deviceId?: string; buildingId?: number }>();
  private userToSocket = new Map<number, string>(); // userId -> socketId
  private deviceToSocket = new Map<string, string>(); // deviceId -> socketId (anonymous clients)

  constructor(
    private readonly navigationService: NavigationService,
    @Inject(forwardRef(() => FireDetectionGateway))
    private readonly fireDetectionGateway: FireDetectionGateway,
  ) {}

  afterInit(server: Server) {
    this.logger.log('Navigation WebSocket Gateway initialized');
  }

  handleConnection(client: Socket) {
    this.logger.log(`Navigation client connected: ${client.id}`);

    client.emit('connected', {
      message: 'Connected to Navigation WebSocket',
      clientId: client.id,
      timestamp: Date.now(),
    });
  }

  handleDisconnect(client: Socket) {
    const clientInfo = this.connectedClients.get(client.id);
    if (clientInfo) {
      this.userToSocket.delete(clientInfo.userId);
      if (clientInfo.deviceId) {
        this.deviceToSocket.delete(clientInfo.deviceId);
      }
      this.connectedClients.delete(client.id);

      // Mark user as offline (only for authenticated users)
      if (clientInfo.userId && clientInfo.userId > 0) {
        this.navigationService
          .updateUserStatus(clientInfo.userId, 'offline')
          .catch((err) => this.logger.error(`Failed to update user status: ${err.message}`));
      }
    }

    this.logger.log(`Navigation client disconnected: ${client.id}`);
  }

  // ═══════════════════════════════════════════════════════════════
  // CLIENT → SERVER: Position Updates
  // ═══════════════════════════════════════════════════════════════

  @SubscribeMessage('position.update')
  async handlePositionUpdate(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: PositionUpdatePayload,
  ) {
    try {
      // Register client if not already
      if (!this.connectedClients.has(client.id)) {
        this.connectedClients.set(client.id, {
          userId: payload.user_id,
          deviceId: payload.device_id,
          buildingId: payload.building_id,
        });
        if (payload.user_id) {
          this.userToSocket.set(payload.user_id, client.id);
        }
        if (payload.device_id) {
          this.deviceToSocket.set(payload.device_id, client.id);
        }
      }

      // Update position in database
      const position = await this.navigationService.updatePosition(payload);

      // Get active session for this user
      const session = await this.navigationService.getActiveSession(payload.user_id);

      if (session) {
        // Calculate progress and check for instruction updates
        const progress = await this.navigationService.updateProgress(
          session.id,
          position,
        );

        // Emit progress updates
        if (progress.approachingTurn) {
          client.emit('instruction.approaching', {
            instruction: progress.nextInstruction,
            distance_remaining: progress.distanceToNext,
          });
        }

        if (progress.reachedTurn) {
          client.emit('instruction.reached', {
            completed: progress.currentInstruction,
            next: progress.nextInstruction,
          });
        }

        if (progress.reachedDestination) {
          client.emit('navigation.completed', {
            destination_type: session.destinationType,
            message:
              session.destinationType === 'safe_point'
                ? 'You have reached the safe point. Wait for rescue.'
                : 'You have reached the exit. You are safe.',
          });
        }

        // Check if off-route (deviation > 10 meters)
        if (progress.deviation > 10) {
          const newRoute = await this.handleReroute(session.id, position, 'off_route');
          if (newRoute) {
            client.emit('route.updated', newRoute);
          }
        }
      }

      // Broadcast position to building monitoring dashboard
      this.server.to(`building:${payload.building_id}:tracking`).emit('evacuee.position', {
        user_id: payload.user_id,
        building_id: payload.building_id,
        floor_id: payload.floor_id,
        coordinates: [payload.x, payload.y],
        heading: payload.heading,
        status: session ? 'navigating' : 'active',
        current_instruction: session?.instructions?.[session.currentInstructionIndex]?.text,
        progress: session?.progressPercent,
        last_update: Date.now(),
      });
    } catch (error) {
      this.logger.error(`Position update error: ${error.message}`);
      client.emit('navigation.error', {
        code: 'POSITION_UPDATE_FAILED',
        message: error.message,
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // CLIENT → SERVER: Start Navigation
  // ═══════════════════════════════════════════════════════════════

  @SubscribeMessage('navigation.start')
  async handleNavigationStart(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: NavigationStartPayload,
  ) {
    try {
      this.logger.log(
        `Navigation start requested - User: ${payload.user_id}, Building: ${payload.building_id}`,
      );

      // Register client
      this.connectedClients.set(client.id, {
        userId: payload.user_id,
        buildingId: payload.building_id,
      });
      this.userToSocket.set(payload.user_id, client.id);

      // Get user's current position
      const position = await this.navigationService.getLatestPosition(payload.user_id);

      if (!position) {
        client.emit('navigation.error', {
          code: 'NO_POSITION',
          message: 'Unable to determine your location. Please enable location services.',
        });
        return;
      }

      // Start navigation session
      const session = await this.navigationService.startNavigation(
        payload.user_id,
        payload.building_id,
        position,
        payload.destination,
      );

      // Join building room for fire updates
      client.join(`building:${payload.building_id}`);
      client.join(`navigation:${session.id}`);

      // Send navigation started response
      client.emit('navigation.started', {
        session_id: session.id,
        route: {
          geometry: session.routeGeojson,
          distance: session.totalDistance,
          eta_seconds: session.etaSeconds,
          destination: {
            type: session.destinationType,
            node_id: session.destinationNodeId,
            name:
              session.destinationType === 'safe_point'
                ? 'Safe Point'
                : 'Emergency Exit',
          },
        },
        instructions: session.instructions,
        first_instruction: session.instructions?.[0],
      });

      // Broadcast to monitoring dashboard
      this.server.to(`building:${payload.building_id}:tracking`).emit('evacuee.route', {
        user_id: payload.user_id,
        geometry: session.routeGeojson,
        instructions: session.instructions,
      });

      this.logger.log(
        `Navigation started - Session: ${session.id}, Distance: ${session.totalDistance}m`,
      );
    } catch (error) {
      this.logger.error(`Navigation start error: ${error.message}`);

      if (error.name === 'IsolatedLocationException') {
        // User is trapped
        const safePoint = await this.navigationService.findSafestPoint(
          payload.user_id,
          payload.building_id,
        );

        client.emit('navigation.trapped', {
          type: 'SHELTER_IN_PLACE',
          alert: {
            title: 'All Exits Blocked',
            message: 'Move to the safe point and wait for rescue.',
            severity: 'critical',
          },
          safe_point: safePoint,
        });
      } else {
        client.emit('navigation.error', {
          code: 'NAVIGATION_START_FAILED',
          message: error.message,
        });
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // CLIENT → SERVER: Stop Navigation
  // ═══════════════════════════════════════════════════════════════

  @SubscribeMessage('navigation.stop')
  async handleNavigationStop(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { session_id: number },
  ) {
    try {
      await this.navigationService.endSession(payload.session_id, 'aborted');

      client.emit('navigation.stopped', {
        session_id: payload.session_id,
        timestamp: Date.now(),
      });

      this.logger.log(`Navigation stopped - Session: ${payload.session_id}`);
    } catch (error) {
      this.logger.error(`Navigation stop error: ${error.message}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // CLIENT → SERVER: Subscribe to Building Tracking
  // ═══════════════════════════════════════════════════════════════

  @SubscribeMessage('subscribe:building:tracking')
  handleSubscribeBuildingTracking(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { buildingId: number },
  ) {
    const room = `building:${payload.buildingId}:tracking`;
    client.join(room);
    this.logger.log(`Client ${client.id} subscribed to tracking for building ${payload.buildingId}`);

    client.emit('subscribed', {
      room,
      buildingId: payload.buildingId,
      type: 'tracking',
    });

    return { event: 'subscribed', data: { room, buildingId: payload.buildingId } };
  }

  // ═══════════════════════════════════════════════════════════════
  // CLIENT → SERVER: Unsubscribe from Building Tracking
  // ═══════════════════════════════════════════════════════════════

  @SubscribeMessage('unsubscribe:building:tracking')
  handleUnsubscribeBuildingTracking(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { buildingId: number },
  ) {
    const room = `building:${payload.buildingId}:tracking`;
    client.leave(room);
    this.logger.log(`Client ${client.id} unsubscribed from tracking for building ${payload.buildingId}`);

    client.emit('unsubscribed', {
      room,
      buildingId: payload.buildingId,
      type: 'tracking',
    });

    return { event: 'unsubscribed', data: { room, buildingId: payload.buildingId } };
  }

  // ═══════════════════════════════════════════════════════════════
  // INTERNAL: Handle Rerouting
  // ═══════════════════════════════════════════════════════════════

  private async handleReroute(
    sessionId: number,
    currentPosition: any,
    reason: string,
  ) {
    try {
      const result = await this.navigationService.rerouteSession(
        sessionId,
        currentPosition,
        reason,
      );

      return {
        type: 'REROUTE',
        reason,
        alert:
          reason === 'fire_blocking_path'
            ? {
                title: 'Route Changed',
                message: 'Fire detected ahead. Follow the new route.',
                severity: 'critical',
              }
            : undefined,
        route: {
          geometry: result.routeGeojson,
          distance: result.totalDistance,
          eta_seconds: result.etaSeconds,
        },
        instructions: result.instructions,
        current_instruction: result.instructions?.[0],
      };
    } catch (error) {
      this.logger.error(`Reroute failed: ${error.message}`);
      return null;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // EXTERNAL: Called by Fire Detection Service
  // ═══════════════════════════════════════════════════════════════

  async handleFireEvent(fireEvent: any) {
    this.logger.log(`Fire event received for building ${fireEvent.building_id}`);

    // Get all active sessions in the building
    const sessions = await this.navigationService.getActiveSessionsByBuilding(
      fireEvent.building_id,
    );

    for (const session of sessions) {
      const socketId = this.userToSocket.get(session.userId);
      if (!socketId) continue;

      const client = this.server.sockets.sockets.get(socketId);
      if (!client) continue;

      // Check if fire blocks current route
      const isBlocked = await this.navigationService.isRouteBlocked(
        session.id,
        fireEvent,
      );

      if (isBlocked) {
        const position = await this.navigationService.getLatestPosition(session.userId);
        const newRoute = await this.handleReroute(session.id, position, 'fire_blocking_path');

        if (newRoute) {
          client.emit('route.updated', newRoute);
        } else {
          // All routes blocked
          const safePoint = await this.navigationService.findSafestPoint(
            session.userId,
            session.buildingId,
          );

          client.emit('navigation.trapped', {
            type: 'SHELTER_IN_PLACE',
            alert: {
              title: 'All Exits Blocked',
              message: 'Move to the safe point and wait for rescue.',
              severity: 'critical',
            },
            safe_point: safePoint,
          });
        }
      } else {
        // Fire doesn't block route, send warning
        client.emit('fire.warning', {
          fire_location: fireEvent,
          message: 'Fire detected in building. Continue on current route.',
          route_status: 'safe',
        });
      }
    }

    // Broadcast evacuation stats update
    const stats = await this.navigationService.getEvacuationStats(fireEvent.building_id);
    this.server.to(`building:${fireEvent.building_id}:tracking`).emit('evacuation.stats', stats);
  }

  // ═══════════════════════════════════════════════════════════════
  // EXTERNAL: Broadcast evacuee safe
  // ═══════════════════════════════════════════════════════════════

  emitEvacueeSafe(userId: number, buildingId: number) {
    this.server.to(`building:${buildingId}:tracking`).emit('evacuee.safe', {
      user_id: userId,
      timestamp: Date.now(),
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // EXTERNAL: Broadcast evacuee trapped
  // ═══════════════════════════════════════════════════════════════

  emitEvacueeTrapped(userId: number, buildingId: number, safePoint: any) {
    this.server.to(`building:${buildingId}:tracking`).emit('evacuee.trapped', {
      user_id: userId,
      safe_point: safePoint,
      timestamp: Date.now(),
    });
  }

  getConnectedClientsCount(): number {
    return this.connectedClients.size;
  }
}
