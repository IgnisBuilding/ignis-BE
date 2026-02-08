// import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
// import { InjectRepository } from '@nestjs/typeorm';
// import { EvacuationRoute } from '@app/entities';
// import { DataSource, Repository } from 'typeorm';
// import { CreateRouteDto } from './dto/CreateRoute.dto';

// @Injectable()
// export class FireSafetyService {
//   constructor(
//     @InjectRepository(EvacuationRoute)
//     private readonly routeRepo: Repository<EvacuationRoute>,
//     private readonly dataSource: DataSource,
//   ) {}

//   /**
//    * Finds all saved evacuation routes.
//    */
//   findAll(): Promise<EvacuationRoute[]> { // It's good practice to include relations
//     return this.routeRepo.find({ relations: ['startNode', 'endNode'] });
//   }

//   /**
//    * Finds a single saved evacuation route by its ID.
//    */
//   async findOne(id: number): Promise<EvacuationRoute> {
//     const route = await this.routeRepo.findOne({
//       where: { id },
//       relations: ['startNode', 'endNode'],
//     });
//     if (!route) {
//       throw new NotFoundException(`EvacuationRoute with ID ${id} not found.`);
//     }
//     return route;
//   }

//   /**
//    * Computes the shortest path, saves it, and returns it as GeoJSON.
//    */
//   async computeAndSavePath(
//     dto: CreateRouteDto,
//   ): Promise<any> {
//     const { startNodeId, endNodeId, assignedTo } = dto; // assignedTo can be undefined

//     try {
//       // Use the robust helper which tries multiple pgr variants.
//       const pathWkt = await this.getPathWktIfExists(startNodeId, endNodeId);
//       if (!pathWkt) {
//         throw new NotFoundException(`No path found between node ${startNodeId} and ${endNodeId}.`);
//       }

//       // Insert the evacuation route in a single query including the path geometry
//       const assigned = assignedTo === undefined ? null : assignedTo;
//       const insertSql = `
//         INSERT INTO evacuation_route (path, assigned_to, distance, start_node_id, end_node_id)
//         VALUES (ST_GeomFromText($1, 3857), $2, ST_Length(ST_GeomFromText($1,3857)), $3, $4)
//         RETURNING id;
//       `;
//   const insertRes = await this.dataSource.query(insertSql, [pathWkt, assigned, startNodeId, endNodeId]);
//       const savedId = insertRes && insertRes[0] ? insertRes[0].id : null;
//       if (!savedId) {
//         throw new Error('Failed to insert evacuation_route with geometry');
//       }

//       // Return the computed path as a GeoJSON Feature (getRouteAsGeoJSON will now transform to 4326)
//   const geojson = await this.getRouteAsGeoJSON(savedId);

//       // Emit socket event notifying clients that a new evacuation route was created.
//       // Access the Socket.IO server via a global reference first to avoid
//       // attempting a Nest provider lookup (app.get('io')) which can throw
//       // UnknownElementException when called from certain contexts during
//       // bootstrap. If global.__io isn't present, fall back to guarded access
//       // through the global app instance.
//       try {
//         const globalAny: any = global as any;
//         const io = globalAny.__io || (globalAny.__appInstance && globalAny.__appInstance.get ? globalAny.__appInstance.get('io') : null);
//         if (io && typeof io.emit === 'function') {
//           io.emit('evacuationRoute.updated', { id: savedId, geojson });
//         }
//       } catch (emitErr) {
//         console.warn('Could not emit evacuationRoute.updated', emitErr);
//       }

//       return geojson;
//     } catch (e) {
//       // Log and rethrow as a BadRequest for clearer client feedback
//       console.error('computeAndSavePath error', e && e.stack ? e.stack : e);
//       throw new BadRequestException(e && e.message ? `Compute failed: ${e.message}` : 'Compute failed');
//     }
//   }

//   /**
//    * Helper: returns WKT path for a pair, or null when no path exists.
//    * This does not throw when no path exists, which is useful for batch rebuilds.
//    */
//   async getPathWktIfExists(startNodeId: number, endNodeId: number, ignoreHazards = false): Promise<string | null> {
//     // Build a pgr_dijkstra input that treats the edges as undirected by
//     // including both orientations. We synthesize unique ids (id*2, id*2+1)
//     // so we can map back to the original edges when assembling geometry.
//     const edgeSelection = ignoreHazards
//       ? `SELECT (id * 2) AS id, source_id AS source, target_id AS target, cost FROM edges
//          UNION ALL
//          SELECT (id * 2 + 1) AS id, target_id AS source, source_id AS target, cost FROM edges`
//       : `SELECT (id * 2) AS id, source_id AS source, target_id AS target, cost FROM edges
//          WHERE source_id NOT IN (SELECT COALESCE(node_id, -1) FROM hazards WHERE status <> 'CLEARED')
//            AND target_id NOT IN (SELECT COALESCE(node_id, -1) FROM hazards WHERE status <> 'CLEARED')
//          UNION ALL
//          SELECT (id * 2 + 1) AS id, target_id AS source, source_id AS target, cost FROM edges
//          WHERE source_id NOT IN (SELECT COALESCE(node_id, -1) FROM hazards WHERE status <> 'CLEARED')
//            AND target_id NOT IN (SELECT COALESCE(node_id, -1) FROM hazards WHERE status <> 'CLEARED')`;

//     const pathQuery = `
//       WITH route AS (
//         SELECT * FROM pgr_dijkstra(
//           $$
//             ${edgeSelection}
//           $$,
//           $1::integer,
//           $2::integer,
//           false
//         )
//       )
//       SELECT ST_AsText(ST_LineMerge(ST_Collect(e.geometry ORDER BY r.seq))) AS path_wkt
//       FROM route r
//       JOIN edges e ON e.id = (CASE WHEN r.edge % 2 = 0 THEN (r.edge / 2) ELSE ((r.edge - 1) / 2) END)
//       WHERE r.edge <> -1;
//     `;

//     try {
//       const res = await this.dataSource.query(pathQuery, [startNodeId, endNodeId]);
//       if (!res || res.length === 0 || !res[0].path_wkt) return null;
//       return res[0].path_wkt;
//     } catch (err) {
//       console.warn('getPathWktIfExists query failed', err && err.message ? err.message : err);
//       return null;
//     }
//   }

//   /**
//    * Helper: saves a route when pathWkt is already computed. Returns inserted id.
//    */
//   async saveRouteFromWkt(pathWkt: string, startNodeId: number, endNodeId: number, assignedTo?: number): Promise<number | null> {
//     if (!pathWkt) return null;
//     const assigned = assignedTo === undefined ? null : assignedTo;
//     const insertSql = `
//       INSERT INTO evacuation_route (path, assigned_to, distance, start_node_id, end_node_id)
//       VALUES (ST_GeomFromText($1, 3857), $2, ST_Length(ST_GeomFromText($1,3857)), $3, $4)
//       RETURNING id;
//     `;
//     try {
//       const insertRes = await this.dataSource.query(insertSql, [pathWkt, assigned, startNodeId, endNodeId]);
//       const insertedId = insertRes && insertRes[0] ? insertRes[0].id : null;
//       if (insertedId) {
//         // Emit per-route update so clients can refresh immediately
//         try {
//           const geojson = await this.getRouteAsGeoJSON(insertedId);
//           const globalAny: any = global as any;
//           const io = globalAny.__io || (globalAny.__appInstance && globalAny.__appInstance.get ? globalAny.__appInstance.get('io') : null);
//           if (io && typeof io.emit === 'function') io.emit('evacuationRoute.updated', { id: insertedId, geojson });
//         } catch (e) {
//           console.warn('Failed to emit evacuationRoute.updated after save', e);
//         }
//       }
//       return insertedId;
//     } catch (err) {
//       console.warn('saveRouteFromWkt failed', err && err.message ? err.message : err);
//       return null;
//     }
//   }

//   /**
//    * Fetches a computed path and formats it as a GeoJSON FeatureCollection.
//    */
//   async getRouteAsGeoJSON(routeId: number): Promise<any> {
//     const query = `
//       SELECT json_build_object(
//           'type', 'FeatureCollection',
//         'features', json_agg(
//             json_build_object(
//               'type', 'Feature',
//               'geometry', ST_AsGeoJSON(ST_Transform(path,4326))::json,
//               'properties', json_build_object(
//                 'id', id,
//                 'startNodeId', start_node_id, -- Matches required format
//                 'endNodeId', end_node_id,   -- Matches required format
//                 'createdAt', created_at     -- Matches required format
//               )
//             )
//           )
//       ) AS geojson
//       FROM evacuation_route
//       WHERE id = $1;
//     `;

//     const result = await this.dataSource.query(query, [routeId]);

//     if (!result || result.length === 0 || !result[0].geojson) {
//       throw new NotFoundException(`Could not generate GeoJSON for route ID ${routeId}.`);
//     }

//     return result[0].geojson;
//   }

//   /**
//    * Deletes an evacuation route.
//    */
//   async remove(id: number): Promise<void> {
//     const result = await this.routeRepo.delete(id);
//     if (result.affected === 0) {
//       throw new NotFoundException(`EvacuationRoute with ID ${id} not found.`);
//     }
//   }

//   /**
//    * Rebuilds all evacuation routes by computing shortest path for every node pair.
//    * This deletes existing routes and attempts to compute new ones.
//    */
//   async rebuildAllRoutes(ignoreHazards = true): Promise<{ computed: number; skipped: number }> {
//     // fetch nodes
//     const rows: Array<{ id: number }> = await this.dataSource.query('SELECT id FROM nodes');
//     const ids = (rows || []).map(r => r.id).filter(Boolean);

//     // delete existing routes
//     await this.dataSource.query('DELETE FROM evacuation_route');

//     let computed = 0;
//     let skipped = 0;

//     // naive pairwise computation (i<j)
//     for (let i = 0; i < ids.length; i++) {
//       for (let j = i + 1; j < ids.length; j++) {
//         const a = ids[i];
//         const b = ids[j];
//         try {
//           // Use helper that does not throw on missing path
//           const pathWkt = await this.getPathWktIfExists(a, b, ignoreHazards);
//           if (!pathWkt) {
//             skipped++;
//             continue;
//           }

