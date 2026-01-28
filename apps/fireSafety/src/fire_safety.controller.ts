import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Delete,
  ParseIntPipe,
  BadRequestException,
} from '@nestjs/common';
import { FireSafetyService } from './fire_safety.service';
import { IsolationDetectionService } from './isolation-detection.service';
import { CreateRouteDto } from './dto/CreateRoute.dto';
import { DataSource } from 'typeorm';
import { PlaceFiresDto } from './dto/PlaceFires.dto';
import { FindSafestPointDto } from './dto/FindSafestPoint.dto';

@Controller('fireSafety')
export class FireSafetyController {
  constructor(
    private readonly fireSafetyService: FireSafetyService,
    private readonly isolationDetectionService: IsolationDetectionService,
    private readonly dataSource: DataSource,
  ) {}

  @Get('emergency/exits')
  getEmergencyExits() {
    return {
      building: 'Office Tower A',
      floors: 10,
      emergencyExits: [
        {
          exitId: 'EXIT-001',
          location: 'Ground Floor - North Wing',
          capacity: 150,
          status: 'OPERATIONAL',
          coordinates: { lat: 40.7128, lng: -74.006 },
        },
        {
          exitId: 'EXIT-002',
          location: 'Ground Floor - South Wing',
          capacity: 120,
          status: 'OPERATIONAL',
          coordinates: { lat: 40.7127, lng: -74.0061 },
        },
        {
          exitId: 'EXIT-003',
          location: 'First Floor - East Wing',
          capacity: 80,
          status: 'UNDER_MAINTENANCE',
          coordinates: { lat: 40.7129, lng: -74.0059 },
        },
      ],
      totalCapacity: 350,
      lastUpdated: new Date().toISOString(),
    };
  }

  @Post('hazard')
  broadcastHazard(@Body() hazard: any) {
    // Emit hazard to connected socket clients if available
    try {
      const globalAny: any = global as any;
      const io =
        globalAny.__io ||
        (globalAny.__appInstance && globalAny.__appInstance.get
          ? globalAny.__appInstance.get('io')
          : null) ||
        globalAny.io ||
        null;
      if (io && typeof io.emit === 'function') {
        io.emit('hazard.updated', hazard);
      }
    } catch (e) {
      console.warn('Could not emit hazard', e);
    }
    // After broadcasting hazard, schedule route rebuild asynchronously
    try {
      // fire and forget - rebuild with hazards considered so routes avoid active hazards
      this.fireSafetyService
        .rebuildAllRoutes(false)
        .then((res) => {
          console.log('RebuildAllRoutes completed after hazard:', res);
          try {
            const globalAny: any = global as any;
            const io =
              globalAny.__io ||
              (globalAny.__appInstance && globalAny.__appInstance.get
                ? globalAny.__appInstance.get('io')
                : null) ||
              globalAny.io ||
              null;
            if (io && typeof io.emit === 'function')
              io.emit('evacuationRoutes.rebuilt', res);
          } catch (e) {
            console.warn('Could not emit evacuationRoutes.rebuilt', e);
          }
        })
        .catch((err) => console.warn('RebuildAllRoutes failed', err));
    } catch (e) {
      console.warn('Could not schedule rebuildAllRoutes', e);
    }

    return { ok: true, hazard };
  }

  // Return building polygon(s) as GeoJSON FeatureCollection
  @Get('building')
  async getBuildingAsGeoJSON() {
    const query = `
      SELECT json_build_object(
        'type', 'FeatureCollection',
        'features', COALESCE(json_agg(
          json_build_object(
            'type','Feature',
            'geometry', ST_AsGeoJSON(ST_Transform(geometry, 4326))::json,
            'properties', json_build_object('id', id, 'name', name, 'type', type)
          )
        ), '[]'::json)
      ) AS geojson
      FROM building;
    `;
    const res = await this.dataSource.query(query);
    return res && res[0]
      ? res[0].geojson
      : { type: 'FeatureCollection', features: [] };
  }

