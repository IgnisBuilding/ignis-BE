import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

export interface FireDetectionEvent {
  camera_id: string;
  camera_name: string;
  building_id: number;
  floor_id?: number;
  room_id?: number;
  confidence: number;
  timestamp: number;
  hazard_id?: number;
  severity: string;
  location_description?: string;
}

@WebSocketGateway({
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true,
  },
  namespace: '/fire-detection',
})
export class FireDetectionGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(FireDetectionGateway.name);

  @WebSocketServer()
  server: Server;

  private connectedClients = new Set<string>();

  afterInit(server: Server) {
    this.logger.log('Fire Detection WebSocket Gateway initialized');
  }

  handleConnection(client: Socket) {
    this.connectedClients.add(client.id);
    this.logger.log(`Client connected: ${client.id} (Total: ${this.connectedClients.size})`);

    // Send connection acknowledgment
    client.emit('connected', {
      message: 'Connected to Fire Detection WebSocket',
      clientId: client.id,
      timestamp: Date.now(),
    });
  }

  handleDisconnect(client: Socket) {
    this.connectedClients.delete(client.id);
    this.logger.log(`Client disconnected: ${client.id} (Total: ${this.connectedClients.size})`);
  }

  /**
   * Handle client subscribing to a specific building's fire events
   */
  @SubscribeMessage('subscribe:building')
  handleSubscribeBuilding(client: Socket, buildingId: number) {
    const room = `building:${buildingId}`;
    client.join(room);
    this.logger.log(`Client ${client.id} subscribed to ${room}`);

    client.emit('subscribed', {
      room,
      buildingId,
      timestamp: Date.now(),
    });

    return { event: 'subscribed', data: { room, buildingId } };
  }

  /**
   * Handle client unsubscribing from a building
   */
  @SubscribeMessage('unsubscribe:building')
  handleUnsubscribeBuilding(client: Socket, buildingId: number) {
    const room = `building:${buildingId}`;
    client.leave(room);
    this.logger.log(`Client ${client.id} unsubscribed from ${room}`);

    return { event: 'unsubscribed', data: { room, buildingId } };
  }

  /**
   * Emit fire detection event to all connected clients
   * Called by FireDetectionService when an alert is triggered
   */
  emitFireDetected(event: FireDetectionEvent) {
    // Emit to all connected clients
    this.server.emit('fire.detected', event);

    // Also emit to building-specific room
    const room = `building:${event.building_id}`;
    this.server.to(room).emit('fire.detected:building', event);

    this.logger.log(
      `Fire detection event emitted - Camera: ${event.camera_id}, Building: ${event.building_id}, Confidence: ${(event.confidence * 100).toFixed(1)}%`,
    );
  }

  /**
   * Emit fire alert resolved event
   */
  emitFireResolved(data: { hazard_id: number; building_id: number; resolved_by?: string }) {
    this.server.emit('fire.resolved', data);
    this.server.to(`building:${data.building_id}`).emit('fire.resolved:building', data);

    this.logger.log(`Fire resolved event emitted - Hazard: ${data.hazard_id}, Building: ${data.building_id}`);
  }

  /**
   * Emit hazard created event (manual fire placement from web/Android)
   */
  emitHazardCreated(hazard: any) {
    const buildingId = hazard.floor?.building_id || hazard.floorId;
    this.server.emit('hazard.created', hazard);
    if (buildingId) {
      this.server.to(`building:${buildingId}`).emit('hazard.created:building', hazard);
    }
    this.logger.log(`Hazard created event emitted - ID: ${hazard.id}`);
  }

  /**
   * Emit hazard resolved event (manual resolution)
   */
  emitHazardResolved(hazard: any) {
    const buildingId = hazard.floor?.building_id || hazard.floorId;
    this.server.emit('hazard.resolved', hazard);
    if (buildingId) {
      this.server.to(`building:${buildingId}`).emit('hazard.resolved:building', hazard);
    }
    this.logger.log(`Hazard resolved event emitted - ID: ${hazard.id}`);
  }

  /**
   * Get count of connected clients
   */
  getConnectedClientsCount(): number {
    return this.connectedClients.size;
  }
}