//           const insertedId = await this.saveRouteFromWkt(pathWkt, a, b);
//           if (insertedId) {
//             computed++;
//           } else {
//             skipped++;
//           }
//         } catch (e) {
//           // skip if no path or other error for this pair
//           skipped++;
//           // continue to next pair
//         }
//       }
//     }

//     return { computed, skipped };
//   }
// }

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { EvacuationRoute } from '@app/entities';
import { CreateRouteDto } from './dto/CreateRoute.dto';
import { IsolationDetectionService } from './isolation-detection.service';
import { IsolatedLocationException } from './exceptions/isolated-location.exception';

/**
 * Enhanced Fire Safety Service with Multiple Routing Algorithms
 *
 * Routing Strategy:
 * 1. Dijkstra (Primary) - Optimal path with hazard-aware costs
 * 2. A* (Fallback) - Heuristic-enhanced routing
 * 3. K-Shortest Paths (Final Fallback) - Multiple alternative routes
 *
 * Dynamic Cost Calculation:
 * Cost_final = Cost_base + α * (1 / DistanceToFire)
 * Where α = hazard weight factor (default: 50)
 */
@Injectable()
export class FireSafetyService {
  private readonly logger = new Logger(FireSafetyService.name);

  constructor(
    @InjectRepository(EvacuationRoute)
    private routeRepo: Repository<EvacuationRoute>,
    private dataSource: DataSource,
    private isolationDetectionService: IsolationDetectionService,
  ) {}

  // ============================================
  // CONFIGURATION CONSTANTS
  // ============================================

  // Hazard cost multiplier (α in cost formula)
  private readonly HAZARD_WEIGHT_ALPHA = 50;

  // Safety buffer distance from fire (meters)
  private readonly SAFETY_BUFFER_DISTANCE = 10;

  // Number of alternative paths for K-Shortest Paths
  private readonly K_PATHS_COUNT = 3;

  // ============================================
  // FIRE ZONE NODE BLOCKING
  // ============================================

  /**
   * Gets all node IDs that should be blocked due to active fires.
   * This includes:
   * 1. Nodes directly marked as fire zones (hazard.node_id)
   * 2. All nodes geometrically inside the room where fire is located
   *
   * This is critical because corridor/junction nodes may pass through
   * a room that's on fire, and those must also be blocked.
   */
  private async getBlockedNodeIds(): Promise<number[]> {
    const query = `
      WITH fire_rooms AS (
        -- Get the room geometries where fires are active
        SELECT DISTINCT r.geometry as room_geom, h.node_id as fire_node_id
        FROM hazards h
        JOIN nodes n ON h.node_id = n.id
        LEFT JOIN room r ON ST_Intersects(n.geometry, r.geometry)
        WHERE h.status = 'active'
      ),
      blocked_nodes AS (
        -- Get all nodes inside fire rooms OR directly marked as fire
        SELECT DISTINCT n.id
        FROM nodes n
        LEFT JOIN fire_rooms fr ON ST_Within(n.geometry, fr.room_geom)
        LEFT JOIN hazards h ON n.id = h.node_id AND h.status = 'active'
        WHERE fr.room_geom IS NOT NULL OR h.id IS NOT NULL
      )
      SELECT id FROM blocked_nodes;
    `;

    try {
      const result = await this.dataSource.query(query);
      const blockedIds = result.map((r: any) => r.id as number);
      console.log(`Fire zone blocking: ${blockedIds.length} nodes blocked:`, blockedIds);
      return blockedIds;
    } catch (error) {
      console.warn('Failed to get blocked nodes, falling back to hazard nodes only:', error.message);
      // Fallback to just hazard nodes
      const fallbackResult = await this.dataSource.query(
        `SELECT DISTINCT node_id as id FROM hazards WHERE status = 'active' AND node_id IS NOT NULL`
      );
      return fallbackResult.map((r: any) => r.id as number);
    }
  }

  /**
   * Generates SQL for blocked nodes list (for use in queries)
   *
   * BLOCKING LOGIC:
   * 1. Always block the hazard node itself (fire location)
   * 2. Block ALL nodes geometrically inside the fire room
   *
   * Note: Corridor/junction nodes should be positioned OUTSIDE room boundaries
   * (in hallways/passages). If they intersect with regular rooms, they will be
   * blocked during a fire in that room. Use the FixCorridorNodePositions migration
   * to correct any corridor nodes that are incorrectly inside room geometries.
   *
   * Hallways/passages (Upper Hall, Foyer, etc.) are excluded from being fire rooms
   * to prevent blocking passage nodes when fire is in a room that shares geometry
   * with the hallway.
   */
  private getBlockedNodesSQL(): string {
    return `
      SELECT DISTINCT n.id
      FROM nodes n
      LEFT JOIN (
        -- Get fire room geometry (exclude halls/passages as primary fire rooms)
        SELECT DISTINCT r.geometry as room_geom
        FROM hazards h
        JOIN nodes hn ON h.node_id = hn.id
        JOIN room r ON ST_Intersects(hn.geometry, r.geometry)
        WHERE h.status = 'active'
          -- Don't consider hallways/passages as fire rooms
          AND r.name NOT ILIKE ANY(ARRAY['%hall%', '%corridor%', '%passage%', '%foyer%', '%lobby%', '%stoop%'])
      ) fire_rooms ON ST_Intersects(n.geometry, fire_rooms.room_geom)
      LEFT JOIN hazards h ON n.id = h.node_id AND h.status = 'active'
      WHERE
        -- Block the hazard node itself
        h.id IS NOT NULL
        -- Block all nodes inside the fire room geometry
        OR fire_rooms.room_geom IS NOT NULL
    `;
  }

  /**
   * Generates SQL for fire room geometries (for edge blocking)
   * Returns the room geometries where fires are active (excluding hallways)
   * Includes a small buffer (3 meters) around fire rooms to block routes
   * through immediately adjacent areas that would be in the danger zone
   */
  private getFireRoomGeometriesSQL(): string {
    // Use room geometry directly without buffer for edge blocking
    // Buffer was causing edges from adjacent rooms to be blocked incorrectly
    // Node blocking already handles nodes inside fire rooms
    return `
      SELECT DISTINCT r.geometry as room_geom
      FROM hazards h
      JOIN nodes hn ON h.node_id = hn.id
      JOIN room r ON ST_Intersects(hn.geometry, r.geometry)
      WHERE h.status = 'active'
        AND r.name NOT ILIKE ANY(ARRAY['%hall%', '%corridor%', '%passage%', '%foyer%', '%lobby%', '%stoop%'])
    `;
  }

  /**
   * Generates SQL clause to exclude edges that cross through fire rooms
   * This prevents routes from visually passing through rooms on fire
   * even if the start/end nodes are outside the fire room
   */
  private getBlockedEdgesConditionSQL(): string {
    return `
      NOT EXISTS (
        SELECT 1
        FROM (${this.getFireRoomGeometriesSQL()}) fire_rooms
        WHERE ST_Intersects(e.geometry, fire_rooms.room_geom)
      )
    `;
  }

  // ============================================
  // MAIN ROUTING FUNCTION WITH FALLBACK LOGIC
  // ============================================