  // Return features table as GeoJSON FeatureCollection
  @Get('building-features')
  async getFeaturesAsGeoJSON() {
    const query = `
      SELECT json_build_object(
        'type', 'FeatureCollection',
        'features', COALESCE(json_agg(
          json_build_object(
            'type','Feature',
            'geometry', ST_AsGeoJSON(ST_Transform(geometry, 4326))::json,
            'properties', json_build_object('id', id, 'name', name, 'feature_type', type)
          )
        ), '[]'::json)
      ) AS geojson
      FROM features;
    `;
    const res = await this.dataSource.query(query);
    return res && res[0]
      ? res[0].geojson
      : { type: 'FeatureCollection', features: [] };
  }

  // Return building details composed from openings (doors, emergency exits, etc.)
  @Get('building-details')
  async getBuildingDetailsGeoJSON() {
    // Return openings - evacuation routes are computed on-demand, not pre-loaded
    const query = `
      SELECT json_build_object('type','FeatureCollection','features', COALESCE(json_agg(f), '[]'::json)) AS geojson FROM (
        SELECT json_build_object(
          'type','Feature',
          'geometry', ST_AsGeoJSON(ST_Transform(o.geometry,4326))::json,
          'properties', json_build_object(
            'id', o.id,
            'feature_type', o.opening_type,
            'name', o.name,
            'is_emergency_exit', o.is_emergency_exit,
            'width_meters', o.width_meters,
            'color', o.color
          )
        ) AS f FROM opening o
      ) t;
    `;
    const res = await this.dataSource.query(query);
    return res && res[0]
      ? res[0].geojson
      : { type: 'FeatureCollection', features: [] };
  }

  // Return sensors with coordinates derived from linked nodes when available
  @Get('sensors')
  async getSensors() {
    // Try to join sensors to nodes to get their geometry. If DB schema differs, return safe empty FeatureCollection.
    try {
      const query = `
        SELECT json_build_object(
          'type', 'FeatureCollection',
          'features', COALESCE(json_agg(
            json_build_object(
              'type', 'Feature',
              'geometry', COALESCE(
                ST_AsGeoJSON(ST_Transform(s.geometry, 4326))::json,
                ST_AsGeoJSON(ST_Transform(n.geometry, 4326))::json
              ),
              'properties', json_build_object(
                'id', s.id,
                'type', s.type,
                'name', s.name,
                'status', s.status,
                'value', s.value,
                'unit', s.unit
              )
            )
          ) FILTER (WHERE s.id IS NOT NULL), '[]'::json)
        ) AS geojson
        FROM sensors s
        LEFT JOIN nodes n ON n.id = s.node_id;
      `;
      const res = await this.dataSource.query(query);
      return res && res[0]
        ? res[0].geojson
        : { type: 'FeatureCollection', features: [] };
    } catch (e) {
      console.warn(
        'getSensors query failed, returning empty FeatureCollection',
        e && e.message ? e.message : e,
      );
      return { type: 'FeatureCollection', features: [] };
    }
  }

  // Return hazards (join to nodes for geometry)
  @Get('hazards')
  async getHazards() {
    const query = `
      SELECT json_build_object('type','FeatureCollection','features', COALESCE(json_agg(json_build_object('type','Feature','geometry', ST_AsGeoJSON(ST_Transform(n.geometry,4326))::json,'properties', json_build_object('id', h.id, 'type', h.type, 'severity', h.severity, 'status', h.status))), '[]'::json)) AS geojson
      FROM hazards h
      LEFT JOIN nodes n ON n.id = h.node_id;
    `;
    const res = await this.dataSource.query(query);
    return res && res[0]
      ? res[0].geojson
      : { type: 'FeatureCollection', features: [] };
  }

  // Return nodes as GeoJSON features
  @Get('nodes')
  async getNodes() {
    const query = `
      SELECT json_build_object('type','FeatureCollection','features', COALESCE(json_agg(json_build_object('type','Feature','geometry', ST_AsGeoJSON(ST_Transform(geometry,4326))::json,'properties', json_build_object('id', id, 'type', type))), '[]'::json)) AS geojson
      FROM nodes;
    `;
    const res = await this.dataSource.query(query);
    return res && res[0]
      ? res[0].geojson
      : { type: 'FeatureCollection', features: [] };
  }

  // Return floors as GeoJSON
  @Get('floors')
  async getFloors() {
    const query = `
      SELECT json_build_object('type','FeatureCollection','features', COALESCE(json_agg(json_build_object('type','Feature','geometry', ST_AsGeoJSON(ST_Transform(geometry,4326))::json,'properties', json_build_object('id', id, 'name', name, 'level', level))), '[]'::json)) AS geojson
      FROM floor;
    `;
    const res = await this.dataSource.query(query);
    return res && res[0]
      ? res[0].geojson
      : { type: 'FeatureCollection', features: [] };
  }

