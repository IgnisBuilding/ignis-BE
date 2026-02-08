import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';

/**
 * Information about an isolated occupant location
 */
export interface IsolationInfo {
  nodeId: number;
  nodeName: string;
  floorId: number | null;
  floorName: string | null;
  isolationReason: IsolationReason;
  blockingHazardIds: number[];
  nearestFireDistance: number | null;
  priorityScore: number;
  priorityLevel: PriorityLevel;
  shelterInstructions: string;
  hasWindow: boolean;
  hasExternalAccess: boolean;
  coordinates: { longitude: number; latitude: number } | null;
}

/**
 * Possible reasons why a node becomes isolated
 */
export enum IsolationReason {
  LOCATION_ON_FIRE = 'LOCATION_ON_FIRE',
  FIRE_BLOCKED_ALL_EXITS = 'FIRE_BLOCKED_ALL_EXITS',
  FIRE_BLOCKED_EXITS_HAS_SAFE_POINT = 'FIRE_BLOCKED_EXITS_HAS_SAFE_POINT',
  STRUCTURAL_COLLAPSE = 'STRUCTURAL_COLLAPSE',
  SMOKE_FILLED_CORRIDORS = 'SMOKE_FILLED_CORRIDORS',
  NO_GRAPH_CONNECTIVITY = 'NO_GRAPH_CONNECTIVITY',
}

/**
 * Priority levels for rescue operations
 */
export enum PriorityLevel {
  CRITICAL = 'CRITICAL', // Score >= 180: Immediate danger, highest priority
  HIGH = 'HIGH', // Score >= 120: Significant danger
  MEDIUM = 'MEDIUM', // Score >= 60: Moderate danger
  LOW = 'LOW', // Score < 60: Lower priority, but still trapped
}

/**
 * Trapped occupant status
 */
export enum TrappedStatus {
  TRAPPED = 'TRAPPED',
  AWAITING_RESCUE = 'AWAITING_RESCUE',
  RESCUE_IN_PROGRESS = 'RESCUE_IN_PROGRESS',
  RESCUED = 'RESCUED',
  EVACUATED = 'EVACUATED',
  DECEASED = 'DECEASED',
}

/**
 * Rescue team status
 */
export enum RescueTeamStatus {
  AVAILABLE = 'AVAILABLE',
  ASSIGNED = 'ASSIGNED',
  EN_ROUTE = 'EN_ROUTE',
  ON_SCENE = 'ON_SCENE',
  RETURNING = 'RETURNING',
  OFF_DUTY = 'OFF_DUTY',
}

@Injectable()
export class IsolationDetectionService {
  private readonly logger = new Logger(IsolationDetectionService.name);

  // Distance thresholds in meters
  private readonly CRITICAL_FIRE_DISTANCE = 5; // meters - extremely close to fire
  private readonly HIGH_RISK_FIRE_DISTANCE = 15; // meters - significant risk
  private readonly SAFE_FIRE_DISTANCE = 30; // meters - relatively safer

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Analyzes why a node is isolated and returns detailed isolation information
   *
   * @param nodeId - The node ID that has no evacuation path
   * @param blockedNodeIds - Array of node IDs that are currently blocked (fire zones)
   * @returns IsolationInfo with detailed analysis of the isolation
   */
  async analyzeIsolation(
    nodeId: number,
    blockedNodeIds: number[],
  ): Promise<IsolationInfo> {
    this.logger.log(`Analyzing isolation for node ${nodeId}`);

    // Get node details
    const nodeInfo = await this.getNodeInfo(nodeId);

    // Determine isolation reason
    const isolationReason = await this.determineIsolationReason(
      nodeId,
      blockedNodeIds,
    );

    // Get blocking hazard IDs
    const blockingHazardIds = await this.getBlockingHazards(
      nodeId,
      blockedNodeIds,
    );

    // Calculate distance to nearest fire
    const nearestFireDistance = await this.calculateNearestFireDistance(nodeId);

    // Check room characteristics
    const roomCharacteristics = await this.getRoomCharacteristics(nodeId);

    // Calculate priority score
    const priorityScore = this.calculatePriorityScore(
      isolationReason,
      nearestFireDistance,
      roomCharacteristics,
    );

    // Determine priority level
    const priorityLevel = this.getPriorityLevel(priorityScore);

    // Generate shelter-in-place instructions
    const shelterInstructions = this.generateShelterInstructions(
      isolationReason,
      roomCharacteristics,
      nearestFireDistance,
    );

    // Get coordinates for quick mapping
    const coordinates = await this.getNodeCoordinates(nodeId);

    return {
      nodeId,
      nodeName: nodeInfo.name || `Node ${nodeId}`,
      floorId: nodeInfo.floorId,
      floorName: nodeInfo.floorName,
      isolationReason,
      blockingHazardIds,
      nearestFireDistance,
      priorityScore,
      priorityLevel,
      shelterInstructions,
      hasWindow: roomCharacteristics.hasWindow,
      hasExternalAccess: roomCharacteristics.hasExternalAccess,
      coordinates,
    };
  }