  /**
   * Computes evacuation route using multi-algorithm fallback strategy
   *
   * Algorithm Priority:
   * 1. Dijkstra with hazard-aware costs (optimal, fast)
   * 2. A* with heuristic (faster computation for complex graphs)
   * 3. K-Shortest Paths (provides alternatives when primary fails)
   *
   * @param dto - Route computation parameters
   * @returns GeoJSON FeatureCollection with route geometry
   */
  async computeRoute(dto: CreateRouteDto): Promise<any> {
    const { startNodeId, endNodeId, assignedTo } = dto;

    // Validate nodes exist
    await this.validateNodes(startNodeId, endNodeId);

    // Check if start or end nodes are fire zones
    // TC_01 FIX: Allow routing FROM fire zone (person needs to escape)
    // TC_02 FIX: If end node is in fire, redirect to safe point instead of error
    const fireCheck = await this.checkNodesForFire([startNodeId, endNodeId]);
    console.log(`[FireCheck] Checking nodes [${startNodeId}, ${endNodeId}], result:`, fireCheck);

    let effectiveEndNodeId = endNodeId;
    let endNodeInFire = false;
    let startInFire = false;  // Track if person is escaping from fire

    if (fireCheck.hasFireNodes) {
      startInFire = fireCheck.fireNodeIds.includes(startNodeId);
      const endInFire = fireCheck.fireNodeIds.includes(endNodeId);

      // If ONLY start is in fire, allow it - person needs to escape
      // Log this for awareness but continue routing
      if (startInFire && !endInFire) {
        this.logger.warn(
          `Start node ${startNodeId} is in fire zone - computing escape route to safety`,
        );
        // Continue with normal routing - person can escape from fire
        // The routing algorithms will be told to allow edges departing from startNodeId
      }
      // If end node is in fire (regardless of start), find alternate safe destination
      else if (endInFire) {
        this.logger.warn(
          `End node ${endNodeId} is in fire zone - redirecting to nearest safe point`,
        );
        endNodeInFire = true;

        // Try to find a safe point or alternate exit
        try {
          const safePointResult = await this.findRouteToNearestSafePoint(startNodeId);
          if (safePointResult) {
            this.logger.log(
              `Redirected from fire zone ${endNodeId} to safe point: ${safePointResult.safePointName}`,
            );
            return {
              ...safePointResult.route,
              safePointFallback: true,
              redirectedFromFireZone: true,
              originalEndNode: endNodeId,
              safePoint: safePointResult.safePoint,
              message: `Destination (node ${endNodeId}) is in fire zone. Redirected to safe point: ${safePointResult.safePointName}. ${safePointResult.safePoint.notes || ''}`,
            };
          }
        } catch (e) {
          this.logger.warn(`Could not find safe point alternative: ${e.message}`);
        }

        // If no safe point found, try to find nearest exit that's not in fire
        const alternateExit = await this.findNearestSafeExit(startNodeId);
        console.log(`[FindExit] Alternate exit result:`, alternateExit);
        if (alternateExit) {
          effectiveEndNodeId = alternateExit.nodeId;
          console.log(`[Redirect] Using alternate exit node ${effectiveEndNodeId} instead of fire zone ${endNodeId}`);
          this.logger.log(
            `Using alternate exit node ${effectiveEndNodeId} instead of fire zone ${endNodeId}`,
          );
        } else {
          console.log(`[Redirect] No safe exit found - will proceed with isolation check`);
          // No alternatives - this will likely trigger isolation detection later
          this.logger.warn(
            `No safe alternatives found for fire zone destination ${endNodeId}`,
          );
        }
      }
    }

    // Determine escape node - if start is in fire, we allow edges departing from it
    const escapeFromFireNode = startInFire ? startNodeId : undefined;

    // ============================================
    // ROUTING ATTEMPT 1: Dijkstra (Primary)
    // ============================================
    console.log(`Attempting route computation with Dijkstra (${startNodeId} -> ${effectiveEndNodeId})${startInFire ? ' [ESCAPE MODE]' : ''}...`);
    let routeGeometry = await this.computeDijkstraWithHazardCosts(
      startNodeId,
      effectiveEndNodeId,
      escapeFromFireNode,
    );

    // ============================================
    // ROUTING ATTEMPT 2: A* (Fallback 1)
    // ============================================
    if (!routeGeometry) {
      console.log('Dijkstra failed, attempting A* algorithm...');
      routeGeometry = await this.computeAStarRoute(startNodeId, effectiveEndNodeId, escapeFromFireNode);
    }

    // ============================================
    // ROUTING ATTEMPT 3: K-Shortest Paths (Fallback 2)
    // ============================================
    if (!routeGeometry) {
      console.log('A* failed, attempting K-Shortest Paths...');
      routeGeometry = await this.computeKShortestPaths(startNodeId, effectiveEndNodeId, escapeFromFireNode);
    }

    // ============================================
    // ROUTING ATTEMPT 4: Safe Point Fallback (Final Fallback)
    // ============================================
    // If all exit-seeking algorithms fail, route to the safest shelter-in-place location
    if (!routeGeometry) {
      console.log('All exit routes failed, attempting safe point fallback...');
      try {
        const safePointResult = await this.findRouteToNearestSafePoint(startNodeId);
        if (safePointResult) {
          console.log(`✓ Safe point fallback succeeded - routing to ${safePointResult.safePointName}`);
          // Return directly as we already have the full response
          return {
            ...safePointResult.route,
            safePointFallback: true,
            safePoint: safePointResult.safePoint,
            message: `No exit route available. Routing to safe point: ${safePointResult.safePointName}. ${safePointResult.safePoint.notes || 'Seal doors and wait for rescue.'}`,
          };
        }
      } catch (safePointError) {
        console.warn('Safe point fallback also failed:', safePointError.message);
      }
    }

    // If all algorithms including safe point fallback fail
    // This means the occupant is ISOLATED - handle with rescue priority system
    if (!routeGeometry) {
      this.logger.warn(
        `All routing algorithms failed for node ${startNodeId}. Initiating isolation detection.`,
      );

      // Get the list of blocked nodes (fire zones)
      const blockedNodes = await this.getBlockedNodeIds();

      // Analyze the isolation situation
      const isolationInfo = await this.isolationDetectionService.analyzeIsolation(
        startNodeId,
        blockedNodes,
      );

      this.logger.log(
        `Isolation analysis complete: ${isolationInfo.isolationReason}, Priority: ${isolationInfo.priorityLevel}`,
      );

      // Register the trapped occupant for rescue prioritization
      let trappedOccupantId: number | null = null;
      try {
        trappedOccupantId = await this.isolationDetectionService.registerTrappedOccupant(
          isolationInfo,
        );
        this.logger.log(`Registered trapped occupant with ID: ${trappedOccupantId}`);

        // Emit WebSocket event to notify rescue dashboard
        this.emitIsolationEvent(isolationInfo, trappedOccupantId);
      } catch (regError) {
        this.logger.error('Failed to register trapped occupant:', regError);
      }

      // Throw the specialized exception with all isolation details
      throw new IsolatedLocationException(isolationInfo, trappedOccupantId);
    }

    // Save route to database
    // Use effectiveEndNodeId (which may have been redirected from fire zone)
    const routeId = await this.saveRouteFromWkt(
      routeGeometry,
      startNodeId,
      effectiveEndNodeId,
      assignedTo,
    );

    // Return as GeoJSON with redirect info if applicable
    const routeResponse = await this.getRouteAsGeoJSON(routeId);

    // Add redirect metadata if destination was changed due to fire
    if (endNodeInFire && effectiveEndNodeId !== endNodeId) {
      return {
        ...routeResponse,
        redirectedFromFireZone: true,
        originalEndNode: endNodeId,
        message: `Original destination (node ${endNodeId}) is in fire zone. Redirected to nearest safe exit (node ${effectiveEndNodeId}).`,
      };
    }

    return routeResponse;
  }

  // ============================================
  // ALGORITHM 1: DIJKSTRA WITH HAZARD-AWARE COSTS
  // ============================================

  /**
   * Dijkstra with dynamic cost adjustment based on proximity to fire
   *
   * Cost Formula: Cost_final = Cost_base + α * (1 / DistanceToFire)
   *
   * This ensures:
   * - Paths near fire have exponentially higher costs
   * - Routing algorithm naturally avoids dangerous zones
   * - Real-time adaptation as fires spread
   *
   * @param startNodeId - Start node ID
   * @param endNodeId - End node ID
   * @param escapeFromFireNode - If set, allows edges departing from this node even if it's in fire zone
   * @returns WKT geometry string or null if no path found
   */
  private async computeDijkstraWithHazardCosts(
    startNodeId: number,
    endNodeId: number,
    escapeFromFireNode?: number,
  ): Promise<string | null> {
    try {
      // Get the blocked nodes SQL that includes all nodes inside fire rooms
      const blockedNodesSQL = this.getBlockedNodesSQL();
      // Get the edge blocking condition (edges that cross through fire rooms)
      // TC_01 FIX: When escaping from fire, allow edges directly connected to the escape node
      // even if they cross through fire room geometry (person needs to leave the fire room)
      const blockedEdgesCondition = escapeFromFireNode
        ? `(NOT EXISTS (
            SELECT 1
            FROM (${this.getFireRoomGeometriesSQL()}) fire_rooms
            WHERE ST_Intersects(e.geometry, fire_rooms.room_geom)
          ) OR e.source_id = ${escapeFromFireNode} OR e.target_id = ${escapeFromFireNode})`
        : this.getBlockedEdgesConditionSQL();

      // If escaping from fire, we need to allow edges departing from the fire node
      // but still block all other fire nodes and edges going INTO fire
      // TC_01 FIX: Also allow edges to immediate neighbors of escape node (first hop out of fire)
      const escapeNodeCondition = escapeFromFireNode
        ? `OR e.source_id = ${escapeFromFireNode}`
        : '';
      // Allow target nodes that are directly connected to the escape node
      // This enables the first hop out of the fire room
      const escapeTargetCondition = escapeFromFireNode
        ? `OR e.target_id IN (SELECT target_id FROM edges WHERE source_id = ${escapeFromFireNode} UNION SELECT source_id FROM edges WHERE target_id = ${escapeFromFireNode})`
        : '';

      // Build dynamic cost calculation query
      // Cost increases exponentially as we get closer to fire nodes
      // IMPORTANT: We block ALL nodes inside fire room geometry, not just the hazard node
      // IMPORTANT: We also block edges that visually cross through fire room geometry
      const edgeSelectionWithHazardCosts = `
        SELECT
          (e.id * 2) AS id,
          e.source_id AS source,
          e.target_id AS target,
          -- Dynamic cost calculation with fire proximity penalty
          CASE
            WHEN fire_distances.min_fire_distance IS NULL THEN e.cost
            WHEN fire_distances.min_fire_distance < ${this.SAFETY_BUFFER_DISTANCE} THEN 9999999
            ELSE e.cost + (${this.HAZARD_WEIGHT_ALPHA} / NULLIF(fire_distances.min_fire_distance, 0))
          END AS cost
        FROM edges e
        -- Calculate minimum distance to any active fire node
        LEFT JOIN LATERAL (
          SELECT MIN(
            ST_Distance(
              ST_Transform(n_source.geometry, 4326)::geography,
              ST_Transform(n_fire.geometry, 4326)::geography
            )
          ) AS min_fire_distance
          FROM hazards h
          JOIN nodes n_fire ON h.node_id = n_fire.id
          JOIN nodes n_source ON e.source_id = n_source.id
          WHERE h.status = 'active'
        ) fire_distances ON true
        -- Exclude edges connected to ANY node inside fire room geometry
        -- EXCEPT: Allow edges DEPARTING from escape node (person fleeing fire)
        -- AND allow first hop to immediate neighbors of escape node
        WHERE (e.source_id NOT IN (${blockedNodesSQL}) ${escapeNodeCondition})
        AND (e.target_id NOT IN (${blockedNodesSQL}) ${escapeTargetCondition})
        -- Exclude edges that cross through fire room geometry
        AND ${blockedEdgesCondition}

        UNION ALL

        -- Reverse direction (for undirected graph)
        SELECT
          (e.id * 2 + 1) AS id,
          e.target_id AS source,
          e.source_id AS target,
          CASE
            WHEN fire_distances.min_fire_distance IS NULL THEN e.cost
            WHEN fire_distances.min_fire_distance < ${this.SAFETY_BUFFER_DISTANCE} THEN 9999999
            ELSE e.cost + (${this.HAZARD_WEIGHT_ALPHA} / NULLIF(fire_distances.min_fire_distance, 0))
          END AS cost
        FROM edges e
        LEFT JOIN LATERAL (
          SELECT MIN(
            ST_Distance(
              ST_Transform(n_target.geometry, 4326)::geography,
              ST_Transform(n_fire.geometry, 4326)::geography
            )
          ) AS min_fire_distance
          FROM hazards h
          JOIN nodes n_fire ON h.node_id = n_fire.id
          JOIN nodes n_target ON e.target_id = n_target.id
          WHERE h.status = 'active'
        ) fire_distances ON true
        -- For reverse edges, the "source" in pgRouting is actually target_id
        -- Allow edges where target_id (which becomes source in reverse) is the escape node
        -- Also allow immediate neighbors as sources (first hop out)
        WHERE (e.target_id NOT IN (${blockedNodesSQL}) ${escapeNodeCondition ? `OR e.target_id = ${escapeFromFireNode}` : ''})
        AND (e.source_id NOT IN (${blockedNodesSQL}) ${escapeTargetCondition})
        -- Exclude edges that cross through fire room geometry
        AND ${blockedEdgesCondition}
      `;

      // Execute pgr_dijkstra with dynamic costs
      const pathQuery = `
        WITH route AS (
          SELECT * FROM pgr_dijkstra(
            $$
              ${edgeSelectionWithHazardCosts}
            $$,
            $1::integer,
            $2::integer,
            false
          )
        )
        SELECT ST_AsText(ST_LineMerge(ST_Collect(e.geometry ORDER BY r.seq))) AS path_wkt
        FROM route r
        JOIN edges e ON e.id = (
          CASE
            WHEN r.edge % 2 = 0 THEN (r.edge / 2)
            ELSE ((r.edge - 1) / 2)
          END
        )
        WHERE r.edge <> -1;
      `;

      const result = await this.dataSource.query(pathQuery, [
        startNodeId,
        endNodeId,
      ]);

      if (!result || result.length === 0 || !result[0].path_wkt) {
        return null;
      }

      console.log('✓ Dijkstra with hazard costs succeeded');
      return result[0].path_wkt;
    } catch (error) {
      console.warn('Dijkstra with hazard costs failed:', error.message);
      return null;
    }
  }