  // Return apartments (simple JSON)
  @Get('apartments')
  async getApartments() {
    try {
      // apartment table uses `unit_number` field for the apartment identifier
      const query = `SELECT json_agg(json_build_object('id', id, 'name', unit_number)) as arr FROM apartment;`;
      const res = await this.dataSource.query(query);
      return res && res[0] && res[0].arr ? res[0].arr : [];
    } catch (e) {
      console.warn(
        'getApartments query failed, returning empty array',
        e && e.message ? e.message : e,
      );
      return [];
    }
  }

  // Return rooms as GeoJSON (join to room table)
  @Get('rooms')
  async getRooms() {
    const query = `
      SELECT json_build_object(
        'type', 'FeatureCollection',
        'features', COALESCE(json_agg(
          json_build_object(
            'type', 'Feature',
            'geometry', ST_AsGeoJSON(ST_Transform(r.geometry, 4326))::json,
            'properties', json_build_object(
              'id', r.id,
              'name', r.name,
              'type', r.type,
              'address', COALESCE(f.level::text, '0'),
              'color', CASE r.type
                WHEN 'bedroom' THEN '#29B6F6'
                WHEN 'bathroom' THEN '#26C6DA'
                WHEN 'kitchen' THEN '#FF9800'
                WHEN 'living' THEN '#66BB6A'
                WHEN 'dining' THEN '#FFC107'
                WHEN 'garage' THEN '#9E9E9E'
                WHEN 'office' THEN '#7E57C2'
                WHEN 'corridor' THEN '#ECEFF1'
                WHEN 'stairs' THEN '#757575'
                WHEN 'outdoor' THEN '#81C784'
                WHEN 'common' THEN '#66BB6A'
                WHEN 'utility' THEN '#8D6E63'
                WHEN 'storage' THEN '#A1887F'
                WHEN 'closet' THEN '#BCAAA4'
                WHEN 'entry' THEN '#8D6E63'
                WHEN 'hallway' THEN '#ECEFF1'
                WHEN 'recreation' THEN '#66BB6A'
                WHEN 'furniture' THEN '#E0E0E0'
                ELSE '#BDBDBD'
              END
            )
          )
        ), '[]'::json)
      ) AS geojson
      FROM room r
      LEFT JOIN floor f ON r.floor_id = f.id;
    `;
    const res = await this.dataSource.query(query);
    return res && res[0]
      ? res[0].geojson
      : { type: 'FeatureCollection', features: [] };
  }