  /**
   * Registers a trapped occupant in the system for rescue prioritization
   *
   * @param isolationInfo - The isolation analysis result
   * @param occupantDetails - Additional details about the trapped occupants
   * @returns The created trapped_occupant record ID
   */
  async registerTrappedOccupant(
    isolationInfo: IsolationInfo,
    occupantDetails: {
      occupantCount?: number;
      hasElderly?: boolean;
      hasDisabled?: boolean;
      hasChildren?: boolean;
      contactNumber?: string;
    } = {},
  ): Promise<number> {
    this.logger.log(
      `Registering trapped occupant at node ${isolationInfo.nodeId}`,
    );

    // Check if already registered
    const existing = await this.dataSource.query(
      `SELECT id FROM trapped_occupants
       WHERE node_id = $1 AND status NOT IN ('RESCUED', 'EVACUATED')`,
      [isolationInfo.nodeId],
    );

    if (existing && existing.length > 0) {
      // Update existing record
      await this.dataSource.query(
        `UPDATE trapped_occupants SET
         occupant_count = COALESCE($2, occupant_count),
         has_elderly = COALESCE($3, has_elderly),
         has_disabled = COALESCE($4, has_disabled),
         has_children = COALESCE($5, has_children),
         contact_number = COALESCE($6, contact_number),
         isolation_reason = $7,
         blocking_hazard_ids = $8,
         nearest_fire_distance = $9,
         last_contact_at = NOW(),
         updated_at = NOW()
        WHERE id = $1`,
        [
          existing[0].id,
          occupantDetails.occupantCount,
          occupantDetails.hasElderly,
          occupantDetails.hasDisabled,
          occupantDetails.hasChildren,
          occupantDetails.contactNumber,
          isolationInfo.isolationReason,
          isolationInfo.blockingHazardIds,
          isolationInfo.nearestFireDistance,
        ],
      );

      this.logger.log(
        `Updated existing trapped occupant record ${existing[0].id}`,
      );
      return existing[0].id;
    }

    // Create new record - the trigger will calculate priority_score and priority_level
    const result = await this.dataSource.query(
      `INSERT INTO trapped_occupants (
        node_id, floor_id, room_name,
        occupant_count, has_elderly, has_disabled, has_children, contact_number,
        isolation_reason, blocking_hazard_ids, nearest_fire_distance,
        priority_score, priority_level, status,
        shelter_instructions, has_window, has_external_access,
        longitude, latitude
      ) VALUES (
        $1, $2, $3,
        $4, $5, $6, $7, $8,
        $9, $10, $11,
        $12, $13, $14,
        $15, $16, $17,
        $18, $19
      ) RETURNING id`,
      [
        isolationInfo.nodeId,
        isolationInfo.floorId,
        isolationInfo.nodeName,
        occupantDetails.occupantCount || 1,
        occupantDetails.hasElderly || false,
        occupantDetails.hasDisabled || false,
        occupantDetails.hasChildren || false,
        occupantDetails.contactNumber || null,
        isolationInfo.isolationReason,
        isolationInfo.blockingHazardIds,
        isolationInfo.nearestFireDistance,
        isolationInfo.priorityScore,
        isolationInfo.priorityLevel,
        TrappedStatus.TRAPPED,
        isolationInfo.shelterInstructions,
        isolationInfo.hasWindow,
        isolationInfo.hasExternalAccess,
        isolationInfo.coordinates?.longitude,
        isolationInfo.coordinates?.latitude,
      ],
    );

    const trappedId = result[0].id;

    // Log the isolation event
    await this.logIsolationEvent(
      'NODE_ISOLATED',
      isolationInfo.nodeId,
      trappedId,
      {
        isolationReason: isolationInfo.isolationReason,
        priorityScore: isolationInfo.priorityScore,
        priorityLevel: isolationInfo.priorityLevel,
        blockingHazards: isolationInfo.blockingHazardIds,
      },
    );

    this.logger.log(`Created trapped occupant record ${trappedId}`);
    return trappedId;
  }