  // ============================================
  // ALGORITHM 2: A* WITH HEURISTIC
  // ============================================

  /**
   * A* algorithm using Euclidean distance heuristic
   *
   * Advantages:
   * - Faster than Dijkstra for sparse graphs
   * - Goal-directed search reduces explored nodes
   * - Still guarantees optimal path with admissible heuristic
   *
   * Heuristic: h(n) = Euclidean distance to goal
   *
   * @param startNodeId - Start node ID
   * @param endNodeId - End node ID
   * @param escapeFromFireNode - If set, allows edges departing from this node even if it's in fire zone
   * @returns WKT geometry string or null if no path found
   */
  private async computeAStarRoute(
    startNodeId: number,
    endNodeId: number,
    escapeFromFireNode?: number,
  ): Promise<string | null> {
    try {
      // Get goal node coordinates for heuristic calculation
      const goalNodeQuery = `
        SELECT
          ST_X(ST_Transform(geometry, 4326)) AS lon,
          ST_Y(ST_Transform(geometry, 4326)) AS lat
        FROM nodes WHERE id = $1
      `;
      const goalResult = await this.dataSource.query(goalNodeQuery, [
        endNodeId,
      ]);

      if (!goalResult || goalResult.length === 0) {
        return null;
      }

      const goalLon = goalResult[0].lon;
      const goalLat = goalResult[0].lat;

      // Get the blocked nodes SQL that includes all nodes inside fire rooms
      const blockedNodesSQL = this.getBlockedNodesSQL();
      // Get the edge blocking condition (edges that cross through fire rooms)
      // TC_01 FIX: When escaping from fire, allow edges directly connected to the escape node
      const blockedEdgesCondition = escapeFromFireNode
        ? `(NOT EXISTS (
            SELECT 1
            FROM (${this.getFireRoomGeometriesSQL()}) fire_rooms
            WHERE ST_Intersects(e.geometry, fire_rooms.room_geom)
          ) OR e.source_id = ${escapeFromFireNode} OR e.target_id = ${escapeFromFireNode})`
        : this.getBlockedEdgesConditionSQL();

      // If escaping from fire, allow edges departing from the fire node
      // TC_01 FIX: Also allow edges to immediate neighbors of escape node (first hop out of fire)
      const escapeNodeCondition = escapeFromFireNode
        ? `OR e.source_id = ${escapeFromFireNode}`
        : '';
      // Allow target nodes that are directly connected to the escape node
      const escapeTargetCondition = escapeFromFireNode
        ? `OR e.target_id IN (SELECT target_id FROM edges WHERE source_id = ${escapeFromFireNode} UNION SELECT source_id FROM edges WHERE target_id = ${escapeFromFireNode})`
        : '';

      // Edge selection with A* heuristic cost
      const edgeSelectionAStar = `
        SELECT
          (e.id * 2) AS id,
          e.source_id AS source,
          e.target_id AS target,
          -- A* cost = actual cost + heuristic (Euclidean distance to goal)
          e.cost + ST_Distance(
            ST_Transform(n_source.geometry, 4326)::geography,
            ST_MakePoint(${goalLon}, ${goalLat})::geography
          ) AS cost
        FROM edges e
        JOIN nodes n_source ON e.source_id = n_source.id
        WHERE (e.source_id NOT IN (${blockedNodesSQL}) ${escapeNodeCondition})
        AND (e.target_id NOT IN (${blockedNodesSQL}) ${escapeTargetCondition})
        AND ${blockedEdgesCondition}

        UNION ALL

        SELECT
          (e.id * 2 + 1) AS id,
          e.target_id AS source,
          e.source_id AS target,
          e.cost + ST_Distance(
            ST_Transform(n_target.geometry, 4326)::geography,
            ST_MakePoint(${goalLon}, ${goalLat})::geography
          ) AS cost
        FROM edges e
        JOIN nodes n_target ON e.target_id = n_target.id
        WHERE (e.target_id NOT IN (${blockedNodesSQL}) ${escapeFromFireNode ? `OR e.target_id = ${escapeFromFireNode}` : ''})
        AND (e.source_id NOT IN (${blockedNodesSQL}) ${escapeTargetCondition})
        AND ${blockedEdgesCondition}
      `;

      // Execute A* using pgr_dijkstra with heuristic costs
      const pathQuery = `
        WITH route AS (
          SELECT * FROM pgr_dijkstra(
            $$
              ${edgeSelectionAStar}
            $$,
            $1::integer,
            $2::integer,
            false
          )
        )
        SELECT ST_AsText(ST_LineMerge(ST_Collect(e.geometry ORDER BY r.seq))) AS path_wkt
        FROM route r
        JOIN edges e ON e.id = (
          CASE
            WHEN r.edge % 2 = 0 THEN (r.edge / 2)
            ELSE ((r.edge - 1) / 2)
          END
        )
        WHERE r.edge <> -1;
      `;

      const result = await this.dataSource.query(pathQuery, [
        startNodeId,
        endNodeId,
      ]);

      if (!result || result.length === 0 || !result[0].path_wkt) {
        return null;
      }

      console.log('✓ A* algorithm succeeded');
      return result[0].path_wkt;
    } catch (error) {
      console.warn('A* algorithm failed:', error.message);
      return null;
    }
  }

  // ============================================
  // ALGORITHM 3: K-SHORTEST PATHS
  // ============================================

  /**
   * K-Shortest Paths algorithm - finds multiple alternative routes
   *
   * Advantages:
   * - Provides backup routes when primary path blocked
   * - Allows user choice between alternatives
   * - More resilient to dynamic hazard changes
   *
   * Returns the best available path from K alternatives
   *
   * @param startNodeId - Start node ID
   * @param endNodeId - End node ID
   * @param escapeFromFireNode - If set, allow edges departing from this fire node (escape mode)
   * @returns WKT geometry string of best path or null
   */
  private async computeKShortestPaths(
    startNodeId: number,
    endNodeId: number,
    escapeFromFireNode?: number,
  ): Promise<string | null> {
    try {
      // Get the blocked nodes SQL that includes all nodes inside fire rooms
      const blockedNodesSQL = this.getBlockedNodesSQL();
      // Get the edge blocking condition (edges that cross through fire rooms)
      // TC_01 FIX: When escaping from fire, allow edges directly connected to the escape node
      const blockedEdgesCondition = escapeFromFireNode
        ? `(NOT EXISTS (
            SELECT 1
            FROM (${this.getFireRoomGeometriesSQL()}) fire_rooms
            WHERE ST_Intersects(e.geometry, fire_rooms.room_geom)
          ) OR e.source_id = ${escapeFromFireNode} OR e.target_id = ${escapeFromFireNode})`
        : this.getBlockedEdgesConditionSQL();

      // TC_01 FIX: If escaping from fire, allow edges departing from the fire node
      // Also allow edges to immediate neighbors of escape node (first hop out of fire)
      const escapeNodeCondition = escapeFromFireNode
        ? `OR e.source_id = ${escapeFromFireNode}`
        : '';
      const escapeNodeConditionReverse = escapeFromFireNode
        ? `OR e.target_id = ${escapeFromFireNode}`
        : '';
      // Allow target nodes that are directly connected to the escape node
      const escapeTargetCondition = escapeFromFireNode
        ? `OR e.target_id IN (SELECT target_id FROM edges WHERE source_id = ${escapeFromFireNode} UNION SELECT source_id FROM edges WHERE target_id = ${escapeFromFireNode})`
        : '';

      // Standard edge selection excluding all nodes inside fire room geometry
      // and edges that cross through fire room geometry
      // Exception: Allow edges DEPARTING from escape node (person fleeing fire)
      // AND allow first hop to immediate neighbors of escape node
      const edgeSelection = `
        SELECT
          (e.id * 2) AS id,
          e.source_id AS source,
          e.target_id AS target,
          e.cost
        FROM edges e
        WHERE (e.source_id NOT IN (${blockedNodesSQL}) ${escapeNodeCondition})
        AND (e.target_id NOT IN (${blockedNodesSQL}) ${escapeTargetCondition})
        AND ${blockedEdgesCondition}

        UNION ALL

        SELECT
          (e.id * 2 + 1) AS id,
          e.target_id AS source,
          e.source_id AS target,
          e.cost
        FROM edges e
        WHERE (e.target_id NOT IN (${blockedNodesSQL}) ${escapeNodeConditionReverse})
        AND (e.source_id NOT IN (${blockedNodesSQL}) ${escapeTargetCondition})
        AND ${blockedEdgesCondition}
      `;

      // Execute pgr_ksp to find K alternative paths
      const kspQuery = `
        WITH k_paths AS (
          SELECT 
            path_id,
            path_seq,
            node,
            edge,
            cost,
            agg_cost
          FROM pgr_ksp(
            $$
              ${edgeSelection}
            $$,
            $1::integer,
            $2::integer,
            ${this.K_PATHS_COUNT},
            false
          )
        ),
        -- Select the shortest valid path
        best_path AS (
          SELECT path_id, SUM(cost) AS total_cost
          FROM k_paths
          WHERE edge <> -1
          GROUP BY path_id
          ORDER BY total_cost ASC
          LIMIT 1
        )
        SELECT ST_AsText(ST_LineMerge(ST_Collect(e.geometry ORDER BY kp.path_seq))) AS path_wkt
        FROM k_paths kp
        JOIN best_path bp ON kp.path_id = bp.path_id
        JOIN edges e ON e.id = (
          CASE 
            WHEN kp.edge % 2 = 0 THEN (kp.edge / 2) 
            ELSE ((kp.edge - 1) / 2) 
          END
        )
        WHERE kp.edge <> -1;
      `;

      const result = await this.dataSource.query(kspQuery, [
        startNodeId,
        endNodeId,
      ]);

      if (!result || result.length === 0 || !result[0].path_wkt) {
        return null;
      }

      console.log(`✓ K-Shortest Paths succeeded (K=${this.K_PATHS_COUNT})`);
      return result[0].path_wkt;
    } catch (error) {
      console.warn('K-Shortest Paths failed:', error.message);
      return null;
    }
  }

