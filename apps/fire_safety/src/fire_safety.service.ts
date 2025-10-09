import { Injectable, NotFoundException } from '@nestjs/common';
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
    
    // This complex query does three things:
    // 1. Calls pgr_dijkstra to find the sequence of edges.
    // 2. Joins the results back to the edges table to get their geometries.
    // 3. Aggregates the edge geometries into a single LineString for the complete path.
    const pathQuery = `
      WITH path_edges AS (
        SELECT e.geometry
        FROM pgr_dijkstra(
          'SELECT id, source_id AS source, target_id AS target, cost FROM edges',
          $1,
          $2,
          false
        ) AS route
        JOIN edges e ON route.edge = e.id
        ORDER BY route.seq
      )
      SELECT ST_AsText(ST_LineMerge(ST_Collect(geometry))) AS path_wkt
      FROM path_edges;
    `;

    const result = await this.dataSource.query(pathQuery, [startNodeId, endNodeId]);

    if (!result || result.length === 0 || !result[0].path_wkt) {
      throw new NotFoundException(
        `No path found between node ${startNodeId} and ${endNodeId}.`,
      );
    }

    const pathWkt = result[0].path_wkt;

    // Create and save the new route entity with foreign key relations.
    const newRoute = this.routeRepo.create({
      startNode: { id: startNodeId },
      endNode: { id: endNodeId },
      assignedTo,
    });
    
    const savedRoute = await this.routeRepo.save(newRoute);

    // After saving, update the record with the geometry from WKT.
    // This is a reliable way to ensure PostGIS handles the WKT conversion.
    await this.dataSource.query(
      `UPDATE "evacuation_route" SET "path" = ST_GeomFromText($1, 3857) WHERE "id" = $2`,
      [pathWkt, savedRoute.id],
    );
    
    // Return the computed path as a GeoJSON Feature
    return this.getRouteAsGeoJSON(savedRoute.id);
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
                  'geometry', ST_AsGeoJSON(path)::json,
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
}