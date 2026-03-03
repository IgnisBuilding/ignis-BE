import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import {
  UserPosition,
  UserPositionHistory,
  NavigationSession,
  nodes,
  floor,
  SafePoint,
} from '@app/entities';
import { FireSafetyService } from '../fire_safety.service';

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

export interface NavigationProgress {
  currentInstruction: TurnInstruction;
  nextInstruction: TurnInstruction | null;
  distanceToNext: number;
  deviation: number;
  approachingTurn: boolean;
  reachedTurn: boolean;
  reachedDestination: boolean;
}

@Injectable()
export class NavigationService {
  private readonly logger = new Logger(NavigationService.name);
  private readonly APPROACH_THRESHOLD = 10; // meters
  private readonly REACHED_THRESHOLD = 3; // meters
  private readonly WALKING_SPEED = 1.2; // m/s

  constructor(
    @InjectRepository(UserPosition)
    private positionRepo: Repository<UserPosition>,
    @InjectRepository(UserPositionHistory)
    private positionHistoryRepo: Repository<UserPositionHistory>,
    @InjectRepository(NavigationSession)
    private sessionRepo: Repository<NavigationSession>,
    @InjectRepository(nodes)
    private nodeRepo: Repository<nodes>,
    @InjectRepository(floor)
    private floorRepo: Repository<floor>,
    @InjectRepository(SafePoint)
    private safePointRepo: Repository<SafePoint>,
    private readonly fireSafetyService: FireSafetyService,
    private dataSource: DataSource,
  ) {}

  // ═══════════════════════════════════════════════════════════════
  // POSITION MANAGEMENT
  // ═══════════════════════════════════════════════════════════════

  async updatePosition(data: {
    user_id: number;
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
    device_id?: string;
    position_source?: string;
  }): Promise<UserPosition> {
    const isAnonymous = !data.user_id || data.user_id <= 0;

    // Find existing position: by device_id for anonymous, by user_id for authenticated
    let position: UserPosition | null = null;
    if (isAnonymous && data.device_id) {
      position = await this.positionRepo.findOne({
        where: { deviceId: data.device_id },
      });
    } else if (!isAnonymous) {
      position = await this.positionRepo.findOne({
        where: { userId: data.user_id },
      });
    }

    const nearestNodeId = data.node_id || (await this.findNearestNodeId(data.x, data.y, data.floor_id));

    if (position) {
      // Update existing
      position.buildingId = data.building_id;
      position.floorId = data.floor_id;
      position.x = data.x;
      position.y = data.y;
      position.nearestNodeId = nearestNodeId;
      position.accuracyMeters = data.accuracy;
      position.heading = data.heading;
      position.speed = data.speed;
      position.confidence = data.confidence || 0.5;
      position.sensorData = data.sensor_data;
      position.positionSource = data.position_source || position.positionSource || 'wifi';
      position.timestamp = new Date();
    } else {
      // Create new
      position = this.positionRepo.create({
        userId: isAnonymous ? null : data.user_id,
        deviceId: data.device_id || null,
        buildingId: data.building_id,
        floorId: data.floor_id,
        x: data.x,
        y: data.y,
        nearestNodeId,
        accuracyMeters: data.accuracy,
        heading: data.heading,
        speed: data.speed,
        confidence: data.confidence || 0.5,
        sensorData: data.sensor_data,
        positionSource: data.position_source || 'wifi',
        status: 'active',
      });
    }

    const saved = await this.positionRepo.save(position);

    // Also write to position history for analytics
    try {
      const historyEntry = this.positionHistoryRepo.create({
        userId: isAnonymous ? null : data.user_id,
        deviceId: data.device_id || null,
        buildingId: data.building_id,
        floorId: data.floor_id,
        nodeId: nearestNodeId,
        x: data.x,
        y: data.y,
        heading: data.heading,
        accuracyMeters: data.accuracy,
        positionSource: data.position_source || 'wifi',
      });
      await this.positionHistoryRepo.save(historyEntry);
    } catch (histErr) {
      this.logger.warn(`Failed to write position history: ${histErr.message}`);
    }

    return saved;
  }

  async getLatestPosition(userId: number): Promise<UserPosition | null> {
    return this.positionRepo.findOne({
      where: { userId },
    });
  }

  async updateUserStatus(userId: number, status: string): Promise<void> {
    await this.positionRepo.update({ userId }, { status });
  }