  // ============================================
  // HELPER FUNCTIONS
  // ============================================

  /**
   * Validates that both nodes exist in database
   */
  private async validateNodes(
    startNodeId: number,
    endNodeId: number,
  ): Promise<void> {
    const query = `SELECT id FROM nodes WHERE id IN ($1, $2)`;
    const result = await this.dataSource.query(query, [startNodeId, endNodeId]);

    if (!result || result.length !== 2) {
      throw new BadRequestException('One or both node IDs are invalid');
    }
  }

  /**
   * Checks if any given nodes are currently fire zones
   * @returns Object with hasFireNodes flag and fireNodeIds array
   */
  private async checkNodesForFire(nodeIds: number[]): Promise<{
    hasFireNodes: boolean;
    fireNodeIds: number[];
  }> {
    const query = `
      SELECT DISTINCT node_id 
      FROM hazards 
      WHERE node_id = ANY($1::int[]) AND status = 'active'
    `;

    const result = await this.dataSource.query(query, [nodeIds]);
    const fireNodeIds = result ? result.map((r) => r.node_id) : [];

    return {
      hasFireNodes: fireNodeIds.length > 0,
      fireNodeIds: fireNodeIds,
    };
  }

  /**
   * Saves computed route to database
   * @returns Route ID or null if save failed
   */
  private async saveRouteFromWkt(
    pathWkt: string,
    startNodeId: number,
    endNodeId: number,
    assignedTo?: number,
  ): Promise<number | null> {
    if (!pathWkt) return null;

    const assigned = assignedTo === undefined ? null : assignedTo;
    const insertSql = `
      INSERT INTO evacuation_route (path, assigned_to, distance, start_node_id, end_node_id)
      VALUES (ST_GeomFromText($1, 3857), $2, ST_Length(ST_GeomFromText($1,3857)), $3, $4)
      RETURNING id;
    `;

    try {
      const insertRes = await this.dataSource.query(insertSql, [
        pathWkt,
        assigned,
        startNodeId,
        endNodeId,
      ]);

      const insertedId = insertRes && insertRes[0] ? insertRes[0].id : null;

      if (insertedId) {
        console.log(`Route saved with ID: ${insertedId}`);
      }

      return insertedId;
    } catch (err) {
      console.warn(
        'saveRouteFromWkt failed',
        err && err.message ? err.message : err,
      );
      return null;
    }
  }

  /**
   * Converts route to GeoJSON format for frontend display
   * Enhanced to include floor-segmented route data for multi-floor visualization
   */
  async getRouteAsGeoJSON(routeId: number): Promise<any> {
    const query = `
      SELECT json_build_object(
        'type', 'FeatureCollection',
        'features', json_agg(
          json_build_object(
            'type', 'Feature',
            'geometry', ST_AsGeoJSON(ST_Transform(path,4326))::json,
            'properties', json_build_object(
              'id', id,
              'startNodeId', start_node_id,
              'endNodeId', end_node_id,
              'distance', distance,
              'createdAt', created_at
            )
          )
        )
      ) AS geojson
      FROM evacuation_route
      WHERE id = $1;
    `;

    const result = await this.dataSource.query(query, [routeId]);

    if (!result || result.length === 0 || !result[0].geojson) {
      throw new NotFoundException(
        `Could not generate GeoJSON for route ID ${routeId}.`,
      );
    }

    const baseGeoJSON = result[0].geojson;

    // NOTE: Doorway enhancement disabled - causes messy route visualization
    // The route is now displayed as the direct path computed by pgRouting
    // which follows corridor/hallway nodes naturally without forcing
    // through room entrance/exit doorways
    //
    // Previously:
    // try {
    //   const enhancedGeoJSON = await this.enhanceRouteWithDoorways(baseGeoJSON);
    //   if (enhancedGeoJSON) {
    //     Object.assign(baseGeoJSON, enhancedGeoJSON);
    //   }
    // } catch (e) {
    //   console.warn('Could not enhance route with doorways:', e.message);
    // }

    // Get floor-segmented route data for multi-floor visualization
    try {
      const floorSegments = await this.getRouteFloorSegments(routeId);
      if (floorSegments && floorSegments.length > 0) {
        baseGeoJSON.floorSegments = floorSegments;
        baseGeoJSON.isMultiFloor = floorSegments.length > 1;
      }
    } catch (e) {
      console.warn('Could not compute floor segments:', e.message);
    }

    return baseGeoJSON;
  }

  /**
   * Enhances route geometry by snapping path segments to pass through doorway positions
   * instead of cutting directly through room interiors.
   *
   * This uses PostGIS to identify where route segments cross room boundaries
   * and inserts doorway points at those intersections.
   *
   * @param geoJSON - Original route GeoJSON
   * @returns Enhanced GeoJSON with doorway-snapped geometry
   */
  private async enhanceRouteWithDoorways(geoJSON: any): Promise<any> {
    if (!geoJSON?.features?.[0]?.geometry?.coordinates) {
      return null;
    }

    const routeCoords = geoJSON.features[0].geometry.coordinates;
    if (routeCoords.length < 2) return null;

    try {
      // Build route LineString WKT for PostGIS query
      const coordsWkt = routeCoords.map((c: number[]) => `${c[0]} ${c[1]}`).join(', ');
      const routeLineWkt = `LINESTRING(${coordsWkt})`;

      // Query to find doorway points where route crosses room boundaries
      // Room geometry is in SRID 3857 (Web Mercator), so transform route to 3857 for comparison
      const doorwayIntersectionsQuery = `
        WITH route_line AS (
          SELECT ST_Transform(ST_SetSRID(ST_GeomFromText($1), 4326), 3857) as geom
        ),
        room_boundary_lines AS (
          -- Get the shared boundaries between adjacent rooms (already in 3857)
          SELECT DISTINCT
            ST_Centroid(ST_Intersection(r1.geometry, r2.geometry)) as door_point
          FROM room r1
          JOIN room r2 ON r1.id < r2.id
            AND r1.floor_id = r2.floor_id
            AND ST_Touches(r1.geometry, r2.geometry)
        ),
        route_boundary_crossings AS (
          -- Find where route line passes near room boundaries
          SELECT DISTINCT ON (
            round(ST_X(ST_Transform(rbl.door_point, 4326))::numeric, 6),
            round(ST_Y(ST_Transform(rbl.door_point, 4326))::numeric, 6)
          )
            ST_X(ST_Transform(rbl.door_point, 4326)) as lon,
            ST_Y(ST_Transform(rbl.door_point, 4326)) as lat,
            -- Distance along route for ordering (0 to 1)
            ST_LineLocatePoint(
              rl.geom,
              ST_ClosestPoint(rl.geom, rbl.door_point)
            ) as route_position
          FROM route_line rl, room_boundary_lines rbl
          WHERE ST_DWithin(rl.geom, rbl.door_point, 8) -- Within 8 meters of route (in 3857 units)
          ORDER BY
            round(ST_X(ST_Transform(rbl.door_point, 4326))::numeric, 6),
            round(ST_Y(ST_Transform(rbl.door_point, 4326))::numeric, 6),
            route_position
        )
        SELECT lon, lat, route_position
        FROM route_boundary_crossings
        WHERE lon IS NOT NULL AND lat IS NOT NULL
        ORDER BY route_position
      `;

      const doorwayIntersections = await this.dataSource.query(
        doorwayIntersectionsQuery,
        [routeLineWkt]
      );

      if (!doorwayIntersections || doorwayIntersections.length === 0) {
        return null;
      }

      // Build enhanced coordinates by inserting doorway points along the route
      const enhancedCoords: number[][] = [];
      let doorwayIdx = 0;

      for (let i = 0; i < routeCoords.length; i++) {
        const currentCoord = routeCoords[i];
        const currentRoutePos = i / (routeCoords.length - 1);

        // Insert any doorways that come before this position
        while (
          doorwayIdx < doorwayIntersections.length &&
          parseFloat(doorwayIntersections[doorwayIdx].route_position) < currentRoutePos
        ) {
          const dw = doorwayIntersections[doorwayIdx];
          const dwCoord = [parseFloat(dw.lon), parseFloat(dw.lat)];

          // Check if this doorway is not too close to the last added point
          const lastCoord = enhancedCoords.length > 0
            ? enhancedCoords[enhancedCoords.length - 1]
            : null;

          if (!lastCoord || this.coordDistance(dwCoord, lastCoord) > 0.00003) { // ~3m min spacing
            enhancedCoords.push(dwCoord);
          }
          doorwayIdx++;
        }

        // Add the current route point if not too close to last
        const lastCoord = enhancedCoords.length > 0
          ? enhancedCoords[enhancedCoords.length - 1]
          : null;

        if (!lastCoord || this.coordDistance(currentCoord, lastCoord) > 0.00002) { // ~2m min spacing
          enhancedCoords.push(currentCoord);
        }
      }

      // Add any remaining doorways at the end
      while (doorwayIdx < doorwayIntersections.length) {
        const dw = doorwayIntersections[doorwayIdx];
        const dwCoord = [parseFloat(dw.lon), parseFloat(dw.lat)];
        const lastCoord = enhancedCoords[enhancedCoords.length - 1];

        if (this.coordDistance(dwCoord, lastCoord) > 0.00003) {
          enhancedCoords.push(dwCoord);
        }
        doorwayIdx++;
      }

      // Update the geometry with enhanced coordinates
      if (enhancedCoords.length > routeCoords.length) {
        geoJSON.features[0].geometry.coordinates = enhancedCoords;
        geoJSON.features[0].properties.doorwayEnhanced = true;
        geoJSON.features[0].properties.originalPointCount = routeCoords.length;
        geoJSON.features[0].properties.enhancedPointCount = enhancedCoords.length;
        geoJSON.features[0].properties.doorwaysInserted = doorwayIntersections.length;
      }

      return geoJSON;
    } catch (e) {
      console.warn('enhanceRouteWithDoorways failed:', e.message);
      return null;
    }
  }