  /**
   * Gets all currently trapped occupants ordered by priority
   */
  async getTrappedOccupantsByPriority(): Promise<any[]> {
    return this.dataSource.query(
      `SELECT
        to_.*,
        rt.team_name as assigned_team_name,
        rt.team_code as assigned_team_code,
        rt.status as team_status
      FROM trapped_occupants to_
      LEFT JOIN rescue_teams rt ON to_.assigned_team_id = rt.id
      WHERE to_.status NOT IN ('RESCUED', 'EVACUATED')
      ORDER BY
        CASE to_.priority_level
          WHEN 'CRITICAL' THEN 1
          WHEN 'HIGH' THEN 2
          WHEN 'MEDIUM' THEN 3
          WHEN 'LOW' THEN 4
        END,
        to_.priority_score DESC,
        to_.trapped_at ASC`,
    );
  }

  /**
   * Assigns a rescue team to a trapped occupant
   */
  async assignRescueTeam(
    trappedOccupantId: number,
    rescueTeamId: number,
    estimatedRescueMinutes?: number,
  ): Promise<void> {
    const estimatedTime = estimatedRescueMinutes
      ? `NOW() + INTERVAL '${estimatedRescueMinutes} minutes'`
      : 'NULL';

    await this.dataSource.query(
      `UPDATE trapped_occupants SET
        assigned_team_id = $1,
        estimated_rescue_time = ${estimatedTime},
        status = '${TrappedStatus.AWAITING_RESCUE}',
        updated_at = NOW()
      WHERE id = $2`,
      [rescueTeamId, trappedOccupantId],
    );

    await this.dataSource.query(
      `UPDATE rescue_teams SET
        current_assignment_id = $1,
        status = '${RescueTeamStatus.ASSIGNED}',
        last_status_update = NOW()
      WHERE id = $2`,
      [trappedOccupantId, rescueTeamId],
    );

    // Get trapped occupant details for event logging
    const trapped = await this.dataSource.query(
      `SELECT node_id FROM trapped_occupants WHERE id = $1`,
      [trappedOccupantId],
    );

    await this.logIsolationEvent(
      'RESCUE_TEAM_ASSIGNED',
      trapped[0].node_id,
      trappedOccupantId,
      { rescueTeamId, estimatedRescueMinutes },
      rescueTeamId,
    );
  }