  private async findNearestNodeId(x: number, y: number, floorId: number): Promise<number | null> {
    // Find nearest node using Euclidean distance on local coordinates
    const result = await this.dataSource.query(
      `
      SELECT n.id,
        SQRT(POW(ST_X(n.geometry) - $1, 2) + POW(ST_Y(n.geometry) - $2, 2)) as distance
      FROM nodes n
      WHERE n.floor_id = $3
        AND n.is_accessible = true
      ORDER BY distance
      LIMIT 1
    `,
      [x, y, floorId],
    );

    return result[0]?.id || null;
  }

  // ═══════════════════════════════════════════════════════════════
  // NAVIGATION SESSION MANAGEMENT
  // ═══════════════════════════════════════════════════════════════

  async startNavigation(
    userId: number,
    buildingId: number,
    position: UserPosition,
    destination: 'nearest_exit' | 'safe_point' | number,
  ): Promise<NavigationSession> {
    // End any existing session
    await this.sessionRepo.update(
      { userId, status: 'active' },
      { status: 'aborted', completedAt: new Date() },
    );

    // Determine start node
    const startNodeId = position.nearestNodeId ||
      (await this.findNearestNodeId(position.x, position.y, position.floorId));

    if (!startNodeId) {
      throw new Error('Unable to determine start location for navigation');
    }

    // Determine destination
    let destinationNodeId: number;
    let destinationType: string;

    if (destination === 'nearest_exit') {
      const exitNode = await this.findNearestExit(startNodeId, buildingId);
      destinationNodeId = exitNode.id;
      destinationType = 'nearest_exit';
    } else if (destination === 'safe_point') {
      const safePoint = await this.findSafestPoint(userId, buildingId);
      destinationNodeId = safePoint.nodeId;
      destinationType = 'safe_point';
    } else {
      destinationNodeId = destination;
      destinationType = 'specific_node';
    }

    // Compute route using existing fire safety service
    const routeResult = await this.fireSafetyService.computeRoute({
      startNodeId,
      endNodeId: destinationNodeId,
    });

    // Extract route information from GeoJSON
    const routeFeature = routeResult.features?.[0];
    const routeDistance = routeFeature?.properties?.distance || 0;

    // Get path nodes from floor segments if available, otherwise use start/end
    let pathNodes: number[] = [startNodeId, destinationNodeId];
    if (routeResult.floorSegments && routeResult.floorSegments.length > 0) {
      // Extract node IDs from floor segments
      pathNodes = await this.extractPathNodesFromFloorSegments(routeResult.floorSegments);
      if (pathNodes.length < 2) {
        pathNodes = [startNodeId, destinationNodeId];
      }
    }

    // Generate turn-by-turn instructions
    const instructions = await this.generateInstructions(
      pathNodes,
      position.heading,
    );

    // Calculate total distance and ETA
    const totalDistance = routeDistance || instructions.reduce((sum, i) => sum + i.distance_meters, 0);
    const etaSeconds = Math.ceil(totalDistance / this.WALKING_SPEED);

    // Create session
    const session = this.sessionRepo.create({
      userId,
      buildingId,
      startNodeId,
      startX: position.x,
      startY: position.y,
      startFloorId: position.floorId,
      destinationNodeId,
      destinationType,
      routeGeojson: routeResult.geojson,
      instructions,
      totalDistance,
      remainingDistance: totalDistance,
      etaSeconds,
      currentInstructionIndex: 0,
      progressPercent: 0,
      status: 'active',
    });

    const savedSession = await this.sessionRepo.save(session);

    // Update user position status
    await this.positionRepo.update({ userId }, { status: 'navigating' });

    this.logger.log(
      `Navigation started: User ${userId}, Route ${startNodeId} -> ${destinationNodeId}, Distance: ${totalDistance}m`,
    );

    return savedSession;
  }

  async getActiveSession(userId: number): Promise<NavigationSession | null> {
    return this.sessionRepo.findOne({
      where: { userId, status: 'active' },
    });
  }

  async getActiveSessionsByBuilding(buildingId: number): Promise<NavigationSession[]> {
    return this.sessionRepo.find({
      where: { buildingId, status: 'active' },
    });
  }

  async endSession(sessionId: number, status: 'completed' | 'aborted' = 'completed'): Promise<void> {
    const session = await this.sessionRepo.findOne({ where: { id: sessionId } });
    if (!session) return;

    await this.sessionRepo.update(sessionId, {
      status,
      completedAt: new Date(),
    });

    // Update user status
    const newStatus = status === 'completed' ? 'safe' : 'active';
    await this.positionRepo.update({ userId: session.userId }, { status: newStatus });
  }

