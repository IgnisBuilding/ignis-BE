import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EvacuationRoute } from '@app/entities';
import { DataSource, Repository } from 'typeorm';
import { CreateRouteDto } from './dto/CreateRoute.dto';

@Injectable()
export class FireSafetyService {
  constructor(
    @InjectRepository(EvacuationRoute)
    private readonly routeRepo: Repository<EvacuationRoute>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Finds all saved evacuation routes.
   */
  findAll(): Promise<EvacuationRoute[]> { // It's good practice to include relations
    return this.routeRepo.find({ relations: ['startNode', 'endNode'] });
  }

  /**
   * Finds a single saved evacuation route by its ID.
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
  
  /**
   * Computes the shortest path, saves it, and returns it as GeoJSON.
   */
  async computeAndSavePath(
    dto: CreateRouteDto,
  ): Promise<any> {
    const { startNodeId, endNodeId, assignedTo } = dto; // assignedTo can be undefined

    try {
      // Use the robust helper which tries multiple pgr variants.
      const pathWkt = await this.getPathWktIfExists(startNodeId, endNodeId);
      if (!pathWkt) {
        throw new NotFoundException(`No path found between node ${startNodeId} and ${endNodeId}.`);
      }

      // Insert the evacuation route in a single query including the path geometry
      const assigned = assignedTo === undefined ? null : assignedTo;
      const insertSql = `
        INSERT INTO evacuation_route (path, assigned_to, distance, start_node_id, end_node_id)
        VALUES (ST_GeomFromText($1, 3857), $2, ST_Length(ST_GeomFromText($1,3857)), $3, $4)
        RETURNING id;
      `;
  const insertRes = await this.dataSource.query(insertSql, [pathWkt, assigned, startNodeId, endNodeId]);
      const savedId = insertRes && insertRes[0] ? insertRes[0].id : null;
      if (!savedId) {
        throw new Error('Failed to insert evacuation_route with geometry');
      }

      // Return the computed path as a GeoJSON Feature (getRouteAsGeoJSON will now transform to 4326)
  const geojson = await this.getRouteAsGeoJSON(savedId);

      // Emit socket event notifying clients that a new evacuation route was created.
      // Access the Socket.IO server via a global reference first to avoid
      // attempting a Nest provider lookup (app.get('io')) which can throw
      // UnknownElementException when called from certain contexts during
      // bootstrap. If global.__io isn't present, fall back to guarded access
      // through the global app instance.
      try {
        const globalAny: any = global as any;
        const io = globalAny.__io || (globalAny.__appInstance && globalAny.__appInstance.get ? globalAny.__appInstance.get('io') : null);
        if (io && typeof io.emit === 'function') {
          io.emit('evacuationRoute.updated', { id: savedId, geojson });
        }
      } catch (emitErr) {
        console.warn('Could not emit evacuationRoute.updated', emitErr);
      }

      return geojson;
    } catch (e) {
      // Log and rethrow as a BadRequest for clearer client feedback
      console.error('computeAndSavePath error', e && e.stack ? e.stack : e);
      throw new BadRequestException(e && e.message ? `Compute failed: ${e.message}` : 'Compute failed');
    }
  }

  /**
   * Helper: returns WKT path for a pair, or null when no path exists.
   * This does not throw when no path exists, which is useful for batch rebuilds.
   */
  async getPathWktIfExists(startNodeId: number, endNodeId: number, ignoreHazards = false): Promise<string | null> {
    // Build a pgr_dijkstra input that treats the edges as undirected by
    // including both orientations. We synthesize unique ids (id*2, id*2+1)
    // so we can map back to the original edges when assembling geometry.
    const edgeSelection = ignoreHazards
      ? `SELECT (id * 2) AS id, source_id AS source, target_id AS target, cost FROM edges
         UNION ALL
         SELECT (id * 2 + 1) AS id, target_id AS source, source_id AS target, cost FROM edges`
      : `SELECT (id * 2) AS id, source_id AS source, target_id AS target, cost FROM edges
         WHERE source_id NOT IN (SELECT COALESCE(node_id, -1) FROM hazards WHERE status <> 'CLEARED')
           AND target_id NOT IN (SELECT COALESCE(node_id, -1) FROM hazards WHERE status <> 'CLEARED')
         UNION ALL
         SELECT (id * 2 + 1) AS id, target_id AS source, source_id AS target, cost FROM edges
         WHERE source_id NOT IN (SELECT COALESCE(node_id, -1) FROM hazards WHERE status <> 'CLEARED')
           AND target_id NOT IN (SELECT COALESCE(node_id, -1) FROM hazards WHERE status <> 'CLEARED')`;

    const pathQuery = `
      WITH route AS (
        SELECT * FROM pgr_dijkstra(
          $$
            ${edgeSelection}
          $$,
          $1::integer,
          $2::integer,
          false
        )
      )
      SELECT ST_AsText(ST_LineMerge(ST_Collect(e.geometry ORDER BY r.seq))) AS path_wkt
      FROM route r
      JOIN edges e ON e.id = (CASE WHEN r.edge % 2 = 0 THEN (r.edge / 2) ELSE ((r.edge - 1) / 2) END)
      WHERE r.edge <> -1;
    `;

    try {
      const res = await this.dataSource.query(pathQuery, [startNodeId, endNodeId]);
      if (!res || res.length === 0 || !res[0].path_wkt) return null;
      return res[0].path_wkt;
    } catch (err) {
      console.warn('getPathWktIfExists query failed', err && err.message ? err.message : err);
      return null;
    }
  }

  /**
   * Helper: saves a route when pathWkt is already computed. Returns inserted id.
   */
  async saveRouteFromWkt(pathWkt: string, startNodeId: number, endNodeId: number, assignedTo?: number): Promise<number | null> {
    if (!pathWkt) return null;
    const assigned = assignedTo === undefined ? null : assignedTo;
    const insertSql = `
      INSERT INTO evacuation_route (path, assigned_to, distance, start_node_id, end_node_id)
      VALUES (ST_GeomFromText($1, 3857), $2, ST_Length(ST_GeomFromText($1,3857)), $3, $4)
      RETURNING id;
    `;
    try {
      const insertRes = await this.dataSource.query(insertSql, [pathWkt, assigned, startNodeId, endNodeId]);
      const insertedId = insertRes && insertRes[0] ? insertRes[0].id : null;
      if (insertedId) {
        // Emit per-route update so clients can refresh immediately
        try {
          const geojson = await this.getRouteAsGeoJSON(insertedId);
          const globalAny: any = global as any;
          const io = globalAny.__io || (globalAny.__appInstance && globalAny.__appInstance.get ? globalAny.__appInstance.get('io') : null);
          if (io && typeof io.emit === 'function') io.emit('evacuationRoute.updated', { id: insertedId, geojson });
        } catch (e) {
          console.warn('Failed to emit evacuationRoute.updated after save', e);
        }
      }
      return insertedId;
    } catch (err) {
      console.warn('saveRouteFromWkt failed', err && err.message ? err.message : err);
      return null;
    }
  }

  /**
   * Fetches a computed path and formats it as a GeoJSON FeatureCollection.
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
                'startNodeId', start_node_id, -- Matches required format
                'endNodeId', end_node_id,   -- Matches required format
                'createdAt', created_at     -- Matches required format
              )
            )
          )
      ) AS geojson
      FROM evacuation_route
      WHERE id = $1;
    `;

    const result = await this.dataSource.query(query, [routeId]);

    if (!result || result.length === 0 || !result[0].geojson) {
      throw new NotFoundException(`Could not generate GeoJSON for route ID ${routeId}.`);
    }

    return result[0].geojson;
  }

  /**
   * Deletes an evacuation route.
   */
  async remove(id: number): Promise<void> {
    const result = await this.routeRepo.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`EvacuationRoute with ID ${id} not found.`);
    }
  }

  /**
   * Rebuilds all evacuation routes by computing shortest path for every node pair.
   * This deletes existing routes and attempts to compute new ones.
   */
  async rebuildAllRoutes(ignoreHazards = true): Promise<{ computed: number; skipped: number }> {
    // fetch nodes
    const rows: Array<{ id: number }> = await this.dataSource.query('SELECT id FROM nodes');
    const ids = (rows || []).map(r => r.id).filter(Boolean);

    // delete existing routes
    await this.dataSource.query('DELETE FROM evacuation_route');

    let computed = 0;
    let skipped = 0;

    // naive pairwise computation (i<j)
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = ids[i];
        const b = ids[j];
        try {
          // Use helper that does not throw on missing path
          const pathWkt = await this.getPathWktIfExists(a, b, ignoreHazards);
          if (!pathWkt) {
            skipped++;
            continue;
          }

          const insertedId = await this.saveRouteFromWkt(pathWkt, a, b);
          if (insertedId) {
            computed++;
          } else {
            skipped++;
          }
        } catch (e) {
          // skip if no path or other error for this pair
          skipped++;
          // continue to next pair
        }
      }
    }

    return { computed, skipped };
  }
}