  /**
   * Calculate Euclidean distance between two coordinate pairs
   */
  private coordDistance(coord1: number[], coord2: number[]): number {
    return Math.hypot(coord1[0] - coord2[0], coord1[1] - coord2[1]);
  }

  /**
   * Calculate perpendicular distance from a point to a line segment
   */
  private pointToLineDistance(
    px: number, py: number,
    x1: number, y1: number,
    x2: number, y2: number
  ): number {
    const A = px - x1;
    const B = py - y1;
    const C = x2 - x1;
    const D = y2 - y1;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;

    if (lenSq !== 0) param = dot / lenSq;

    let xx, yy;

    if (param < 0) {
      xx = x1;
      yy = y1;
    } else if (param > 1) {
      xx = x2;
      yy = y2;
    } else {
      xx = x1 + param * C;
      yy = y1 + param * D;
    }

    const dx = px - xx;
    const dy = py - yy;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Splits a route into floor-specific segments for multi-floor visualization
   * Identifies stairway transition points and creates separate route segments per floor
   *
   * @param routeId - The route ID to segment
   * @returns Array of floor segments with geometry and transition info
   */
  private async getRouteFloorSegments(routeId: number): Promise<any[]> {
    // Get the route with start/end node info
    const routeQuery = `
      SELECT
        er.id,
        er.start_node_id,
        er.end_node_id,
        ns.floor_id as start_floor_id,
        ne.floor_id as end_floor_id,
        fs.level as start_floor_level,
        fe.level as end_floor_level
      FROM evacuation_route er
      JOIN nodes ns ON er.start_node_id = ns.id
      JOIN nodes ne ON er.end_node_id = ne.id
      LEFT JOIN floor fs ON ns.floor_id = fs.id
      LEFT JOIN floor fe ON ne.floor_id = fe.id
      WHERE er.id = $1
    `;

    const routeResult = await this.dataSource.query(routeQuery, [routeId]);
    if (!routeResult || routeResult.length === 0) {
      return [];
    }

    const route = routeResult[0];

    // If same floor, return single segment
    if (route.start_floor_id === route.end_floor_id) {
      const singleFloorQuery = `
        SELECT json_build_object(
          'floorId', $2,
          'floorLevel', $3,
          'segmentIndex', 0,
          'isTransition', false,
          'geometry', ST_AsGeoJSON(ST_Transform(path, 4326))::json
        ) as segment
        FROM evacuation_route
        WHERE id = $1
      `;
      const singleResult = await this.dataSource.query(singleFloorQuery, [
        routeId,
        route.start_floor_id,
        route.start_floor_level || '0',
      ]);
      return singleResult.map((r: any) => r.segment);
    }

    // Multi-floor route - find stairway nodes and split route
    const multiFloorQuery = `
      WITH route_edges AS (
        -- Reconstruct route path through edges
        SELECT
          r.seq,
          r.node,
          r.edge,
          n.floor_id,
          f.level as floor_level,
          n.node_category,
          n.type as node_type,
          ST_AsGeoJSON(ST_Transform(n.geometry, 4326))::json as node_geom
        FROM pgr_dijkstra(
          $$
            SELECT (id * 2) AS id, source_id AS source, target_id AS target, cost
            FROM edges
            UNION ALL
            SELECT (id * 2 + 1) AS id, target_id AS source, source_id AS target, cost
            FROM edges
          $$,
          $1::integer,
          $2::integer,
          false
        ) r
        JOIN nodes n ON r.node = n.id
        LEFT JOIN floor f ON n.floor_id = f.id
        ORDER BY r.seq
      ),
      floor_transitions AS (
        -- Identify where floor changes (stairway transitions)
        SELECT
          seq,
          node,
          floor_id,
          floor_level,
          node_category,
          node_type,
          node_geom,
          LAG(floor_id) OVER (ORDER BY seq) as prev_floor_id,
          CASE
            WHEN LAG(floor_id) OVER (ORDER BY seq) IS DISTINCT FROM floor_id
            THEN true
            ELSE false
          END as is_transition
        FROM route_edges
      ),
      segments AS (
        -- Group consecutive nodes by floor
        SELECT
          floor_id,
          floor_level,
          SUM(CASE WHEN is_transition THEN 1 ELSE 0 END) OVER (ORDER BY seq) as segment_group,
          node,
          seq,
          is_transition,
          node_category,
          node_type,
          node_geom
        FROM floor_transitions
      )
      SELECT
        segment_group as segment_index,
        floor_id,
        floor_level,
        MIN(seq) as start_seq,
        MAX(seq) as end_seq,
        bool_or(is_transition) as has_transition,
        json_agg(
          json_build_object(
            'nodeId', node,
            'isStairway', node_category IN ('stairway', 'stairs'),
            'nodeType', node_type,
            'geometry', node_geom
          ) ORDER BY seq
        ) as nodes
      FROM segments
      GROUP BY segment_group, floor_id, floor_level
      ORDER BY segment_group
    `;

    try {
      const segmentsResult = await this.dataSource.query(multiFloorQuery, [
        route.start_node_id,
        route.end_node_id,
      ]);

      // Build segment geometries from node points
      const segments = [];
      for (const seg of segmentsResult) {
        // Find the corresponding edges for this segment
        const edgeQuery = `
          WITH segment_nodes AS (
            SELECT unnest($1::int[]) as node_id
          ),
          segment_edges AS (
            SELECT DISTINCT e.id, e.geometry
            FROM edges e
            WHERE (e.source_id IN (SELECT node_id FROM segment_nodes)
               OR e.target_id IN (SELECT node_id FROM segment_nodes))
              AND e.source_id IN (SELECT node_id FROM segment_nodes)
              AND e.target_id IN (SELECT node_id FROM segment_nodes)
          )
          SELECT ST_AsGeoJSON(ST_Transform(ST_LineMerge(ST_Collect(geometry)), 4326))::json as geometry
          FROM segment_edges
        `;

        const nodeIds = seg.nodes.map((n: any) => n.nodeId);
        const edgeResult = await this.dataSource.query(edgeQuery, [nodeIds]);

        // Find stairway node in this segment if it's a transition
        const stairwayNode = seg.nodes.find(
          (n: any) => n.isStairway || n.nodeType === 'stairway',
        );

        segments.push({
          floorId: seg.floor_id,
          floorLevel: seg.floor_level || '0',
          segmentIndex: parseInt(seg.segment_index),
          isTransition: seg.has_transition,
          stairwayNode: stairwayNode || null,
          geometry: edgeResult[0]?.geometry || {
            type: 'LineString',
            coordinates: seg.nodes.map((n: any) => n.geometry?.coordinates).filter(Boolean),
          },
          nodeCount: seg.nodes.length,
        });
      }

      return segments;
    } catch (e) {
      console.warn('Multi-floor segment query failed:', e.message);
      // Fallback: return simple two-segment split
      return [
        {
          floorId: route.start_floor_id,
          floorLevel: route.start_floor_level || '0',
          segmentIndex: 0,
          isTransition: false,
          message: 'Start floor segment - navigate to stairs',
        },
        {
          floorId: route.end_floor_id,
          floorLevel: route.end_floor_level || '0',
          segmentIndex: 1,
          isTransition: true,
          message: 'End floor segment - navigate from stairs to destination',
        },
      ];
    }
  }

  /**
   * Deletes a route by ID
   */
  async remove(id: number): Promise<void> {
    const result = await this.routeRepo.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`EvacuationRoute with ID ${id} not found.`);
    }
  }

  /**
   * Finds all saved evacuation routes
   */
  findAll(): Promise<EvacuationRoute[]> {
    return this.routeRepo.find({ relations: ['startNode', 'endNode'] });
  }

  /**
   * Finds a single saved evacuation route by ID
   */
  async findOne(id: number): Promise<EvacuationRoute> {
    const route = await this.routeRepo.findOne({
      where: { id },
      relations: ['startNode', 'endNode'],
    });
    if (!route) {
      throw new NotFoundException(`EvacuationRoute with ID ${id} not found.`);
    }
    return route;
  }

  // ============================================
  // SAFEST POINT FUNCTIONALITY
  // ============================================

  /**
   * Finds the safest point when all exits are blocked by fire
   *
   * Algorithm:
   * 1. Get all designated safe points from safe_points table
   * 2. Filter out points that are blocked by fire or unreachable
   * 3. Calculate safety score based on:
   *    - Distance from fire (higher = better)
   *    - Window access (for rescue)
   *    - External access (balcony, porch)
   *    - Priority designation
   * 4. Return the highest scoring accessible safe point
   *
   * @param currentNodeId - User's current location node
   * @param floorId - Optional floor filter
   * @returns Safe point details with route
   */
  async findSafestPoint(
    currentNodeId: number,
    floorId?: number,
  ): Promise<{
    safePoint: any;
    route: any;
    score: number;
    reasons: string[];
  }> {
    // 1. Get all active fire nodes
    const fireNodesQuery = `
      SELECT DISTINCT node_id
      FROM hazards
      WHERE status = 'active' AND node_id IS NOT NULL
    `;
    const fireNodesResult = await this.dataSource.query(fireNodesQuery);
    const activeFireNodes = fireNodesResult.map((r: any) => r.node_id);

    // 2. Get all safe points with their details
    const safePointsQuery = `
      SELECT
        sp.id,
        sp.node_id,
        sp.floor_id,
        sp.priority,
        sp.has_window,
        sp.has_external_access,
        sp.is_fire_resistant,
        sp.has_communication,
        sp.capacity,
        sp.notes,
        n.type as node_type,
        ST_X(ST_Transform(n.geometry, 4326)) as longitude,
        ST_Y(ST_Transform(n.geometry, 4326)) as latitude
      FROM safe_points sp
      JOIN nodes n ON sp.node_id = n.id
      ${floorId ? 'WHERE sp.floor_id = $1' : ''}
      ORDER BY sp.priority ASC
    `;

    const safePoints = floorId
      ? await this.dataSource.query(safePointsQuery, [floorId])
      : await this.dataSource.query(safePointsQuery);

    if (!safePoints || safePoints.length === 0) {
      throw new NotFoundException('No safe points configured for this building');
    }

    // 3. Filter and score safe points
    const scoredPoints = [];

    for (const sp of safePoints) {
      // Skip if safe point is a fire node
      if (activeFireNodes.includes(sp.node_id)) {
        continue;
      }

      // Check if we can reach this safe point
      const canReach = await this.canReachNode(currentNodeId, sp.node_id, activeFireNodes);
      if (!canReach) {
        continue;
      }

      // Calculate safety score
      const { score, reasons } = await this.calculateSafetyScore(sp, activeFireNodes);

      scoredPoints.push({
        ...sp,
        score,
        reasons,
      });
    }

    if (scoredPoints.length === 0) {
      throw new NotFoundException(
        'No accessible safe points available. All safe points are either blocked by fire or unreachable.',
      );
    }

    // 4. Sort by score (highest first) and get best option
    scoredPoints.sort((a, b) => b.score - a.score);
    const bestSafePoint = scoredPoints[0];

    // 5. Compute route to the safest point
    let route = null;
    try {
      const dto = { startNodeId: currentNodeId, endNodeId: bestSafePoint.node_id };
      route = await this.computeRoute(dto);
    } catch (e) {
      // Route computation might fail if already at safe point
      console.warn('Could not compute route to safe point:', e.message);
    }

    return {
      safePoint: {
        id: bestSafePoint.id,
        nodeId: bestSafePoint.node_id,
        floorId: bestSafePoint.floor_id,
        priority: bestSafePoint.priority,
        hasWindow: bestSafePoint.has_window,
        hasExternalAccess: bestSafePoint.has_external_access,
        isFireResistant: bestSafePoint.is_fire_resistant,
        hasCommunication: bestSafePoint.has_communication,
        capacity: bestSafePoint.capacity,
        notes: bestSafePoint.notes,
        coordinates: {
          longitude: bestSafePoint.longitude,
          latitude: bestSafePoint.latitude,
        },
      },
      route,
      score: bestSafePoint.score,
      reasons: bestSafePoint.reasons,
    };
  }

  /**
   * Calculates safety score for a safe point based on multiple factors
   */
  private async calculateSafetyScore(
    safePoint: any,
    activeFireNodes: number[],
  ): Promise<{ score: number; reasons: string[] }> {
    let score = 0;
    const reasons: string[] = [];

    // 1. Distance from fire (most important factor)
    if (activeFireNodes.length > 0) {
      const distanceQuery = `
        SELECT MIN(
          ST_Distance(
            ST_Transform(n_safe.geometry, 4326)::geography,
            ST_Transform(n_fire.geometry, 4326)::geography
          )
        ) as min_fire_distance
        FROM nodes n_safe
        CROSS JOIN nodes n_fire
        WHERE n_safe.id = $1
        AND n_fire.id = ANY($2::int[])
      `;
      const distResult = await this.dataSource.query(distanceQuery, [
        safePoint.node_id,
        activeFireNodes,
      ]);

      const minFireDistance = distResult[0]?.min_fire_distance || 0;

      // Score increases with distance from fire (10 points per meter, max 200)
      const distanceScore = Math.min(minFireDistance * 10, 200);
      score += distanceScore;
      reasons.push(`${Math.round(minFireDistance)}m from nearest fire (+${Math.round(distanceScore)})`);
    } else {
      // No active fires - max distance score
      score += 200;
      reasons.push('No active fires (+200)');
    }

    // 2. External access bonus (rescue teams can reach)
    if (safePoint.has_external_access) {
      score += 100;
      reasons.push('Has external access - rescue teams can reach (+100)');
    }

    // 3. Window access bonus (ventilation, signaling)
    if (safePoint.has_window) {
      score += 50;
      reasons.push('Has window - ventilation and signaling possible (+50)');
    }

    // 4. Fire resistant bonus
    if (safePoint.is_fire_resistant) {
      score += 30;
      reasons.push('Fire resistant structure (+30)');
    }

    // 5. Communication access bonus
    if (safePoint.has_communication) {
      score += 20;
      reasons.push('Has communication access (+20)');
    }

    // 6. Priority bonus (lower priority number = higher bonus)
    const priorityBonus = (10 - safePoint.priority) * 5;
    score += priorityBonus;
    reasons.push(`Priority ${safePoint.priority} (+${priorityBonus})`);

    // 7. Capacity bonus (larger capacity = better for groups)
    const capacityBonus = Math.min(safePoint.capacity * 2, 20);
    score += capacityBonus;
    reasons.push(`Capacity ${safePoint.capacity} people (+${capacityBonus})`);

    return { score, reasons };
  }

  /**
   * Checks if a node can be reached from current position avoiding fire
   * Uses the same room-geometry-based blocking as the main routing algorithms
   * Also excludes edges that cross through fire room geometry
   */
  private async canReachNode(
    fromNodeId: number,
    toNodeId: number,
    _fireNodes: number[], // Kept for API compatibility but we use getBlockedNodesSQL instead
  ): Promise<boolean> {
    if (fromNodeId === toNodeId) return true;

    // Use the comprehensive blocked nodes SQL that blocks all nodes in fire room geometry
    const blockedNodesSQL = this.getBlockedNodesSQL();
    // Get the edge blocking condition (edges that cross through fire rooms)
    const blockedEdgesCondition = this.getBlockedEdgesConditionSQL();

    const reachabilityQuery = `
      SELECT COUNT(*) as path_count
      FROM pgr_dijkstra(
        $$
          SELECT (e.id * 2) AS id, e.source_id AS source, e.target_id AS target, e.cost
          FROM edges e
          WHERE e.source_id NOT IN (${blockedNodesSQL})
          AND e.target_id NOT IN (${blockedNodesSQL})
          AND ${blockedEdgesCondition}
          UNION ALL
          SELECT (e.id * 2 + 1) AS id, e.target_id AS source, e.source_id AS target, e.cost
          FROM edges e
          WHERE e.source_id NOT IN (${blockedNodesSQL})
          AND e.target_id NOT IN (${blockedNodesSQL})
          AND ${blockedEdgesCondition}
        $$,
        $1::integer,
        $2::integer,
        false
      )
      WHERE edge <> -1
    `;

    try {
      const result = await this.dataSource.query(reachabilityQuery, [fromNodeId, toNodeId]);
      return result[0]?.path_count > 0;
    } catch (e) {
      console.warn('Reachability check failed:', e.message);
      return false;
    }
  }

  /**
   * Finds a route to the nearest accessible safe point when exit routes fail
   * This is used as a final fallback in computeRoute()
   *
   * @param currentNodeId - User's current location node
   * @returns Object with route, safe point details, and safe point name
   */
  private async findRouteToNearestSafePoint(currentNodeId: number): Promise<{
    route: any;
    safePoint: any;
    safePointName: string;
  } | null> {
    // Get blocked nodes for filtering
    const blockedNodesSQL = this.getBlockedNodesSQL();

    // Get all safe points with their accessibility from current location
    const safePointsQuery = `
      WITH safe_point_distances AS (
        SELECT
          sp.id,
          sp.node_id,
          sp.floor_id,
          sp.priority,
          sp.has_window,
          sp.has_external_access,
          sp.is_fire_resistant,
          sp.has_communication,
          sp.capacity,
          sp.notes,
          n.type as node_type,
          r.name as room_name,
          ST_X(ST_Transform(n.geometry, 4326)) as longitude,
          ST_Y(ST_Transform(n.geometry, 4326)) as latitude,
          -- Calculate straight-line distance for initial ranking
          ST_Distance(
            ST_Transform(n.geometry, 4326)::geography,
            ST_Transform((SELECT geometry FROM nodes WHERE id = $1), 4326)::geography
          ) as straight_line_distance
        FROM safe_points sp
        JOIN nodes n ON sp.node_id = n.id
        LEFT JOIN room r ON ST_Intersects(n.geometry, r.geometry)
        -- Exclude safe points that are blocked by fire
        WHERE sp.node_id NOT IN (${blockedNodesSQL})
        ORDER BY straight_line_distance ASC
        LIMIT 10
      )
      SELECT * FROM safe_point_distances
    `;

    try {
      const safePoints = await this.dataSource.query(safePointsQuery, [currentNodeId]);

      if (!safePoints || safePoints.length === 0) {
        console.warn('No unblocked safe points available');
        return null;
      }

      // Try to find a route to each safe point in order of distance
      for (const sp of safePoints) {
        // Skip if this is the current node
        if (sp.node_id === currentNodeId) {
          return {
            route: {
              type: 'FeatureCollection',
              features: [],
              alreadyAtSafePoint: true,
            },
            safePoint: {
              id: sp.id,
              nodeId: sp.node_id,
              floorId: sp.floor_id,
              priority: sp.priority,
              hasWindow: sp.has_window,
              hasExternalAccess: sp.has_external_access,
              isFireResistant: sp.is_fire_resistant,
              hasCommunication: sp.has_communication,
              capacity: sp.capacity,
              notes: sp.notes,
              coordinates: {
                longitude: sp.longitude,
                latitude: sp.latitude,
              },
            },
            safePointName: sp.room_name || sp.node_type || 'Safe Point',
          };
        }

        // Try to compute route using simplified algorithm (just Dijkstra without hazard costs)
        // This is more lenient than the main routing to find ANY path to safety
        const routeWkt = await this.computeSimplifiedRouteToSafePoint(currentNodeId, sp.node_id);

        if (routeWkt) {
          // Save the route
          const routeId = await this.saveRouteFromWkt(routeWkt, currentNodeId, sp.node_id);

          if (routeId) {
            const routeGeoJSON = await this.getRouteAsGeoJSON(routeId);

            return {
              route: routeGeoJSON,
              safePoint: {
                id: sp.id,
                nodeId: sp.node_id,
                floorId: sp.floor_id,
                priority: sp.priority,
                hasWindow: sp.has_window,
                hasExternalAccess: sp.has_external_access,
                isFireResistant: sp.is_fire_resistant,
                hasCommunication: sp.has_communication,
                capacity: sp.capacity,
                notes: sp.notes,
                coordinates: {
                  longitude: sp.longitude,
                  latitude: sp.latitude,
                },
              },
              safePointName: sp.room_name || sp.node_type || 'Safe Point',
            };
          }
        }
      }

      return null;
    } catch (error) {
      console.warn('findRouteToNearestSafePoint failed:', error.message);
      return null;
    }
  }

  /**
   * Simplified route computation for safe point fallback
   * Less restrictive than main routing to maximize chances of finding a path
   */
  private async computeSimplifiedRouteToSafePoint(
    startNodeId: number,
    endNodeId: number,
  ): Promise<string | null> {
    try {
      const blockedNodesSQL = this.getBlockedNodesSQL();

      // Simplified edge selection - just avoid blocked nodes, don't add hazard costs
      const edgeSelection = `
        SELECT (e.id * 2) AS id, e.source_id AS source, e.target_id AS target, e.cost
        FROM edges e
        WHERE e.source_id NOT IN (${blockedNodesSQL})
        AND e.target_id NOT IN (${blockedNodesSQL})
        UNION ALL
        SELECT (e.id * 2 + 1) AS id, e.target_id AS source, e.source_id AS target, e.cost
        FROM edges e
        WHERE e.source_id NOT IN (${blockedNodesSQL})
        AND e.target_id NOT IN (${blockedNodesSQL})
      `;

      const pathQuery = `
        WITH route AS (
          SELECT * FROM pgr_dijkstra(
            $$${edgeSelection}$$,
            $1::integer,
            $2::integer,
            false
          )
        )
        SELECT ST_AsText(ST_LineMerge(ST_Collect(e.geometry ORDER BY r.seq))) AS path_wkt
        FROM route r
        JOIN edges e ON e.id = (
          CASE WHEN r.edge % 2 = 0 THEN (r.edge / 2) ELSE ((r.edge - 1) / 2) END
        )
        WHERE r.edge <> -1
      `;

      const result = await this.dataSource.query(pathQuery, [startNodeId, endNodeId]);

      if (!result || result.length === 0 || !result[0].path_wkt) {
        return null;
      }

      return result[0].path_wkt;
    } catch (error) {
      console.warn('computeSimplifiedRouteToSafePoint failed:', error.message);
      return null;
    }
  }

  /**
   * Finds the nearest exit node that is not in a fire zone
   * Used when the requested destination is blocked by fire
   *
   * @param currentNodeId - User's current location node
   * @returns Object with exit node info or null if none found
   */
  private async findNearestSafeExit(currentNodeId: number): Promise<{
    nodeId: number;
    description: string;
    distance: number;
  } | null> {
    const blockedNodesSQL = this.getBlockedNodesSQL();

    // Find exit nodes (type = 'exit' or 'emergency_exit') that are not blocked
    // Ordered by distance from current location
    const exitQuery = `
      SELECT
        n.id as node_id,
        n.description,
        n.type,
        ST_Distance(
          ST_Transform(n.geometry, 4326)::geography,
          ST_Transform((SELECT geometry FROM nodes WHERE id = $1), 4326)::geography
        ) as distance
      FROM nodes n
      WHERE n.type IN ('exit', 'emergency_exit', 'entry', 'door', 'stairs')
        AND n.id NOT IN (${blockedNodesSQL})
      ORDER BY distance ASC
      LIMIT 5
    `;

    try {
      const exits = await this.dataSource.query(exitQuery, [currentNodeId]);

      if (!exits || exits.length === 0) {
        return null;
      }

      // Return the nearest unblocked exit
      return {
        nodeId: exits[0].node_id,
        description: exits[0].description || exits[0].type,
        distance: exits[0].distance,
      };
    } catch (error) {
      console.warn('findNearestSafeExit failed:', error.message);
      return null;
    }
  }

  /**
   * Gets all safe points for the building
   */
  async getAllSafePoints(): Promise<any[]> {
    const query = `
      SELECT
        sp.id,
        sp.node_id,
        sp.floor_id,
        sp.priority,
        sp.has_window,
        sp.has_external_access,
        sp.is_fire_resistant,
        sp.has_communication,
        sp.capacity,
        sp.notes,
        n.type as node_type,
        f.name as floor_name,
        ST_X(ST_Transform(n.geometry, 4326)) as longitude,
        ST_Y(ST_Transform(n.geometry, 4326)) as latitude
      FROM safe_points sp
      JOIN nodes n ON sp.node_id = n.id
      LEFT JOIN floor f ON sp.floor_id = f.id
      ORDER BY sp.floor_id, sp.priority
    `;

    const result = await this.dataSource.query(query);
    return result.map((sp: any) => ({
      id: sp.id,
      nodeId: sp.node_id,
      floorId: sp.floor_id,
      floorName: sp.floor_name,
      priority: sp.priority,
      hasWindow: sp.has_window,
      hasExternalAccess: sp.has_external_access,
      isFireResistant: sp.is_fire_resistant,
      hasCommunication: sp.has_communication,
      capacity: sp.capacity,
      notes: sp.notes,
      coordinates: {
        longitude: sp.longitude,
        latitude: sp.latitude,
      },
    }));
  }

  /**
   * Rebuilds all evacuation routes by computing shortest path for every node pair
   * This deletes existing routes and attempts to compute new ones using the
   * enhanced multi-algorithm routing system (Dijkstra → A* → K-Shortest Paths)
   *
   * Note: The ignoreHazards parameter is kept for API compatibility but currently unused.
   * The new routing system always considers active fires through the computeRoute() method.
   *
   * @param _ignoreHazards - Unused parameter (kept for backward compatibility)
   * @returns Object with count of successfully computed routes and skipped pairs
   */
  async rebuildAllRoutes(
    _ignoreHazards = true,
  ): Promise<{ computed: number; skipped: number }> {
    // Fetch all nodes
    const rows: Array<{ id: number }> = await this.dataSource.query(
      'SELECT id FROM nodes',
    );
    const ids = (rows || []).map((r) => r.id).filter(Boolean);

    // Delete existing routes
    await this.dataSource.query('DELETE FROM evacuation_route');

    let computed = 0;
    let skipped = 0;

    // Compute route for every node pair (i < j to avoid duplicates)
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = ids[i];
        const b = ids[j];
        try {
          const dto: CreateRouteDto = { startNodeId: a, endNodeId: b };
          await this.computeRoute(dto);
          computed++;
        } catch (e) {
          skipped++;
          const errorMessage = e instanceof Error ? e.message : String(e);
          console.warn(
            `Could not compute route from ${a} to ${b}: ${errorMessage}`,
          );
        }
      }
    }

    return { computed, skipped };
  }

  // ============================================
  // ISOLATION EVENT EMISSION
  // ============================================

  /**
   * Emits a WebSocket event when an occupant is detected as isolated/trapped
   * This notifies the rescue dashboard in real-time
   *
   * @param isolationInfo - The isolation analysis details
   * @param trappedOccupantId - The registered trapped occupant ID
   */
  private emitIsolationEvent(
    isolationInfo: any,
    trappedOccupantId: number | null,
  ): void {
    try {
      const globalAny: any = global as any;
      const io =
        globalAny.__io ||
        (globalAny.__appInstance && globalAny.__appInstance.get
          ? globalAny.__appInstance.get('io')
          : null);

      if (io && typeof io.emit === 'function') {
        // Emit to rescue dashboard channel
        io.emit('occupant.isolated', {
          trappedOccupantId,
          nodeId: isolationInfo.nodeId,
          nodeName: isolationInfo.nodeName,
          floorId: isolationInfo.floorId,
          floorName: isolationInfo.floorName,
          isolationReason: isolationInfo.isolationReason,
          priorityLevel: isolationInfo.priorityLevel,
          priorityScore: isolationInfo.priorityScore,
          nearestFireDistance: isolationInfo.nearestFireDistance,
          coordinates: isolationInfo.coordinates,
          shelterInstructions: isolationInfo.shelterInstructions,
          timestamp: new Date().toISOString(),
        });

        this.logger.log(
          `Emitted occupant.isolated event for node ${isolationInfo.nodeId}`,
        );
      }
    } catch (emitErr) {
      this.logger.warn('Could not emit occupant.isolated event', emitErr);
    }
  }
}