  // ═══════════════════════════════════════════════════════════════
  // INSTRUCTION GENERATION
  // ═══════════════════════════════════════════════════════════════

  async generateInstructions(
    path: number[],
    currentHeading?: number,
  ): Promise<TurnInstruction[]> {
    if (!path || path.length === 0) return [];

    const instructions: TurnInstruction[] = [];

    // Get all nodes in path with floor info
    const nodeData = await this.nodeRepo
      .createQueryBuilder('n')
      .leftJoinAndSelect('n.floor', 'f')
      .where('n.id IN (:...ids)', { ids: path })
      .getMany();

    const nodeMap = new Map(nodeData.map((n) => [n.id, n]));

    let cumulativeDistance = 0;
    let previousHeading = currentHeading || 0;

    for (let i = 0; i < path.length; i++) {
      const currentNode = nodeMap.get(path[i]);
      const nextNode = i < path.length - 1 ? nodeMap.get(path[i + 1]) : null;
      const prevNode = i > 0 ? nodeMap.get(path[i - 1]) : null;

      if (!currentNode) continue;

      // Calculate distance to next node
      let distanceToNext = 0;
      if (nextNode) {
        distanceToNext = await this.calculateNodeDistance(currentNode.id, nextNode.id);
      }

      // Determine turn type
      let turnType = this.determineTurnType(prevNode, currentNode, nextNode, previousHeading);

      // Check for floor change
      const isFloorChange = prevNode && prevNode.floor?.id !== currentNode.floor?.id;
      if (isFloorChange) {
        const floorDiff = (currentNode.floor?.level || 0) - (prevNode.floor?.level || 0);
        turnType = floorDiff > 0 ? 'stairs_up' : 'stairs_down';
      }

      // Get final instruction type
      const finalType = this.getFinalInstructionType(turnType, currentNode, i, path.length);

      // Calculate new heading
      let newHeading = previousHeading;
      if (nextNode) {
        newHeading = await this.calculateHeading(currentNode, nextNode);
      }

      // Get node coordinates
      const coordinates = await this.getNodeCoordinates(currentNode.id);

      const instruction: TurnInstruction = {
        index: i,
        type: finalType,
        distance_meters: distanceToNext,
        cumulative_distance: cumulativeDistance,
        node_id: currentNode.id,
        coordinates,
        floor_id: currentNode.floor?.id || 0,
        floor_name: currentNode.floor?.name || 'Unknown Floor',
        heading: newHeading,
        text: '',
        voice_text: '',
        landmark: this.findLandmark(currentNode),
        is_floor_change: isFloorChange,
        warning: this.getWarning(currentNode, nextNode),
      };

      // Generate text
      instruction.text = this.generateInstructionText(instruction, distanceToNext);
      instruction.voice_text = this.generateVoiceText(instruction, distanceToNext);

      instructions.push(instruction);
      cumulativeDistance += distanceToNext;
      previousHeading = newHeading;
    }

    return instructions;
  }

  private determineTurnType(
    prevNode: nodes | null | undefined,
    currentNode: nodes,
    nextNode: nodes | null | undefined,
    previousHeading: number,
  ): string {
    if (!prevNode || !nextNode) return 'straight';

    // Use node type for special cases
    if (currentNode.type === 'stairway') return 'stairs';
    if (currentNode.type === 'elevator') return 'elevator';

    // Calculate turn angle (simplified using node positions)
    // In a full implementation, calculate from geometry
    return 'straight';
  }

  private getFinalInstructionType(
    turnType: string,
    node: nodes,
    index: number,
    totalLength: number,
  ): string {
    if (index === 0) return 'start';
    if (index === totalLength - 1) {
      return node.type === 'exit' || node.type === 'emergency_exit' ? 'exit' : 'safe_point';
    }
    return turnType;
  }