  /**
   * Marks a trapped occupant as rescued
   */
  async markAsRescued(trappedOccupantId: number): Promise<void> {
    await this.dataSource.query(
      `UPDATE trapped_occupants SET
        status = '${TrappedStatus.RESCUED}',
        rescued_at = NOW(),
        actual_rescue_time = NOW(),
        updated_at = NOW()
      WHERE id = $1`,
      [trappedOccupantId],
    );

    // Free up the rescue team
    await this.dataSource.query(
      `UPDATE rescue_teams SET
        current_assignment_id = NULL,
        status = '${RescueTeamStatus.AVAILABLE}',
        last_status_update = NOW()
      WHERE current_assignment_id = $1`,
      [trappedOccupantId],
    );

    const trapped = await this.dataSource.query(
      `SELECT node_id, assigned_team_id FROM trapped_occupants WHERE id = $1`,
      [trappedOccupantId],
    );

    await this.logIsolationEvent(
      'OCCUPANT_RESCUED',
      trapped[0].node_id,
      trappedOccupantId,
      {},
      trapped[0].assigned_team_id,
    );
  }

  /**
   * Gets available rescue teams
   */
  async getAvailableRescueTeams(): Promise<any[]> {
    return this.dataSource.query(
      `SELECT * FROM rescue_teams
       WHERE status = '${RescueTeamStatus.AVAILABLE}'
       ORDER BY
         has_medical DESC,
         has_heavy_equipment DESC,
         member_count DESC`,
    );
  }

  /**
   * Gets all rescue teams with their current assignments
   */
  async getAllRescueTeams(): Promise<any[]> {
    return this.dataSource.query(
      `SELECT
        rt.*,
        to_.id as assignment_trapped_id,
        to_.room_name as assignment_location,
        to_.priority_level as assignment_priority,
        to_.occupant_count as assignment_occupant_count
      FROM rescue_teams rt
      LEFT JOIN trapped_occupants to_ ON rt.current_assignment_id = to_.id
      ORDER BY rt.team_code`,
    );
  }

  // ============================================
  // PRIVATE HELPER METHODS
  // ============================================

  /**
   * Gets node information including room/floor details
   */
  private async getNodeInfo(nodeId: number): Promise<{
    name: string | null;
    floorId: number | null;
    floorName: string | null;
  }> {
    const result = await this.dataSource.query(
      `SELECT
        n.id,
        COALESCE(r.name, a.unit_number, 'Node ' || n.id) as name,
        n.floor_id,
        f.name as floor_name
      FROM nodes n
      LEFT JOIN room r ON ST_Contains(r.geometry, n.geometry)
      LEFT JOIN apartment a ON n.apartment_id = a.id
      LEFT JOIN floor f ON n.floor_id = f.id
      WHERE n.id = $1`,
      [nodeId],
    );

    if (!result || result.length === 0) {
      return { name: null, floorId: null, floorName: null };
    }

    return {
      name: result[0].name,
      floorId: result[0].floor_id,
      floorName: result[0].floor_name,
    };
  }

  /**
   * Determines the reason why a node is isolated
   */
  private async determineIsolationReason(
    nodeId: number,
    blockedNodeIds: number[],
  ): Promise<IsolationReason> {
    // Check if the node itself is on fire
    if (blockedNodeIds.includes(nodeId)) {
      return IsolationReason.LOCATION_ON_FIRE;
    }

    // Check if there are exits but all paths to them are blocked
    const hasReachableExit = await this.checkIfExitReachable(
      nodeId,
      blockedNodeIds,
    );

    if (!hasReachableExit) {
      // Check if there's at least a safe point reachable
      const hasSafePoint = await this.checkIfSafePointReachable(
        nodeId,
        blockedNodeIds,
      );

      if (hasSafePoint) {
        return IsolationReason.FIRE_BLOCKED_EXITS_HAS_SAFE_POINT;
      }

      return IsolationReason.FIRE_BLOCKED_ALL_EXITS;
    }

    // If we reach here, it's a graph connectivity issue
    return IsolationReason.NO_GRAPH_CONNECTIVITY;
  }