  // Get room-to-node mapping for navigation
  // Door markers are placed at room BOUNDARIES (where rooms touch) not at room centers
  @Get('room-nodes')
  async getRoomNodes() {
    try {
      // Compute door positions from room boundary intersections
      // Find where rooms share boundaries and place markers there
      const query = `
        WITH room_boundaries AS (
          -- Find all room pairs that share a boundary (door locations)
          SELECT
            r1.id as room_id,
            r1.name as room_name,
            r2.id as adjacent_room_id,
            r2.name as adjacent_room_name,
            f.level as floor_level,
            -- The door position is the centroid of the shared boundary
            ST_Centroid(ST_Intersection(r1.geometry, r2.geometry)) as door_geometry
          FROM room r1
          JOIN room r2 ON r1.id < r2.id
            AND r1.floor_id = r2.floor_id
            AND ST_Touches(r1.geometry, r2.geometry)
          JOIN floor f ON r1.floor_id = f.id
        ),
        room_door_positions AS (
          -- For each room, get all its door positions with type determination
          SELECT DISTINCT ON (room_id)
            room_id,
            room_name,
            floor_level,
            ST_X(ST_Transform(door_geometry, 4326)) as longitude,
            ST_Y(ST_Transform(door_geometry, 4326)) as latitude,
            adjacent_room_name,
            -- Determine door type based on room names and connections
            CASE
              WHEN LOWER(room_name) LIKE '%stair%' OR LOWER(adjacent_room_name) LIKE '%stair%'
                   OR LOWER(room_name) LIKE '%basement%' OR LOWER(adjacent_room_name) LIKE '%basement%' THEN 'stairs'
              WHEN LOWER(room_name) LIKE '%foyer%' OR LOWER(room_name) LIKE '%entry%'
                   OR LOWER(room_name) LIKE '%porch%' OR LOWER(room_name) LIKE '%vestibule%' THEN 'entry'
              WHEN LOWER(adjacent_room_name) LIKE '%foyer%' OR LOWER(adjacent_room_name) LIKE '%entry%'
                   OR LOWER(adjacent_room_name) LIKE '%porch%' THEN 'entry'
              WHEN LOWER(room_name) LIKE '%garage%' OR LOWER(adjacent_room_name) LIKE '%garage%' THEN 'exit'
              WHEN LOWER(room_name) LIKE '%hall%' OR LOWER(adjacent_room_name) LIKE '%hall%' THEN 'doorway'
              ELSE 'doorway'
            END as node_type,
            -- Priority for DISTINCT ON selection: prefer entry/exit connections
            CASE
              WHEN LOWER(adjacent_room_name) LIKE '%foyer%' OR LOWER(adjacent_room_name) LIKE '%entry%' THEN 1
              WHEN LOWER(adjacent_room_name) LIKE '%hall%' THEN 2
              WHEN LOWER(adjacent_room_name) LIKE '%stair%' OR LOWER(adjacent_room_name) LIKE '%basement%' THEN 3
              ELSE 4
            END as priority
          FROM room_boundaries
          UNION ALL
          -- Also include the adjacent room's perspective
          SELECT DISTINCT ON (adjacent_room_id)
            adjacent_room_id as room_id,
            adjacent_room_name as room_name,
            floor_level,
            ST_X(ST_Transform(door_geometry, 4326)) as longitude,
            ST_Y(ST_Transform(door_geometry, 4326)) as latitude,
            room_name as adjacent_room_name,
            CASE
              WHEN LOWER(adjacent_room_name) LIKE '%stair%' OR LOWER(room_name) LIKE '%stair%'
                   OR LOWER(adjacent_room_name) LIKE '%basement%' OR LOWER(room_name) LIKE '%basement%' THEN 'stairs'
              WHEN LOWER(adjacent_room_name) LIKE '%foyer%' OR LOWER(adjacent_room_name) LIKE '%entry%'
                   OR LOWER(adjacent_room_name) LIKE '%porch%' THEN 'entry'
              WHEN LOWER(room_name) LIKE '%foyer%' OR LOWER(room_name) LIKE '%entry%'
                   OR LOWER(room_name) LIKE '%porch%' THEN 'entry'
              WHEN LOWER(adjacent_room_name) LIKE '%garage%' OR LOWER(room_name) LIKE '%garage%' THEN 'exit'
              WHEN LOWER(adjacent_room_name) LIKE '%hall%' OR LOWER(room_name) LIKE '%hall%' THEN 'doorway'
              ELSE 'doorway'
            END as node_type,
            CASE
              WHEN LOWER(room_name) LIKE '%foyer%' OR LOWER(room_name) LIKE '%entry%' THEN 1
              WHEN LOWER(room_name) LIKE '%hall%' THEN 2
              WHEN LOWER(room_name) LIKE '%stair%' OR LOWER(room_name) LIKE '%basement%' THEN 3
              ELSE 4
            END as priority
          FROM room_boundaries
        ),
        final_positions AS (
          SELECT DISTINCT ON (room_id)
            room_id,
            room_name,
            floor_level,
            longitude,
            latitude,
            node_type
          FROM room_door_positions
          ORDER BY room_id, priority ASC
        )
        SELECT
          room_id,
          room_name,
          room_id as node_id,  -- Use room_id as pseudo node_id
          node_type,
          floor_level,
          longitude,
          latitude
        FROM final_positions
        ORDER BY floor_level, room_id;
      `;
      const result = await this.dataSource.query(query);
      return result;
    } catch (e) {
      console.error('Error fetching room-nodes mapping:', e);
      return [];
    }
  }
  /**
   * POST /fireSafety/place-fires
   * Creates hazard records for manually placed fire zones
   * Returns hazard IDs for tracking
   */
  @Post('place-fires')
  async placeFires(@Body() dto: PlaceFiresDto) {
    try {
      const hazardIds = [];

      // Insert hazard for each fire zone
      for (const zone of dto.fireZones) {
        // Get apartment_id for the node
        const apartmentQuery = `SELECT apartment_id FROM nodes WHERE id = $1`;
        const apartmentResult = await this.dataSource.query(apartmentQuery, [
          zone.nodeId,
        ]);

        const apartmentId =
          apartmentResult && apartmentResult[0]
            ? apartmentResult[0].apartment_id
            : null;

        // Insert hazard record
        const insertQuery = `
            INSERT INTO hazards (node_id, type, severity, status, apartment_id, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            RETURNING id
          `;

        const result = await this.dataSource.query(insertQuery, [
          zone.nodeId,
          dto.type,
          dto.severity,
          dto.status,
          apartmentId,
        ]);

        if (result && result[0]) {
          hazardIds.push(result[0].id);
        }
      }

      return {
        success: true,
        message: `${dto.fireZones.length} fire zone(s) placed successfully`,
        hazardIds: hazardIds,
        count: hazardIds.length,
      };
    } catch (error) {
      console.error('Error placing fire zones:', error);
      throw new BadRequestException(
        `Failed to place fire zones: ${error.message}`,
      );
    }
  }