  private generateInstructionText(instruction: TurnInstruction, distance: number): string {
    const distanceText = distance > 0 ? ` for ${Math.round(distance)} meters` : '';

    switch (instruction.type) {
      case 'start':
        return `Start heading ${this.getDirectionName(instruction.heading)}${distanceText}`;
      case 'straight':
        return `Continue straight${distanceText}`;
      case 'turn_left':
        return `Turn left${instruction.landmark ? ` at ${instruction.landmark}` : ''}${distanceText}`;
      case 'turn_right':
        return `Turn right${instruction.landmark ? ` at ${instruction.landmark}` : ''}${distanceText}`;
      case 'stairs_up':
        return `Take the stairs up to ${instruction.floor_name}`;
      case 'stairs_down':
        return `Take the stairs down to ${instruction.floor_name}`;
      case 'elevator':
        return `Take the elevator to ${instruction.floor_name}`;
      case 'exit':
        return 'You have reached the exit';
      case 'safe_point':
        return 'You have reached the safe point';
      default:
        return `Continue${distanceText}`;
    }
  }

  private generateVoiceText(instruction: TurnInstruction, distance: number): string {
    switch (instruction.type) {
      case 'start':
        return `Start heading ${this.getDirectionName(instruction.heading)}`;
      case 'straight':
        return 'Continue straight';
      case 'turn_left':
        return 'Turn left';
      case 'turn_right':
        return 'Turn right';
      case 'slight_left':
        return 'Bear left';
      case 'slight_right':
        return 'Bear right';
      case 'u_turn':
        return 'Turn around';
      case 'stairs_up':
        return `Take the stairs up to ${instruction.floor_name}`;
      case 'stairs_down':
        return `Take the stairs down to ${instruction.floor_name}`;
      case 'elevator':
        return `Take the elevator to ${instruction.floor_name}`;
      case 'exit':
        return 'You have reached the exit. You are safe.';
      case 'safe_point':
        return 'You have reached the safe point. Wait here for rescue.';
      default:
        return 'Continue';
    }
  }

  private getDirectionName(heading: number): string {
    const directions = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
    const index = Math.round(heading / 45) % 8;
    return directions[index];
  }

  private findLandmark(node: nodes): string | undefined {
    if (node.type === 'elevator') return 'the elevator';
    if (node.type === 'stairway') return 'the stairs';
    if (node.type === 'exit') return 'the exit';
    if (node.description) return node.description;
    return undefined;
  }

  private getWarning(currentNode: nodes, nextNode: nodes | null | undefined): string | undefined {
    if (nextNode?.type === 'stairway') return 'Caution: stairs ahead';
    return undefined;
  }

  private async calculateNodeDistance(nodeId1: number, nodeId2: number): Promise<number> {
    const result = await this.dataSource.query(
      `
      SELECT ST_Distance(n1.geometry, n2.geometry) as distance
      FROM nodes n1, nodes n2
      WHERE n1.id = $1 AND n2.id = $2
    `,
      [nodeId1, nodeId2],
    );

    return result[0]?.distance || 0;
  }

  private async calculateHeading(fromNode: nodes, toNode: nodes): Promise<number> {
    const result = await this.dataSource.query(
      `
      SELECT degrees(ST_Azimuth(n1.geometry, n2.geometry)) as heading
      FROM nodes n1, nodes n2
      WHERE n1.id = $1 AND n2.id = $2
    `,
      [fromNode.id, toNode.id],
    );

    return result[0]?.heading || 0;
  }

  private async getNodeCoordinates(nodeId: number): Promise<[number, number]> {
    const result = await this.dataSource.query(
      `
      SELECT ST_X(geometry) as x, ST_Y(geometry) as y
      FROM nodes
      WHERE id = $1
    `,
      [nodeId],
    );

    return [result[0]?.x || 0, result[0]?.y || 0];
  }

  // ═══════════════════════════════════════════════════════════════
  // PROGRESS TRACKING
  // ═══════════════════════════════════════════════════════════════

  async updateProgress(
    sessionId: number,
    position: UserPosition,
  ): Promise<NavigationProgress> {
    const session = await this.sessionRepo.findOne({ where: { id: sessionId } });
    if (!session || !session.instructions) {
      throw new Error('Session not found');
    }

    const instructions = session.instructions as TurnInstruction[];
    const currentIdx = session.currentInstructionIndex || 0;
    const currentInstruction = instructions[currentIdx];
    const nextInstruction = instructions[currentIdx + 1] || null;

    // Calculate distance to current instruction point
    const distanceToNext = Math.sqrt(
      Math.pow(position.x - currentInstruction.coordinates[0], 2) +
        Math.pow(position.y - currentInstruction.coordinates[1], 2),
    );

    // Calculate deviation from route (simplified - distance to nearest point on route)
    const deviation = await this.calculateRouteDeviation(session, position);

    const approachingTurn = distanceToNext < this.APPROACH_THRESHOLD && distanceToNext > this.REACHED_THRESHOLD;
    const reachedTurn = distanceToNext <= this.REACHED_THRESHOLD;

    if (reachedTurn && nextInstruction) {
      // Update session to next instruction
      const progress = Math.round(((currentIdx + 1) / instructions.length) * 100);
      const remainingDistance = session.totalDistance - currentInstruction.cumulative_distance;

      await this.sessionRepo.update(sessionId, {
        currentInstructionIndex: currentIdx + 1,
        progressPercent: progress,
        remainingDistance,
        lastPositionAt: new Date(),
      });
    }

    const reachedDestination = reachedTurn && !nextInstruction;

    if (reachedDestination) {
      await this.endSession(sessionId, 'completed');
    }

    return {
      currentInstruction,
      nextInstruction,
      distanceToNext,
      deviation,
      approachingTurn,
      reachedTurn,
      reachedDestination,
    };
  }

