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

export interface SensorReadingEvent {
  sensor_id: number;
  sensor_key: string;
  name: string;
  type: string;
  value: number;
  unit: string;
  status: 'safe' | 'warning' | 'alert';
  timestamp: number;
  room_id?: number;
  floor_id?: number;
  building_id?: number;
}

export interface SensorConnectionEvent {
  source: 'arduino';
  mode: 'mock' | 'hardware';
  connected: boolean;
  port?: string;
  timestamp: number;
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
  private readonly sensorReadingDebugLogs =
    (process.env.SENSOR_READING_DEBUG_LOGS || 'false').toLowerCase() === 'true';
  private readonly websocketDebugLogs =
    (process.env.WS_DEBUG_LOGS || 'false').toLowerCase() === 'true';
  private readonly websocketLifecycleLogs =
    (process.env.WS_LIFECYCLE_LOGS || 'false').toLowerCase() === 'true';
  private lastNotReadyWarningAt = 0;
  private readonly notReadyWarnCooldownMs = 60000;

  @WebSocketServer()
  server: Server;

  private connectedClients = new Set<string>();

  private isReady(): boolean {
    if (!this.server) {
      const now = Date.now();
      if (this.websocketDebugLogs && now - this.lastNotReadyWarningAt >= this.notReadyWarnCooldownMs) {
        this.logger.warn('WebSocket server not initialized yet; skipping emit');
        this.lastNotReadyWarningAt = now;
      }
      return false;
    }
    return true;
  }

  afterInit(server: Server) {
    if (this.websocketLifecycleLogs) {
      this.logger.log('Fire Detection WebSocket Gateway initialized');
    }
  }

  handleConnection(client: Socket) {
    this.connectedClients.add(client.id);
    if (this.websocketLifecycleLogs) {
      this.logger.log(`Client connected: ${client.id} (Total: ${this.connectedClients.size})`);
    }

    // Send connection acknowledgment
    client.emit('connected', {
      message: 'Connected to Fire Detection WebSocket',
      clientId: client.id,
      timestamp: Date.now(),
    });
  }

  handleDisconnect(client: Socket) {
    this.connectedClients.delete(client.id);
    if (this.websocketLifecycleLogs) {
      this.logger.log(`Client disconnected: ${client.id} (Total: ${this.connectedClients.size})`);
    }
  }

  /**
   * Handle client subscribing to a specific building's fire events
   */
  @SubscribeMessage('subscribe:building')
  handleSubscribeBuilding(client: Socket, buildingId: number) {
    const room = `building:${buildingId}`;
    client.join(room);
    if (this.websocketLifecycleLogs) {
      this.logger.log(`Client ${client.id} subscribed to ${room}`);
    }

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
    if (this.websocketLifecycleLogs) {
      this.logger.log(`Client ${client.id} unsubscribed from ${room}`);
    }

    return { event: 'unsubscribed', data: { room, buildingId } };
  }

  /**
   * Emit fire detection event to all connected clients
   * Called by FireDetectionService when an alert is triggered
   */
  emitFireDetected(event: FireDetectionEvent) {
    if (!this.isReady()) {
      return;
    }

    // Emit to all connected clients
    this.server.emit('fire.detected', event);

    // Also emit to building-specific room
    const room = `building:${event.building_id}`;
    this.server.to(room).emit('fire.detected:building', event);

    if (this.websocketDebugLogs) {
      this.logger.log(
        `Fire detection event emitted - Camera: ${event.camera_id}, Building: ${event.building_id}, Confidence: ${(event.confidence * 100).toFixed(1)}%`,
      );
    }
  }

  /**
   * Emit fire alert resolved event
   */
  emitFireResolved(data: { hazard_id: number; building_id: number; resolved_by?: string }) {
    if (!this.isReady()) {
      return;
    }

    this.server.emit('fire.resolved', data);
    this.server.to(`building:${data.building_id}`).emit('fire.resolved:building', data);

    if (this.websocketDebugLogs) {
      this.logger.log(`Fire resolved event emitted - Hazard: ${data.hazard_id}, Building: ${data.building_id}`);
    }
  }

  /**
   * Emit hazard created event (manual fire placement from web/Android)
   */
  emitHazardCreated(hazard: any) {
    if (!this.isReady()) {
      return;
    }

    const buildingId = hazard.floor?.building_id || hazard.building_id || hazard.floorId;
    this.server.emit('hazard.created', hazard);
    if (buildingId) {
      this.server.to(`building:${buildingId}`).emit('hazard.created:building', hazard);
    }
    if (this.websocketDebugLogs) {
      this.logger.log(`Hazard created event emitted - ID: ${hazard.id}`);
    }
  }

  /**
   * Emit hazard resolved event (manual resolution)
   */
  emitHazardResolved(hazard: any) {
    if (!this.isReady()) {
      return;
    }

    const buildingId = hazard.floor?.building_id || hazard.floorId;
    this.server.emit('hazard.resolved', hazard);
    if (buildingId) {
      this.server.to(`building:${buildingId}`).emit('hazard.resolved:building', hazard);
    }
    if (this.websocketDebugLogs) {
      this.logger.log(`Hazard resolved event emitted - ID: ${hazard.id}`);
    }
  }

  /**
   * Emit sensor reading event
   */
  emitSensorReading(event: SensorReadingEvent) {
    if (!this.isReady()) {
      return;
    }

    this.server.emit('sensor.reading', event);

    if (event.building_id) {
      this.server.to(`building:${event.building_id}`).emit('sensor.reading:building', event);
    }

    if (this.sensorReadingDebugLogs) {
      this.logger.debug(
        `Sensor reading emitted - ${event.sensor_key}=${event.value}${event.unit}, status=${event.status}`,
      );
    }
  }

  /**
   * Emit sensor alert event when threshold is breached
   */
  emitSensorAlert(event: SensorReadingEvent) {
    if (!this.isReady()) {
      return;
    }

    this.server.emit('sensor.alert', event);

    if (event.building_id) {
      this.server.to(`building:${event.building_id}`).emit('sensor.alert:building', event);
    }

    this.logger.warn(
      `Sensor alert emitted - ${event.sensor_key}=${event.value}${event.unit}, building=${event.building_id ?? 'n/a'}`,
    );
  }

  /**
   * Emit Arduino connection status event
   */
  emitSensorConnection(event: SensorConnectionEvent) {
    if (!this.isReady()) {
      return;
    }

    this.server.emit('sensor.connection', event);

    if (this.websocketDebugLogs) {
      this.logger.log(
        `Sensor source connection changed - mode=${event.mode}, connected=${event.connected}, port=${event.port ?? 'n/a'}`,
      );
    }
  }

  /**
   * Get count of connected clients
   */
  getConnectedClientsCount(): number {
    return this.connectedClients.size;
  }
}