  /**
   * POST /fireSafety/clear-fires
   * Clears all manual fire hazards (status = ACTIVE, type = manual_fire)
   */
  @Post('clear-fires')
  async clearFires() {
    try {
      // Delete all active manual fires
      const deleteQuery = `
          DELETE FROM hazards 
          WHERE type = 'manual_fire' AND status = 'ACTIVE'
          RETURNING id
        `;

      const result = await this.dataSource.query(deleteQuery);
      const deletedCount = result ? result.length : 0;

      return {
        success: true,
        message: `${deletedCount} fire zone(s) cleared successfully`,
        deletedCount: deletedCount,
      };
    } catch (error) {
      console.error('Error clearing fire zones:', error);
      throw new BadRequestException(
        `Failed to clear fire zones: ${error.message}`,
      );
    }
  }
  // Simple occupancy endpoint — returns a number of occupants (placeholder logic)
  @Get('occupancy')
  async getOccupancy() {
    // Example: sum of people counts from an occupancy table if present; fallback to 0
    try {
      const r = await this.dataSource.query(`SELECT 0 as occupancy`);
      return { occupancy: r && r[0] ? r[0].occupancy : 0 };
    } catch (e) {
      return { occupancy: 0 };
    }
  }

  /**
   * POST /fireSafety/compute
   * Computes evacuation route using advanced multi-algorithm approach
   *
   * Features:
   * - Dijkstra with hazard-aware dynamic costs (primary)
   * - A* heuristic algorithm (fallback 1)
   * - K-Shortest Paths with alternatives (fallback 2)
   * - Automatic fire zone exclusion
   * - Dynamic cost adjustment based on proximity to fire
   *
   * @param createRouteDto - Contains startNodeId, endNodeId, optional assignedTo
   * @returns GeoJSON FeatureCollection with computed route
   */
  @Post('compute')
  async compute(@Body() createRouteDto: CreateRouteDto) {
    // Use the new enhanced service with 3-algorithm fallback and hazard-aware costs
    // The service automatically:
    // 1. Validates nodes exist
    // 2. Checks if start/end are fire zones (throws error if they are)
    // 3. Tries Dijkstra with dynamic fire proximity costs
    // 4. Falls back to A* if Dijkstra fails
    // 5. Falls back to K-Shortest Paths if A* fails
    // 6. Saves route to database
    // 7. Returns GeoJSON format for frontend display
    return this.fireSafetyService.computeRoute(createRouteDto);
  }

