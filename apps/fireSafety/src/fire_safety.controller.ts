import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  ParseIntPipe,
} from '@nestjs/common';
import { FireSafetyService } from './fire_safety.service';
import { CreateRouteDto } from './dto/CreateRoute.dto';
import { DataSource } from 'typeorm';

@Controller('fireSafety')
export class FireSafetyController {
  constructor(
    private readonly fireSafetyService: FireSafetyService,
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

  // Return building details composed from exits and evacuation routes
  @Get('building-details')
  async getBuildingDetailsGeoJSON() {
    // Return only exits - evacuation routes are computed on-demand, not pre-loaded
    const query = `
      SELECT json_build_object('type','FeatureCollection','features', COALESCE(json_agg(f), '[]'::json)) AS geojson FROM (
        SELECT json_build_object('type','Feature','geometry', ST_AsGeoJSON(ST_Transform(e.geometry,4326))::json,'properties', json_build_object('id', e.id, 'feature_type','exit')) AS f FROM exits e
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
        SELECT json_build_object('type','FeatureCollection','features', COALESCE(json_agg(json_build_object('type','Feature','geometry', ST_AsGeoJSON(ST_Transform(n.geometry,4326))::json,'properties', json_build_object('id', s.id, 'type', s.type, 'location', s.location_description))), '[]'::json)) AS geojson
        FROM sensor s
        LEFT JOIN nodes n ON n.id = s.appartment_id OR n.id = s.floor_id OR n.id = s.building_id;
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
  @Get('room-nodes')
  async getRoomNodes() {
    try {
      const query = `
        SELECT
          r.id as room_id,
          r.name as room_name,
          n.id as node_id,
          n.type as node_type,
          f.level as floor_level,
          ST_X(ST_Transform(n.geometry, 4326)) as longitude,
          ST_Y(ST_Transform(n.geometry, 4326)) as latitude
        FROM room r
        JOIN nodes n ON ST_Equals(n.geometry, ST_Centroid(r.geometry))
        JOIN floor f ON r.floor_id = f.id
        ORDER BY r.id;
      `;
      const result = await this.dataSource.query(query);
      return result;
    } catch (e) {
      console.error('Error fetching room-nodes mapping:', e);
      return [];
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

  @Post('compute')
  async compute(@Body() createRouteDto: CreateRouteDto) {
    const { startNodeId, endNodeId } = createRouteDto;

    // First, check whether the start or end node is currently marked as a
    // hazard (status <> 'CLEARED'). If so, we cannot produce a safe path to
    // or from that node and should return a clear error to the client.
    const blocked = await this.dataSource.query(
      `SELECT node_id, status FROM hazards WHERE status <> 'CLEARED' AND node_id IN ($1, $2)`,
      [startNodeId, endNodeId],
    );
    if (blocked && blocked.length > 0) {
      // Determine which endpoint(s) are blocked to provide a better message
      const blockedNodes = blocked.map((b: any) => b.node_id);
      if (
        blockedNodes.includes(startNodeId) &&
        blockedNodes.includes(endNodeId)
      ) {
        return {
          error: true,
          message:
            'Both start and end nodes are affected by active hazards; no safe route can be computed.',
        };
      }
      if (blockedNodes.includes(startNodeId)) {
        return {
          error: true,
          message:
            'Start node is affected by an active hazard; cannot compute a safe route.',
        };
      }
      if (blockedNodes.includes(endNodeId)) {
        // Try to find an alternative safe exit (node.type = 'exit') that is not
        // affected by an active hazard, compute a hazard-aware path to it,
        // and return that as an alternative.
        const safeExits = await this.dataSource.query(
          `SELECT id FROM nodes WHERE type = 'exit' AND id NOT IN (SELECT node_id FROM hazards WHERE status <> 'CLEARED')`,
        );

        if (!safeExits || safeExits.length === 0) {
          return {
            error: true,
            message:
              'End node is affected by an active hazard and no safe exits are available.',
          };
        }

        // For each safe exit, attempt to compute a hazard-aware path and pick the shortest
        let best = null as any;
        for (const ex of safeExits) {
          const exitId = ex.id;
          const pathWkt = await this.fireSafetyService.getPathWktIfExists(
            startNodeId,
            exitId,
            false,
          );
          if (!pathWkt) continue;
          // compute length
          const lenRes = await this.dataSource.query(
            `SELECT ST_Length(ST_GeomFromText($1,3857)) AS len`,
            [pathWkt],
          );
          const len = lenRes && lenRes[0] ? lenRes[0].len : null;
          if (len === null) continue;
          if (!best || len < best.len) {
            best = { exitId, pathWkt, len };
          }
        }

        if (!best) {
          return {
            error: true,
            message:
              'End node is affected by an active hazard and no alternative hazard-free routes could be computed.',
          };
        }

        // Return GeoJSON for the chosen alternative without persisting it (client can accept it)
        const fakeInsert = await this.dataSource.query(
          `SELECT json_build_object('type','FeatureCollection','features', json_agg(json_build_object('type','Feature','geometry', ST_AsGeoJSON(ST_Transform(ST_GeomFromText($1,3857),4326))::json,'properties', json_build_object('altTargetNodeId', $2, 'distance', $3)))) AS geojson`,
          [best.pathWkt, best.exitId, best.len],
        );

        return {
          alternative: true,
          targetNodeId: best.exitId,
          geojson: fakeInsert && fakeInsert[0] ? fakeInsert[0].geojson : null,
        };
      }
    }

    // Try to return an already computed route for this pair (both orderings)
    const stored = await this.dataSource.query(
      `
      SELECT id FROM evacuation_route WHERE (start_node_id = $1 AND end_node_id = $2) OR (start_node_id = $2 AND end_node_id = $1) LIMIT 1
    `,
      [startNodeId, endNodeId],
    );

    if (stored && stored[0] && stored[0].id) {
      const routeId = stored[0].id;

      // Check if any active hazard geometries intersect the stored route path.
      const hazardIntersect = await this.dataSource.query(
        `
          SELECT 1 FROM hazards h
          JOIN nodes n ON n.id = h.node_id
          JOIN evacuation_route er ON er.id = $1
          WHERE h.status <> 'CLEARED' AND ST_Intersects(n.geometry, er.path)
          LIMIT 1
        `,
        [routeId],
      );

      if (hazardIntersect && hazardIntersect.length > 0) {
        // Stored route intersects an active hazard: attempt to compute a
        // hazard-aware replacement route. If compute succeeds it will insert
        // a new evacuation_route; remove the old one to avoid duplicates.
        try {
          const newGeo =
            await this.fireSafetyService.computeAndSavePath(createRouteDto);
          // delete old route record
          console.log(newGeo);
          await this.dataSource.query(
            'DELETE FROM evacuation_route WHERE id = $1',
            [routeId],
          );
          return newGeo;
        } catch (err) {
          // If we couldn't compute a safe alternative, return the stored route
          // but mark it as intersecting hazards so the client can decide how to
          // present it (e.g., show with warning or refuse to use it).
          const storedGeo =
            await this.fireSafetyService.getRouteAsGeoJSON(routeId);
          return {
            warning: true,
            message: 'Stored route intersects active hazards',
            geojson: storedGeo,
          };
        }
      }

      // No hazard intersection -> return stored route GeoJSON
      return this.fireSafetyService.getRouteAsGeoJSON(routeId);
    }

    // Otherwise compute a new path and save it
    return this.fireSafetyService.computeAndSavePath(createRouteDto);
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
}