  /**
   * Checks if any exit is reachable from the node
   */
  private async checkIfExitReachable(
    nodeId: number,
    blockedNodeIds: number[],
  ): Promise<boolean> {
    // First check if there are any exit nodes in the database
    const exitNodesCheck = await this.dataSource.query(
      `SELECT COUNT(*) as count FROM nodes WHERE type IN ('exit', 'emergency_exit', 'fire_exit', 'stairway', 'stairs', 'door')`,
    );

    if (!exitNodesCheck[0]?.count || parseInt(exitNodesCheck[0].count) === 0) {
      // No exit nodes defined - cannot determine reachability
      this.logger.warn('No exit nodes found in database - cannot check exit reachability');
      return false;
    }

    const blockedList =
      blockedNodeIds.length > 0 ? blockedNodeIds.join(',') : '-1';

    // Build the edge query string with blocked nodes directly embedded
    // pgr_dijkstra executes the query in its own context, so we can't use CTEs
    const edgeQuery = `
      SELECT e.id * 2 as id, e.source_id as source, e.target_id as target, e.cost
      FROM edges e
      WHERE e.source_id NOT IN (${blockedList})
        AND e.target_id NOT IN (${blockedList})
      UNION ALL
      SELECT e.id * 2 + 1 as id, e.target_id as source, e.source_id as target, e.cost
      FROM edges e
      WHERE e.source_id NOT IN (${blockedList})
        AND e.target_id NOT IN (${blockedList})
    `.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();

    try {
      const result = await this.dataSource.query(
        `WITH exit_nodes AS (
          SELECT id as node_id FROM nodes WHERE type IN ('exit', 'emergency_exit', 'fire_exit', 'stairway', 'stairs', 'door')
        )
        SELECT EXISTS (
          SELECT 1 FROM pgr_dijkstra(
            $2,
            $1::integer,
            ARRAY(SELECT node_id FROM exit_nodes WHERE node_id IS NOT NULL)::integer[],
            false
          )
          WHERE edge != -1
          LIMIT 1
        ) as has_path`,
        [nodeId, edgeQuery],
      );

      return result[0]?.has_path || false;
    } catch (error) {
      this.logger.error(`Error checking exit reachability: ${error.message}`);
      return false;
    }
  }

  /**
   * Checks if any safe point is reachable from the node
   */
  private async checkIfSafePointReachable(
    nodeId: number,
    blockedNodeIds: number[],
  ): Promise<boolean> {
    // First check if there are any safe points in the database
    const safePointsCheck = await this.dataSource.query(
      `SELECT COUNT(*) as count FROM safe_points`,
    );

    if (!safePointsCheck[0]?.count || parseInt(safePointsCheck[0].count) === 0) {
      // No safe points defined - cannot determine reachability
      this.logger.warn('No safe points found in database - cannot check safe point reachability');
      return false;
    }

    const blockedList =
      blockedNodeIds.length > 0 ? blockedNodeIds.join(',') : '-1';

    // Build the edge query string with blocked nodes directly embedded
    // pgr_dijkstra executes the query in its own context, so we can't use CTEs
    const edgeQuery = `
      SELECT e.id * 2 as id, e.source_id as source, e.target_id as target, e.cost
      FROM edges e
      WHERE e.source_id NOT IN (${blockedList})
        AND e.target_id NOT IN (${blockedList})
      UNION ALL
      SELECT e.id * 2 + 1 as id, e.target_id as source, e.source_id as target, e.cost
      FROM edges e
      WHERE e.source_id NOT IN (${blockedList})
        AND e.target_id NOT IN (${blockedList})
    `.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();

    try {
      const result = await this.dataSource.query(
        `WITH safe_point_nodes AS (
          SELECT node_id FROM safe_points
        )
        SELECT EXISTS (
          SELECT 1 FROM pgr_dijkstra(
            $2,
            $1::integer,
            ARRAY(SELECT node_id FROM safe_point_nodes WHERE node_id IS NOT NULL)::integer[],
            false
          )
          WHERE edge != -1
          LIMIT 1
        ) as has_path`,
        [nodeId, edgeQuery],
      );

      return result[0]?.has_path || false;
    } catch (error) {
      this.logger.error(`Error checking safe point reachability: ${error.message}`);
      return false;
    }
  }