  // Debug endpoint: returns raw pgr_dijkstra rows, referenced edges, and active hazards
  @Post('debug/route')
  async debugRoute(@Body() dto: CreateRouteDto) {
    const { startNodeId, endNodeId } = dto;

    // Raw pgr_dijkstra output (without filtering) using column names commonly used
    const pgrSql = `
      SELECT * FROM pgr_dijkstra(
        $$
          SELECT (id * 2) AS id, source_id AS source, target_id AS target, cost FROM edges
          UNION ALL
          SELECT (id * 2 + 1) AS id, target_id AS source, source_id AS target, cost FROM edges
        $$,
        $1::integer,
        $2::integer,
        false
      );
    `;
    const pgrRows = await this.dataSource.query(pgrSql, [
      startNodeId,
      endNodeId,
    ]);

    // Collect any edge ids referenced (exclude -1)
    const edgeIds = (pgrRows || [])
      .filter((r) => r && r.edge && r.edge !== -1)
      .map((r) => r.edge);

    let edges = [];
    if (edgeIds.length) {
      const placeholder = edgeIds.map((_, i) => `$${i + 3}`).join(',');
      const edgesSql = `SELECT id, source_id, target_id, cost, ST_AsGeoJSON(ST_Transform(geometry,4326)) AS geometry_geojson FROM edges WHERE id IN (${edgeIds.join(',')})`;
      edges = await this.dataSource.query(edgesSql);
    }

    const hazards = await this.dataSource.query(
      `SELECT id, node_id, type, severity, status FROM hazards WHERE status <> 'CLEARED'`,
    );

    return { startNodeId, endNodeId, pgrRows, edgeIds, edges, hazards };
  }

  // Admin: trigger a rebuild of all routes. Optional body: { ignoreHazards: boolean }
  @Post('rebuild')
  async rebuild(@Body() body: any) {
    const ignoreHazards = body && body.ignoreHazards === true;
    const res = await this.fireSafetyService.rebuildAllRoutes(ignoreHazards);
    return res;
  }

  @Get()
  findAll() {
    return this.fireSafetyService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.fireSafetyService.findOne(id);
  }

  @Get(':id/geojson')
  getRouteAsGeoJSON(@Param('id', ParseIntPipe) id: number) {
    // First, ensure the route exists. findOne will throw if not found.
    this.fireSafetyService.findOne(id);
    // Then, return the GeoJSON representation.
    return this.fireSafetyService.getRouteAsGeoJSON(id);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.fireSafetyService.remove(id);
  }

  // ============================================
  // SAFEST POINT ENDPOINTS
  // ============================================

  /**
   * POST /fireSafety/safest-point
   * Finds the safest point when exits are blocked by fire
   *
   * This endpoint calculates the best location for a person to wait
   * for rescue when all exits are blocked. The algorithm considers:
   * - Distance from active fires
   * - Window access (ventilation, signaling)
   * - External access (rescue teams can reach)
   * - Fire resistant structure
   * - Communication access
   * - Capacity for multiple people
   *
   * @param dto - Contains currentNodeId and optional floorId
   * @returns Safe point details with route and safety score breakdown
   */
  @Post('safest-point')
  async findSafestPoint(@Body() dto: FindSafestPointDto) {
    return this.fireSafetyService.findSafestPoint(
      dto.currentNodeId,
      dto.floorId,
    );
  }

  /**
   * GET /fireSafety/safe-points
   * Returns all configured safe points in the building
   *
   * Safe points are pre-designated locations where people can
   * safely wait for rescue if exits are blocked.
   */
  @Get('safe-points')
  async getAllSafePoints() {
    return this.fireSafetyService.getAllSafePoints();
  }

  /**
   * GET /fireSafety/safe-points/geojson
   * Returns safe points as GeoJSON for map display
   */
  @Get('safe-points/geojson')
  async getSafePointsAsGeoJSON() {
    const query = `
      SELECT json_build_object(
        'type', 'FeatureCollection',
        'features', COALESCE(json_agg(
          json_build_object(
            'type', 'Feature',
            'geometry', ST_AsGeoJSON(ST_Transform(n.geometry, 4326))::json,
            'properties', json_build_object(
              'id', sp.id,
              'nodeId', sp.node_id,
              'priority', sp.priority,
              'hasWindow', sp.has_window,
              'hasExternalAccess', sp.has_external_access,
              'isFireResistant', sp.is_fire_resistant,
              'capacity', sp.capacity,
              'notes', sp.notes,
              'type', 'safe_point'
            )
          )
        ), '[]'::json)
      ) AS geojson
      FROM safe_points sp
      JOIN nodes n ON sp.node_id = n.id;
    `;
    const res = await this.dataSource.query(query);
    return res && res[0]
      ? res[0].geojson
      : { type: 'FeatureCollection', features: [] };
  }

  // ============================================
  // RESCUE MANAGEMENT ENDPOINTS
  // ============================================