  private async calculateRouteDeviation(
    session: NavigationSession,
    position: UserPosition,
  ): Promise<number> {
    // Simplified: calculate distance from position to nearest instruction point
    const instructions = session.instructions as TurnInstruction[];
    let minDistance = Infinity;

    for (const inst of instructions) {
      const distance = Math.sqrt(
        Math.pow(position.x - inst.coordinates[0], 2) +
          Math.pow(position.y - inst.coordinates[1], 2),
      );
      minDistance = Math.min(minDistance, distance);
    }

    return minDistance;
  }

  // ═══════════════════════════════════════════════════════════════
  // REROUTING
  // ═══════════════════════════════════════════════════════════════

  async rerouteSession(
    sessionId: number,
    currentPosition: UserPosition,
    reason: string,
  ): Promise<NavigationSession> {
    const session = await this.sessionRepo.findOne({ where: { id: sessionId } });
    if (!session) throw new Error('Session not found');

    const startNodeId = currentPosition.nearestNodeId ||
      (await this.findNearestNodeId(currentPosition.x, currentPosition.y, currentPosition.floorId));

    // Recompute route
    const routeResult = await this.fireSafetyService.computeRoute({
      startNodeId,
      endNodeId: session.destinationNodeId,
    });

    // Extract path nodes
    let pathNodes: number[] = [startNodeId, session.destinationNodeId];
    if (routeResult.floorSegments && routeResult.floorSegments.length > 0) {
      pathNodes = await this.extractPathNodesFromFloorSegments(routeResult.floorSegments);
      if (pathNodes.length < 2) {
        pathNodes = [startNodeId, session.destinationNodeId];
      }
    }

    const instructions = await this.generateInstructions(
      pathNodes,
      currentPosition.heading,
    );

    const routeFeature = routeResult.features?.[0];
    const totalDistance = routeFeature?.properties?.distance || instructions.reduce((sum, i) => sum + i.distance_meters, 0);
    const etaSeconds = Math.ceil(totalDistance / this.WALKING_SPEED);

    await this.sessionRepo.update(sessionId, {
      startNodeId,
      startX: currentPosition.x,
      startY: currentPosition.y,
      startFloorId: currentPosition.floorId,
      routeGeojson: routeResult.geojson,
      instructions,
      totalDistance,
      remainingDistance: totalDistance,
      etaSeconds,
      currentInstructionIndex: 0,
      progressPercent: 0,
      rerouteCount: session.rerouteCount + 1,
      lastRerouteReason: reason,
    });

    return this.sessionRepo.findOne({ where: { id: sessionId } });
  }

  async isRouteBlocked(sessionId: number, fireEvent: any): Promise<boolean> {
    const session = await this.sessionRepo.findOne({ where: { id: sessionId } });
    if (!session) return false;

    // Check if fire is on the same floor and close to route
    // Simplified check - in production, use spatial intersection
    const instructions = session.instructions as TurnInstruction[];

    for (const inst of instructions) {
      if (inst.floor_id === fireEvent.floor_id) {
        // Fire is on same floor as part of route
        return true;
      }
    }

    return false;
  }

  // ═══════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════

  async findNearestExit(startNodeId: number, buildingId: number): Promise<nodes> {
    const result = await this.dataSource.query(
      `
      SELECT n.*,
        ST_Distance(n.geometry, start_node.geometry) as distance
      FROM nodes n
      CROSS JOIN (SELECT geometry FROM nodes WHERE id = $1) as start_node
      WHERE n.type IN ('exit', 'emergency_exit')
        AND n.floor_id IN (SELECT id FROM floor WHERE building_id = $2)
        AND n.is_accessible = true
      ORDER BY distance
      LIMIT 1
    `,
      [startNodeId, buildingId],
    );

    if (!result[0]) {
      throw new Error('No accessible exit found');
    }

    return result[0];
  }