  /**
   * Gets the hazard IDs that are blocking evacuation
   */
  private async getBlockingHazards(
    nodeId: number,
    blockedNodeIds: number[],
  ): Promise<number[]> {
    if (blockedNodeIds.length === 0) return [];

    const result = await this.dataSource.query(
      `SELECT h.id
       FROM hazards h
       WHERE h.node_id = ANY($1::integer[])
         AND h.status = 'active'`,
      [blockedNodeIds],
    );

    return result.map((r: any) => r.id);
  }

  /**
   * Calculates distance to the nearest active fire
   */
  private async calculateNearestFireDistance(
    nodeId: number,
  ): Promise<number | null> {
    const result = await this.dataSource.query(
      `SELECT MIN(
        ST_Distance(
          ST_Transform(n_occupant.geometry, 4326)::geography,
          ST_Transform(n_fire.geometry, 4326)::geography
        )
      ) as distance_meters
      FROM nodes n_occupant
      CROSS JOIN hazards h
      JOIN nodes n_fire ON h.node_id = n_fire.id
      WHERE n_occupant.id = $1
        AND h.status = 'active'`,
      [nodeId],
    );

    return result[0]?.distance_meters || null;
  }

  /**
   * Gets room characteristics for the node location
   */
  private async getRoomCharacteristics(nodeId: number): Promise<{
    hasWindow: boolean;
    hasExternalAccess: boolean;
    roomCapacity: number | null;
  }> {
    // In a real implementation, this would query room features
    // For now, we'll make reasonable assumptions based on node type
    const result = await this.dataSource.query(
      `SELECT
        n.type,
        COALESCE(
          EXISTS(SELECT 1 FROM features f JOIN room r ON f.room_id = r.id
                 WHERE ST_Contains(r.geometry, n.geometry)
                 AND f.type IN ('WINDOW', 'BALCONY')),
          false
        ) as has_window,
        COALESCE(
          EXISTS(SELECT 1 FROM features f JOIN room r ON f.room_id = r.id
                 WHERE ST_Contains(r.geometry, n.geometry)
                 AND f.type IN ('FIRE_ESCAPE', 'BALCONY', 'EMERGENCY_LADDER')),
          false
        ) as has_external_access
      FROM nodes n
      WHERE n.id = $1`,
      [nodeId],
    );

    return {
      hasWindow: result[0]?.has_window || false,
      hasExternalAccess: result[0]?.has_external_access || false,
      roomCapacity: null, // Would need room data
    };
  }

  /**
   * Calculates priority score based on isolation details
   *
   * Higher scores = more urgent rescue needed
   * Score range: 0-300+
   */
  private calculatePriorityScore(
    isolationReason: IsolationReason,
    nearestFireDistance: number | null,
    roomCharacteristics: {
      hasWindow: boolean;
      hasExternalAccess: boolean;
    },
    occupantDetails?: {
      hasElderly?: boolean;
      hasDisabled?: boolean;
      hasChildren?: boolean;
      occupantCount?: number;
    },
  ): number {
    let score = 0;

    // Base score by isolation reason
    switch (isolationReason) {
      case IsolationReason.LOCATION_ON_FIRE:
        score = 200;
        break;
      case IsolationReason.FIRE_BLOCKED_ALL_EXITS:
        score = 150;
        break;
      case IsolationReason.FIRE_BLOCKED_EXITS_HAS_SAFE_POINT:
        score = 100;
        break;
      case IsolationReason.STRUCTURAL_COLLAPSE:
        score = 180;
        break;
      case IsolationReason.SMOKE_FILLED_CORRIDORS:
        score = 120;
        break;
      default:
        score = 50;
    }

    // Fire proximity bonus (closer = higher priority)
    if (nearestFireDistance !== null && nearestFireDistance > 0) {
      const proximityBonus = Math.min(Math.round(50 / nearestFireDistance), 50);
      score += proximityBonus;
    }

    // Vulnerable occupant bonuses
    if (occupantDetails?.hasElderly) score += 30;
    if (occupantDetails?.hasDisabled) score += 30;
    if (occupantDetails?.hasChildren) score += 20;

    // Multiple occupants bonus
    if (occupantDetails?.occupantCount && occupantDetails.occupantCount > 1) {
      score += Math.min(occupantDetails.occupantCount * 5, 25);
    }

    // Room factors (harder to rescue = higher priority)
    if (!roomCharacteristics.hasWindow) score += 15;
    if (!roomCharacteristics.hasExternalAccess) score += 10;

    return score;
  }