  /**
   * Get all trapped occupants ordered by rescue priority
   * Used by rescue dashboard to see who needs help first
   */
  @Get('rescue/trapped-occupants')
  async getTrappedOccupants() {
    const occupants =
      await this.isolationDetectionService.getTrappedOccupantsByPriority();

    return {
      success: true,
      count: occupants.length,
      data: occupants,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get a specific trapped occupant's details
   */
  @Get('rescue/trapped-occupants/:id')
  async getTrappedOccupant(@Param('id', ParseIntPipe) id: number) {
    const result = await this.dataSource.query(
      `SELECT
        to_.*,
        rt.team_name as assigned_team_name,
        rt.team_code as assigned_team_code,
        rt.status as team_status
      FROM trapped_occupants to_
      LEFT JOIN rescue_teams rt ON to_.assigned_team_id = rt.id
      WHERE to_.id = $1`,
      [id],
    );

    if (!result || result.length === 0) {
      throw new BadRequestException(`Trapped occupant with ID ${id} not found`);
    }

    return {
      success: true,
      data: result[0],
    };
  }

  /**
   * Update trapped occupant information (e.g., add more details about occupants)
   */
  @Put('rescue/trapped-occupants/:id')
  async updateTrappedOccupant(
    @Param('id', ParseIntPipe) id: number,
    @Body()
    updateDto: {
      occupantCount?: number;
      hasElderly?: boolean;
      hasDisabled?: boolean;
      hasChildren?: boolean;
      contactNumber?: string;
      status?: string;
    },
  ) {
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updateDto.occupantCount !== undefined) {
      updates.push(`occupant_count = $${paramIndex++}`);
      values.push(updateDto.occupantCount);
    }
    if (updateDto.hasElderly !== undefined) {
      updates.push(`has_elderly = $${paramIndex++}`);
      values.push(updateDto.hasElderly);
    }
    if (updateDto.hasDisabled !== undefined) {
      updates.push(`has_disabled = $${paramIndex++}`);
      values.push(updateDto.hasDisabled);
    }
    if (updateDto.hasChildren !== undefined) {
      updates.push(`has_children = $${paramIndex++}`);
      values.push(updateDto.hasChildren);
    }
    if (updateDto.contactNumber !== undefined) {
      updates.push(`contact_number = $${paramIndex++}`);
      values.push(updateDto.contactNumber);
    }
    if (updateDto.status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      values.push(updateDto.status);
    }

    if (updates.length === 0) {
      throw new BadRequestException('No fields to update');
    }

    updates.push(`updated_at = NOW()`);
    values.push(id);

    await this.dataSource.query(
      `UPDATE trapped_occupants SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
      values,
    );

    return {
      success: true,
      message: 'Trapped occupant updated successfully',
    };
  }

  /**
   * Get all rescue teams with their current status and assignments
   */
  @Get('rescue/teams')
  async getRescueTeams() {
    const teams = await this.isolationDetectionService.getAllRescueTeams();

    return {
      success: true,
      count: teams.length,
      data: teams,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get available (unassigned) rescue teams
   */
  @Get('rescue/teams/available')
  async getAvailableRescueTeams() {
    const teams = await this.isolationDetectionService.getAvailableRescueTeams();

    return {
      success: true,
      count: teams.length,
      data: teams,
    };
  }

  /**
   * Assign a rescue team to a trapped occupant
   */
  @Post('rescue/assign')
  async assignRescueTeam(
    @Body()
    assignDto: {
      trappedOccupantId: number;
      rescueTeamId: number;
      estimatedRescueMinutes?: number;
    },
  ) {
    if (!assignDto.trappedOccupantId || !assignDto.rescueTeamId) {
      throw new BadRequestException(
        'trappedOccupantId and rescueTeamId are required',
      );
    }

    await this.isolationDetectionService.assignRescueTeam(
      assignDto.trappedOccupantId,
      assignDto.rescueTeamId,
      assignDto.estimatedRescueMinutes,
    );

    // Emit WebSocket event for real-time dashboard update
    try {
      const globalAny: any = global as any;
      const io =
        globalAny.__io ||
        (globalAny.__appInstance && globalAny.__appInstance.get
          ? globalAny.__appInstance.get('io')
          : null);

      if (io && typeof io.emit === 'function') {
        io.emit('rescue.assigned', {
          trappedOccupantId: assignDto.trappedOccupantId,
          rescueTeamId: assignDto.rescueTeamId,
          estimatedRescueMinutes: assignDto.estimatedRescueMinutes,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (e) {
      console.warn('Could not emit rescue.assigned event', e);
    }

    return {
      success: true,
      message: 'Rescue team assigned successfully',
    };
  }

  /**
   * Mark a trapped occupant as rescued
   */
  @Post('rescue/mark-rescued/:id')
  async markAsRescued(@Param('id', ParseIntPipe) id: number) {
    await this.isolationDetectionService.markAsRescued(id);

    // Emit WebSocket event
    try {
      const globalAny: any = global as any;
      const io =
        globalAny.__io ||
        (globalAny.__appInstance && globalAny.__appInstance.get
          ? globalAny.__appInstance.get('io')
          : null);

      if (io && typeof io.emit === 'function') {
        io.emit('occupant.rescued', {
          trappedOccupantId: id,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (e) {
      console.warn('Could not emit occupant.rescued event', e);
    }

    return {
      success: true,
      message: 'Occupant marked as rescued',
    };
  }

  /**
   * Update rescue team status
   */
  @Put('rescue/teams/:id/status')
  async updateTeamStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() statusDto: { status: string; currentLocation?: string },
  ) {
    if (!statusDto.status) {
      throw new BadRequestException('status is required');
    }

    const validStatuses = [
      'AVAILABLE',
      'ASSIGNED',
      'EN_ROUTE',
      'ON_SCENE',
      'RETURNING',
      'OFF_DUTY',
    ];

    if (!validStatuses.includes(statusDto.status)) {
      throw new BadRequestException(
        `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
      );
    }

    await this.dataSource.query(
      `UPDATE rescue_teams SET
        status = $1,
        current_location = COALESCE($2, current_location),
        last_status_update = NOW()
      WHERE id = $3`,
      [statusDto.status, statusDto.currentLocation || null, id],
    );

    return {
      success: true,
      message: 'Team status updated',
    };
  }