  /**
   * Extract path node IDs from floor segments
   */
  private async extractPathNodesFromFloorSegments(floorSegments: any[]): Promise<number[]> {
    const nodeIds: number[] = [];

    for (const segment of floorSegments) {
      // Each segment should have node references
      if (segment.startNodeId && !nodeIds.includes(segment.startNodeId)) {
        nodeIds.push(segment.startNodeId);
      }
      if (segment.endNodeId && !nodeIds.includes(segment.endNodeId)) {
        nodeIds.push(segment.endNodeId);
      }
    }

    // If we couldn't extract nodes from segments, try to get them from geometry
    if (nodeIds.length < 2 && floorSegments.length > 0) {
      // Fallback: get nodes near the segment endpoints
      for (const segment of floorSegments) {
        if (segment.geometry?.coordinates) {
          const coords = segment.geometry.coordinates;
          const startCoord = coords[0];
          const endCoord = coords[coords.length - 1];

          if (startCoord) {
            const nearestStart = await this.findNearestNodeByCoords(
              startCoord[0],
              startCoord[1],
              segment.floorId,
            );
            if (nearestStart && !nodeIds.includes(nearestStart)) {
              nodeIds.push(nearestStart);
            }
          }

          if (endCoord) {
            const nearestEnd = await this.findNearestNodeByCoords(
              endCoord[0],
              endCoord[1],
              segment.floorId,
            );
            if (nearestEnd && !nodeIds.includes(nearestEnd)) {
              nodeIds.push(nearestEnd);
            }
          }
        }
      }
    }

    return nodeIds;
  }

  private async findNearestNodeByCoords(x: number, y: number, floorId: number): Promise<number | null> {
    const result = await this.dataSource.query(
      `
      SELECT n.id
      FROM nodes n
      WHERE n.floor_id = $3
        AND n.is_accessible = true
      ORDER BY ST_Distance(n.geometry, ST_SetSRID(ST_MakePoint($1, $2), 3857))
      LIMIT 1
    `,
      [x, y, floorId],
    );

    return result[0]?.id || null;
  }

  async findSafestPoint(userId: number, buildingId: number): Promise<any> {
    const position = await this.getLatestPosition(userId);

    const result = await this.dataSource.query(
      `
      SELECT sp.*, n.geometry, f.name as floor_name,
        ST_X(n.geometry) as x, ST_Y(n.geometry) as y,
        ST_Distance(n.geometry, user_pos.geometry) as distance
      FROM safe_points sp
      JOIN nodes n ON sp.node_id = n.id
      JOIN floor f ON sp.floor_id = f.id
      CROSS JOIN (
        SELECT ST_SetSRID(ST_MakePoint($1, $2), 3857) as geometry
      ) as user_pos
      WHERE f.building_id = $3
      ORDER BY
        sp.priority ASC,
        distance ASC
      LIMIT 1
    `,
      [position?.x || 0, position?.y || 0, buildingId],
    );

    if (!result[0]) {
      throw new Error('No safe point found');
    }

    // Return format matching Android SafePointInfo data class
    return {
      node_id: result[0].node_id,
      floor_id: result[0].floor_id,
      coordinates: [result[0].x || 0, result[0].y || 0],
      name: result[0].notes || 'Safe Point',
      instructions: 'Go to this location and wait for rescue',
      // Additional fields for web dashboard (backwards compatible)
      floor_name: result[0].floor_name,
      has_window: result[0].has_window,
      has_external_access: result[0].has_external_access,
    };
  }

  async getEvacuationStats(buildingId: number): Promise<any> {
    const [positions, sessions] = await Promise.all([
      this.positionRepo.find({ where: { buildingId } }),
      this.sessionRepo.find({ where: { buildingId } }),
    ]);

    const activeSessions = sessions.filter((s) => s.status === 'active');
    const completedSessions = sessions.filter((s) => s.status === 'completed');
    const trappedPositions = positions.filter((p) => p.status === 'trapped');

    return {
      total: positions.length,
      navigating: activeSessions.length,
      safe: completedSessions.length,
      trapped: trappedPositions.length,
    };
  }
}