  /**
   * Determines priority level from score
   */
  private getPriorityLevel(score: number): PriorityLevel {
    if (score >= 180) return PriorityLevel.CRITICAL;
    if (score >= 120) return PriorityLevel.HIGH;
    if (score >= 60) return PriorityLevel.MEDIUM;
    return PriorityLevel.LOW;
  }

  /**
   * Generates shelter-in-place instructions based on situation
   */
  private generateShelterInstructions(
    isolationReason: IsolationReason,
    roomCharacteristics: { hasWindow: boolean; hasExternalAccess: boolean },
    nearestFireDistance: number | null,
  ): string {
    const instructions: string[] = [];

    // Basic shelter instructions
    instructions.push('SHELTER IN PLACE - Rescue team has been notified.');

    // Fire proximity warnings
    if (nearestFireDistance !== null) {
      if (nearestFireDistance < this.CRITICAL_FIRE_DISTANCE) {
        instructions.push(
          '⚠️ CRITICAL: Fire very close. Move away from walls near fire.',
        );
      } else if (nearestFireDistance < this.HIGH_RISK_FIRE_DISTANCE) {
        instructions.push(
          '⚠️ Fire nearby. Stay low and away from smoke entry points.',
        );
      }
    }

    // Smoke protection
    instructions.push('Seal gaps under doors with wet towels or cloth.');
    instructions.push('Stay low to avoid smoke inhalation.');

    // Window instructions
    if (roomCharacteristics.hasWindow) {
      instructions.push(
        'If safe, open window slightly for fresh air. Signal for help.',
      );
      instructions.push('Do NOT jump unless absolutely necessary.');
    }

    // External access
    if (roomCharacteristics.hasExternalAccess) {
      instructions.push(
        'External access point available - wait for rescue team instructions.',
      );
    }

    // Communication
    instructions.push(
      'Call emergency services if not already done. Keep phone charged.',
    );
    instructions.push('Stay calm. Rescue team is prioritizing your location.');

    return instructions.join('\n');
  }

  /**
   * Gets node coordinates in WGS84 (lat/long)
   */
  private async getNodeCoordinates(
    nodeId: number,
  ): Promise<{ longitude: number; latitude: number } | null> {
    const result = await this.dataSource.query(
      `SELECT
        ST_X(ST_Transform(geometry, 4326)) as longitude,
        ST_Y(ST_Transform(geometry, 4326)) as latitude
      FROM nodes
      WHERE id = $1`,
      [nodeId],
    );

    if (!result || result.length === 0) return null;

    return {
      longitude: parseFloat(result[0].longitude),
      latitude: parseFloat(result[0].latitude),
    };
  }

  /**
   * Logs an isolation-related event for audit trail
   */
  private async logIsolationEvent(
    eventType: string,
    nodeId: number,
    trappedOccupantId?: number,
    details?: Record<string, any>,
    rescueTeamId?: number,
  ): Promise<void> {
    await this.dataSource.query(
      `INSERT INTO isolation_events (event_type, node_id, trapped_occupant_id, rescue_team_id, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        eventType,
        nodeId,
        trappedOccupantId || null,
        rescueTeamId || null,
        details ? JSON.stringify(details) : null,
      ],
    );
  }
}