  /**
   * Get rescue statistics/dashboard summary
   */
  @Get('rescue/stats')
  async getRescueStats() {
    const stats = await this.dataSource.query(`
      SELECT
        (SELECT COUNT(*) FROM trapped_occupants WHERE status NOT IN ('RESCUED', 'EVACUATED')) as active_trapped,
        (SELECT COUNT(*) FROM trapped_occupants WHERE priority_level = 'CRITICAL' AND status NOT IN ('RESCUED', 'EVACUATED')) as critical_count,
        (SELECT COUNT(*) FROM trapped_occupants WHERE priority_level = 'HIGH' AND status NOT IN ('RESCUED', 'EVACUATED')) as high_count,
        (SELECT COUNT(*) FROM trapped_occupants WHERE priority_level = 'MEDIUM' AND status NOT IN ('RESCUED', 'EVACUATED')) as medium_count,
        (SELECT COUNT(*) FROM trapped_occupants WHERE priority_level = 'LOW' AND status NOT IN ('RESCUED', 'EVACUATED')) as low_count,
        (SELECT COUNT(*) FROM trapped_occupants WHERE status = 'RESCUED') as rescued_count,
        (SELECT COUNT(*) FROM rescue_teams WHERE status = 'AVAILABLE') as available_teams,
        (SELECT COUNT(*) FROM rescue_teams WHERE status IN ('ASSIGNED', 'EN_ROUTE', 'ON_SCENE')) as active_teams,
        (SELECT SUM(occupant_count) FROM trapped_occupants WHERE status NOT IN ('RESCUED', 'EVACUATED')) as total_trapped_people
    `);

    return {
      success: true,
      data: stats[0],
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get isolation event history for audit trail
   */
  @Get('rescue/events')
  async getIsolationEvents() {
    const events = await this.dataSource.query(`
      SELECT
        ie.*,
        to_.room_name as trapped_location,
        rt.team_name as rescue_team_name
      FROM isolation_events ie
      LEFT JOIN trapped_occupants to_ ON ie.trapped_occupant_id = to_.id
      LEFT JOIN rescue_teams rt ON ie.rescue_team_id = rt.id
      ORDER BY ie.event_at DESC
      LIMIT 100
    `);

    return {
      success: true,
      count: events.length,
      data: events,
    };
  }
}
