import { Controller, Get, Post, Patch, Delete, UseGuards, Param, ParseIntPipe, Body } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { building, floor, apartment, Society, room, nodes, edges, Opening, OpeningRoom, camera } from '@app/entities';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { Public } from '../decorators/public.decorator';

@Controller('buildings')
@UseGuards(JwtAuthGuard)
export class BuildingController {
  constructor(
    @InjectRepository(building) private buildingRepo: Repository<building>,
    @InjectRepository(floor) private floorRepo: Repository<floor>,
    @InjectRepository(apartment) private apartmentRepo: Repository<apartment>,
    @InjectRepository(Society) private societyRepo: Repository<Society>,
    @InjectRepository(room) private roomRepo: Repository<room>,
    @InjectRepository(nodes) private nodesRepo: Repository<nodes>,
    @InjectRepository(edges) private edgesRepo: Repository<edges>,
    @InjectRepository(Opening) private openingRepo: Repository<Opening>,
    @InjectRepository(OpeningRoom) private openingRoomRepo: Repository<OpeningRoom>,
    @InjectRepository(camera) private cameraRepo: Repository<camera>,
    private dataSource: DataSource,
  ) {}

  @Get()
  @Public()
  findAll() {
    return this.buildingRepo.find({ order: { created_at: 'DESC' } });
  }

  @Get('stats')
  @Public()
  async getStats() {
    const [totalBuildings, totalFloors, totalApartments] = await Promise.all([
      this.buildingRepo.count(),
      this.floorRepo.count(),
      this.apartmentRepo.count(),
    ]);
    return { totalBuildings, totalFloors, totalApartments };
  }

  @Get('with-status')
  @Public()
  async findAllWithStatus() {
    const buildings = await this.buildingRepo.find({
      order: { created_at: 'DESC' },
    });
    return buildings.map(b => ({
      id: b.id,
      name: b.name,
      address: b.address,
      type: b.type,
      total_floors: b.totalFloors || 1,
      apartments_per_floor: b.apartmentsPerFloor || 1,
      has_floor_plan: b.hasFloorPlan || false,
      floor_plan_updated_at: b.floorPlanUpdatedAt,
      created_at: b.created_at,
    }));
  }

  @Get(':id')
  @Public()
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.buildingRepo.findOne({ where: { id } });
  }

  @Get(':id/full')
  @Public()
  async getFullDetails(@Param('id', ParseIntPipe) buildingId: number) {
    const buildingData = await this.buildingRepo.findOne({ where: { id: buildingId } });
    if (!buildingData) {
      return { error: 'Building not found' };
    }

    // Get floors with apartments
    const floors = await this.floorRepo.find({
      where: { building_id: buildingId },
      order: { level: 'ASC' },
    });

    const floorsWithApartments = await Promise.all(
      floors.map(async (floorData) => {
        const apartments = await this.apartmentRepo.find({
          where: { floor_id: floorData.id },
          order: { unit_number: 'ASC' },
        });
        return {
          id: floorData.id,
          name: floorData.name,
          level: floorData.level,
          apartments: apartments.map(apt => ({
            id: apt.id,
            unit_number: apt.unit_number,
            occupied: apt.occupied,
          })),
        };
      })
    );

    return {
      id: buildingData.id,
      name: buildingData.name,
      address: buildingData.address,
      type: buildingData.type,
      total_floors: buildingData.totalFloors || 1,
      apartments_per_floor: buildingData.apartmentsPerFloor || 1,
      has_floor_plan: buildingData.hasFloorPlan || false,
      floor_plan_updated_at: buildingData.floorPlanUpdatedAt,
      scale_pixels_per_meter: buildingData.scalePixelsPerMeter,
      center_lat: buildingData.centerLat,
      center_lng: buildingData.centerLng,
      floors: floorsWithApartments,
    };
  }

  @Get(':id/floors')
  @Public()
  getFloors(@Param('id', ParseIntPipe) id: number) {
    return this.floorRepo.find({ where: { building_id: id }, order: { level: 'ASC' } });
  }

  @Get(':id/apartments')
  @Public()
  getApartments(@Param('id', ParseIntPipe) buildingId: number) {
    return this.apartmentRepo.find({ order: { unit_number: 'ASC' } });
  }

  @Get(':id/rooms')
  @Public()
  async getRooms(@Param('id', ParseIntPipe) buildingId: number) {
    // Get all floors for this building, then get rooms for those floors
    const floors = await this.floorRepo.find({ where: { building_id: buildingId } });
    const floorIds = floors.map(f => f.id);

    if (floorIds.length === 0) return [];

    return this.roomRepo
      .createQueryBuilder('room')
      .leftJoinAndSelect('room.floor', 'floor')
      .where('room.floor_id IN (:...floorIds)', { floorIds })
      .orderBy('floor.level', 'ASC')
      .addOrderBy('room.name', 'ASC')
      .getMany();
  }

  @Get(':id/floor-plan')
  @Public()
  async getFloorPlan(@Param('id', ParseIntPipe) buildingId: number) {
    // Get building
    const buildingData = await this.buildingRepo.findOne({ where: { id: buildingId } });
    if (!buildingData) {
      return { error: 'Building not found' };
    }

    // Get floors
    const floors = await this.floorRepo.find({
      where: { building_id: buildingId },
      order: { level: 'ASC' }
    });
    const floorIds = floors.map(f => f.id);

    if (floorIds.length === 0) {
      return {
        type: 'FeatureCollection',
        properties: {
          building_id: buildingId,
          building_name: buildingData.name,
          center_lat: buildingData.centerLat,
          center_lng: buildingData.centerLng,
          scale_pixels_per_meter: buildingData.scalePixelsPerMeter,
          levels: [],
          generated_at: new Date().toISOString(),
        },
        features: [],
      };
    }

    // Get rooms with geometry as GeoJSON (including new fields)
    const roomsRaw = await this.dataSource.query(`
      SELECT
        r.id, r.name, r.type, r.floor_id, r.color, r.area_sqm, r.capacity,
        f.level as floor_level,
        ST_AsGeoJSON(ST_Transform(r.geometry, 4326))::json as geometry,
        ST_Y(ST_Transform(r.centroid, 4326)) as centroid_lat,
        ST_X(ST_Transform(r.centroid, 4326)) as centroid_lng
      FROM room r
      JOIN floor f ON r.floor_id = f.id
      WHERE r.floor_id = ANY($1)
      ORDER BY f.level, r.name
    `, [floorIds]);

    // Get openings with geometry as GeoJSON and connected rooms
    const openingsRaw = await this.dataSource.query(`
      SELECT
        o.id, o.name, o.opening_type, o.floor_id, o.color, o.width_meters, o.is_emergency_exit, o.capacity,
        f.level as floor_level,
        ST_AsGeoJSON(ST_Transform(o.geometry, 4326))::json as geometry,
        COALESCE(
          (SELECT json_agg(or2.room_id) FROM opening_rooms or2 WHERE or2.opening_id = o.id),
          '[]'::json
        ) as connected_room_ids
      FROM opening o
      JOIN floor f ON o.floor_id = f.id
      WHERE o.floor_id = ANY($1)
      ORDER BY f.level, o.name
    `, [floorIds]);

    // Get nodes with geometry as GeoJSON
    const nodesRaw = await this.dataSource.query(`
      SELECT
        n.id, n.type, n.floor_id, n.room_id, n.node_category, n.is_accessible, n.description,
        f.level as floor_level,
        ST_AsGeoJSON(ST_Transform(n.geometry, 4326))::json as geometry
      FROM nodes n
      JOIN floor f ON n.floor_id = f.id
      WHERE n.floor_id = ANY($1)
      ORDER BY f.level, n.id
    `, [floorIds]);

    // Get edges with geometry as GeoJSON
    const edgesRaw = await this.dataSource.query(`
      SELECT
        e.id, e.source_id, e.target_id, e.edge_type, e.cost, e.is_emergency_route, e.width_meters,
        f.level as floor_level,
        ST_AsGeoJSON(ST_Transform(e.geometry, 4326))::json as geometry
      FROM edges e
      JOIN nodes n ON e.source_id = n.id
      JOIN floor f ON n.floor_id = f.id
      WHERE n.floor_id = ANY($1)
    `, [floorIds]);

    // Get cameras with geometry as GeoJSON
    const camerasRaw = await this.dataSource.query(`
      SELECT
        c.id, c.name, c.camera_id, c.rtsp_url, c.status, c.location_description,
        c.is_fire_detection_enabled, c.floor_id, c.room_id,
        f.level as floor_level,
        ST_AsGeoJSON(ST_Transform(c.geometry, 4326))::json as geometry
      FROM camera c
      JOIN floor f ON c.floor_id = f.id
      WHERE c.floor_id = ANY($1)
      ORDER BY f.level, c.name
    `, [floorIds]);

    // Build GeoJSON FeatureCollection
    const features = [];

    // Add rooms as Polygon features
    for (const r of roomsRaw) {
      if (r.geometry) {
        features.push({
          type: 'Feature',
          properties: {
            id: String(r.id),
            db_id: r.id,
            level: String(r.floor_level),
            name: r.name,
            room_type: r.type,
            color: r.color,
            area_sqm: r.area_sqm ? parseFloat(r.area_sqm) : null,
            capacity: r.capacity,
            centroid_lat: r.centroid_lat ? parseFloat(r.centroid_lat) : null,
            centroid_lng: r.centroid_lng ? parseFloat(r.centroid_lng) : null,
            floor_id: r.floor_id,
          },
          geometry: r.geometry,
        });
      }
    }

    // Add openings as LineString features
    for (const o of openingsRaw) {
      if (o.geometry) {
        features.push({
          type: 'Feature',
          properties: {
            id: String(o.id),
            db_id: o.id,
            level: String(o.floor_level),
            type: 'opening',
            opening_type: o.opening_type,
            name: o.name,
            color: o.color,
            width_meters: o.width_meters ? parseFloat(o.width_meters) : null,
            is_emergency_exit: o.is_emergency_exit,
            capacity: o.capacity,
            connects_rooms: o.connected_room_ids || [],
            floor_id: o.floor_id,
          },
          geometry: o.geometry,
        });
      }
    }

    // Add nodes as Point features
    for (const n of nodesRaw) {
      if (n.geometry) {
        features.push({
          type: 'Feature',
          properties: {
            id: String(n.id),
            db_id: n.id,
            type: 'node',
            node_type: n.type,
            node_category: n.node_category,
            is_accessible: n.is_accessible,
            description: n.description,
            level: String(n.floor_level),
            floor_id: n.floor_id,
            room_id: n.room_id,
          },
          geometry: n.geometry,
        });
      }
    }

    // Add edges as LineString features
    for (const e of edgesRaw) {
      if (e.geometry) {
        features.push({
          type: 'Feature',
          properties: {
            id: String(e.id),
            db_id: e.id,
            type: 'edge',
            edge_type: e.edge_type,
            source_id: e.source_id,
            target_id: e.target_id,
            cost: e.cost,
            is_emergency_route: e.is_emergency_route,
            width_meters: e.width_meters ? parseFloat(e.width_meters) : null,
            level: String(e.floor_level),
          },
          geometry: e.geometry,
        });
      }
    }

    // Add cameras as Point features
    for (const c of camerasRaw) {
      if (c.geometry) {
        features.push({
          type: 'Feature',
          properties: {
            id: String(c.id),
            db_id: c.id,
            type: 'camera',
            is_camera: true,
            name: c.name,
            camera_id: c.camera_id,
            rtsp_url: c.rtsp_url,
            status: c.status,
            location_description: c.location_description,
            is_fire_detection_enabled: c.is_fire_detection_enabled,
            level: String(c.floor_level),
            floor_id: c.floor_id,
            room_id: c.room_id,
          },
          geometry: c.geometry,
        });
      }
    }

    return {
      type: 'FeatureCollection',
      properties: {
        building_id: buildingId,
        building_name: buildingData.name,
        center_lat: buildingData.centerLat ? parseFloat(String(buildingData.centerLat)) : null,
        center_lng: buildingData.centerLng ? parseFloat(String(buildingData.centerLng)) : null,
        scale_pixels_per_meter: buildingData.scalePixelsPerMeter ? parseFloat(String(buildingData.scalePixelsPerMeter)) : null,
        levels: floors.map(f => String(f.level)),
        generated_at: new Date().toISOString(),
      },
      features,
      // Include floor plan image and editor state for restoration
      floorPlanImage: buildingData.floorPlanImage || null,
      editorState: buildingData.editorState || null,
    };
  }

  // Get just the editor state (lighter endpoint for loading)
  @Get(':id/editor-state')
  @Public()
  async getEditorState(@Param('id', ParseIntPipe) buildingId: number) {
    const buildingData = await this.buildingRepo.findOne({ where: { id: buildingId } });
    if (!buildingData) {
      return { error: 'Building not found' };
    }

    return {
      buildingId,
      buildingName: buildingData.name,
      hasFloorPlan: buildingData.hasFloorPlan,
      floorPlanUpdatedAt: buildingData.floorPlanUpdatedAt,
      centerLat: buildingData.centerLat ? parseFloat(String(buildingData.centerLat)) : null,
      centerLng: buildingData.centerLng ? parseFloat(String(buildingData.centerLng)) : null,
      scalePixelsPerMeter: buildingData.scalePixelsPerMeter ? parseFloat(String(buildingData.scalePixelsPerMeter)) : null,
      floorPlanImage: buildingData.floorPlanImage || null,
      editorState: buildingData.editorState || null,
    };
  }

  @Post(':id/import-floor-plan')
  @Public()
  async importFloorPlan(
    @Param('id', ParseIntPipe) buildingId: number,
    @Body() body: {
      // New differential format
      differential?: {
        isFirstSave: boolean;
        changes: {
          rooms: { added: any[]; modified: any[]; deleted: string[] };
          openings: { added: any[]; modified: any[]; deleted: string[] };
          cameras: { added: any[]; modified: any[]; deleted: string[] };
          safePoints: { added: any[]; modified: any[]; deleted: string[] };
        };
        routingGraph: { nodes: any[]; edges: any[] };
        properties: {
          building_name?: string;
          levels?: string[];
          scale_pixels_per_meter?: number;
          center_lat?: number;
          center_lng?: number;
        };
      };
      // Legacy full import format
      geojson?: {
        type: string;
        properties?: {
          building_name?: string;
          levels?: string[];
          scale_pixels_per_meter?: number;
          center_lat?: number;
          center_lng?: number;
        };
        features: Array<{
          type: string;
          properties: Record<string, any>;
          geometry: { type: string; coordinates: any };
        }>;
      };
      floorPlanImage?: string;
      editorState?: any;
    },
  ) {
    const buildingData = await this.buildingRepo.findOne({ where: { id: buildingId } });
    if (!buildingData) {
      return { success: false, error: 'Building not found' };
    }

    const floorPlanImage = body.floorPlanImage;
    const editorState = body.editorState;

    // Check if this is a differential save
    if ((body as any).differential) {
      console.log('[ImportFloorPlan] Differential save detected');
      return this.handleDifferentialSave(buildingId, (body as any).differential, floorPlanImage, editorState);
    }

    // Legacy full import mode
    const geojson = body.geojson;

    // Validate geojson exists and has features
    if (!geojson || !geojson.features || !Array.isArray(geojson.features)) {
      console.log('[ImportFloorPlan] Invalid request body:', Object.keys(body));
      return {
        success: false,
        error: 'Invalid request: Expected either differential save data or geojson with features array'
      };
    }

    const imported = {
      floors: 0,
      rooms: 0,
      openings: 0,
      opening_room_connections: 0,
      nodes: 0,
      edges: 0,
      cameras: 0,
    };
    const warnings: string[] = [];
    const floorMap: Record<string, number> = {}; // level -> floor_id
    const roomMap: Record<string, number> = {}; // geojson_id -> db_id

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Step 0: Update building properties if provided
      if (geojson.properties) {
        const updates: any = {};
        if (geojson.properties.scale_pixels_per_meter !== undefined) {
          updates.scalePixelsPerMeter = geojson.properties.scale_pixels_per_meter;
        }
        if (geojson.properties.center_lat !== undefined) {
          updates.centerLat = geojson.properties.center_lat;
        }
        if (geojson.properties.center_lng !== undefined) {
          updates.centerLng = geojson.properties.center_lng;
        }
        if (Object.keys(updates).length > 0) {
          await queryRunner.manager.update('building', buildingId, updates);
        }
      }

      // Step 1: Create/update floors based on levels
      const levels = geojson.properties?.levels || [];
      for (const level of levels) {
        let floorRecord = await this.floorRepo.findOne({
          where: { building_id: buildingId, level: parseInt(level) || 0 },
        });

        if (!floorRecord) {
          floorRecord = this.floorRepo.create({
            name: `Floor ${level}`,
            level: parseInt(level) || 0,
            building_id: buildingId,
          });
          floorRecord = await queryRunner.manager.save(floorRecord);
          imported.floors++;
        }
        floorMap[level] = floorRecord.id;
      }

      // Step 2: Clear ALL existing data for this building (to allow clean re-import)
      const allBuildingFloors = await this.floorRepo.find({ where: { building_id: buildingId } });
      const allFloorIds = allBuildingFloors.map(f => f.id);

      console.log(`[ImportFloorPlan] Legacy mode: Clearing existing data for building ${buildingId}`);

      if (allFloorIds.length > 0) {
        // Delete safe_points BEFORE nodes (safe_points reference nodes via node_id)
        await queryRunner.query(`DELETE FROM safe_points WHERE node_id IN (SELECT id FROM nodes WHERE floor_id = ANY($1))`, [allFloorIds]);
        await queryRunner.query(`DELETE FROM trapped_occupants WHERE node_id IN (SELECT id FROM nodes WHERE floor_id = ANY($1))`, [allFloorIds]);
        await queryRunner.query(`DELETE FROM evacuation_route WHERE start_node_id IN (SELECT id FROM nodes WHERE floor_id = ANY($1)) OR end_node_id IN (SELECT id FROM nodes WHERE floor_id = ANY($1))`, [allFloorIds]);
        await queryRunner.query(`DELETE FROM edges WHERE source_id IN (SELECT id FROM nodes WHERE floor_id = ANY($1)) OR target_id IN (SELECT id FROM nodes WHERE floor_id = ANY($1))`, [allFloorIds]);
        await queryRunner.query(`DELETE FROM nodes WHERE floor_id = ANY($1)`, [allFloorIds]);
        await queryRunner.query(`DELETE FROM opening_rooms WHERE opening_id IN (SELECT id FROM opening WHERE floor_id = ANY($1))`, [allFloorIds]);
        await queryRunner.query(`DELETE FROM opening WHERE floor_id = ANY($1)`, [allFloorIds]);
        await queryRunner.query(`DELETE FROM room WHERE floor_id = ANY($1)`, [allFloorIds]);
        await queryRunner.query(`DELETE FROM camera WHERE floor_id = ANY($1)`, [allFloorIds]);
      }

      // Step 3: First pass - import rooms (need to process before openings for room connections)
      for (const feature of geojson.features) {
        const props = feature.properties;
        const geom = feature.geometry;

        if (!geom || !geom.coordinates) {
          warnings.push(`Skipping feature without geometry: ${props?.id || 'unknown'}`);
          continue;
        }

        // Skip openings in first pass
        if (props.type === 'opening' || props.opening_type) {
          continue;
        }

        const level = props.level || '1';
        let floorId = floorMap[level];

        // Create floor if not exists
        if (!floorId) {
          let floorRecord = await this.floorRepo.findOne({
            where: { building_id: buildingId, level: parseInt(level) || 0 },
          });
          if (!floorRecord) {
            floorRecord = this.floorRepo.create({
              name: `Floor ${level}`,
              level: parseInt(level) || 0,
              building_id: buildingId,
            });
            floorRecord = await queryRunner.manager.save(floorRecord);
            imported.floors++;
          }
          floorMap[level] = floorRecord.id;
          floorId = floorRecord.id;
        }

        const geomJson = JSON.stringify(geom);

        // Check if this is a room (Polygon with room_type or no specific type)
        if (props.room_type || (geom.type === 'Polygon' && props.type !== 'opening')) {
          try {
            // Map room types from frontend to database enum
            const roomTypeMap: Record<string, string> = {
              'common': 'other',
              'living': 'living_room',
              'dining': 'dining_room',
              'bathroom': 'bathroom',
              'kitchen': 'kitchen',
              'bedroom': 'bedroom',
              'storage': 'storage',
              'utility': 'utility',
              'hallway': 'hallway',
              'lobby': 'lobby',
              'stairwell': 'stairwell',
              'office': 'office',
            };
            const roomType = roomTypeMap[props.room_type] || props.room_type || 'other';

            // Build centroid geometry if lat/lng provided
            let centroidSql = 'NULL';
            if (props.centroid_lat && props.centroid_lng) {
              centroidSql = `ST_Transform(ST_SetSRID(ST_MakePoint($5, $6), 4326), 3857)`;
            }

            const query = `
              INSERT INTO room (name, type, floor_id, geometry, area_sqm, color, centroid, created_at, updated_at)
              VALUES (
                $1, $2, $3,
                ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($4), 4326), 3857),
                $7, $8,
                ${props.centroid_lat && props.centroid_lng ? 'ST_Transform(ST_SetSRID(ST_MakePoint($5, $6), 4326), 3857)' : 'NULL'},
                NOW(), NOW()
              )
              RETURNING id
            `;

            const params = props.centroid_lat && props.centroid_lng
              ? [
                  props.name || 'Unnamed Room',
                  roomType,
                  floorId,
                  geomJson,
                  props.centroid_lng,  // Note: MakePoint takes (lng, lat)
                  props.centroid_lat,
                  props.area_sqm || null,
                  props.color || null,
                ]
              : [
                  props.name || 'Unnamed Room',
                  roomType,
                  floorId,
                  geomJson,
                  null, // placeholder for centroid_lng
                  null, // placeholder for centroid_lat
                  props.area_sqm || null,
                  props.color || null,
                ];

            // Use simpler query without centroid placeholders when not needed
            const simpleQuery = `
              INSERT INTO room (name, type, floor_id, geometry, area_sqm, color, created_at, updated_at)
              VALUES (
                $1, $2, $3,
                ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($4), 4326), 3857),
                $5, $6,
                NOW(), NOW()
              )
              RETURNING id
            `;

            const result = await queryRunner.query(
              props.centroid_lat && props.centroid_lng ? query : simpleQuery,
              props.centroid_lat && props.centroid_lng
                ? params
                : [
                    props.name || 'Unnamed Room',
                    roomType,
                    floorId,
                    geomJson,
                    props.area_sqm || null,
                    props.color || null,
                  ]
            );

            // Store mapping of geojson id to database id
            roomMap[props.id] = result[0].id;
            imported.rooms++;
          } catch (err) {
            warnings.push(`Failed to import room ${props.name || props.id}: ${err.message}`);
          }
        }
      }

      // Step 4: Second pass - import openings with room connections
      for (const feature of geojson.features) {
        const props = feature.properties;
        const geom = feature.geometry;

        if (!geom || !geom.coordinates) continue;

        // Only process openings in second pass
        if (!(props.type === 'opening' || props.opening_type)) {
          continue;
        }

        const level = props.level || '1';
        const floorId = floorMap[level];

        if (!floorId) {
          warnings.push(`Skipping opening ${props.id}: floor level ${level} not found`);
          continue;
        }

        const geomJson = JSON.stringify(geom);

        try {
          // Insert opening
          const isEmergencyExit = props.opening_type === 'emergency_exit' || props.is_emergency_exit === true;

          const openingResult = await queryRunner.query(`
            INSERT INTO opening (
              floor_id, opening_type, geometry, name, color, width_meters,
              is_emergency_exit, created_at, updated_at
            )
            VALUES (
              $1, $2,
              ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($3), 4326), 3857),
              $4, $5, $6, $7, NOW(), NOW()
            )
            RETURNING id
          `, [
            floorId,
            props.opening_type || 'door',
            geomJson,
            props.name || null,
            props.color || null,
            props.width_meters || null,
            isEmergencyExit,
          ]);

          const openingId = openingResult[0].id;
          imported.openings++;

          // Create room connections via junction table
          if (props.connects_rooms && Array.isArray(props.connects_rooms)) {
            for (const roomGeoJsonId of props.connects_rooms) {
              const roomDbId = roomMap[roomGeoJsonId];
              if (roomDbId) {
                try {
                  await queryRunner.query(`
                    INSERT INTO opening_rooms (opening_id, room_id, created_at)
                    VALUES ($1, $2, NOW())
                  `, [openingId, roomDbId]);
                  imported.opening_room_connections++;
                } catch (err) {
                  warnings.push(`Failed to connect opening ${props.id} to room ${roomGeoJsonId}: ${err.message}`);
                }
              } else {
                warnings.push(`Opening ${props.id}: connected room ${roomGeoJsonId} not found in imported rooms`);
              }
            }
          }
        } catch (err) {
          warnings.push(`Failed to import opening ${props.id}: ${err.message}`);
        }
      }

      // Step 5: Third pass - import nodes (routing graph vertices)
      const nodeMap: Record<string, number> = {}; // geojson_id -> db_id
      for (const feature of geojson.features) {
        const props = feature.properties;
        const geom = feature.geometry;

        if (!geom || !geom.coordinates) continue;

        // Only process nodes (accept both props.type and props.feature_type)
        const featureType = props.type || props.feature_type;
        if (featureType !== 'node') continue;

        // Get feature ID (from feature.id or props.id)
        const featureId = (feature as any).id || props.id;

        const level = props.level || '1';
        const floorId = floorMap[level];

        if (!floorId) {
          warnings.push(`Skipping node ${featureId}: floor level ${level} not found`);
          continue;
        }

        const geomJson = JSON.stringify(geom);

        try {
          // Resolve room_id from roomMap if provided
          const roomDbId = props.room_id ? roomMap[props.room_id] || null : null;

          // Map node_type to allowed database values
          // Allowed: room, corridor, staircase, elevator, exit, entrance, junction, door, window, other
          const nodeTypeMap: Record<string, string> = {
            'room_centroid': 'room',
            'centroid': 'room',
            'opening_midpoint': 'door',
            'door': 'door',
            'waypoint': 'junction',
            'junction': 'junction',
            'exit': 'exit',
            'entrance': 'entrance',
            'staircase': 'staircase',
            'elevator': 'elevator',
            'corridor': 'corridor',
            'window': 'window',
          };
          const nodeType = nodeTypeMap[props.node_type] || 'other';

          const nodeResult = await queryRunner.query(`
            INSERT INTO nodes (
              floor_id, room_id, type, node_category, is_accessible, description, geometry,
              created_at, updated_at
            )
            VALUES (
              $1, $2, $3, $4, $5, $6,
              ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($7), 4326), 3857),
              NOW(), NOW()
            )
            RETURNING id
          `, [
            floorId,
            roomDbId,
            nodeType,
            props.node_category || null,
            props.is_accessible !== false, // default true
            props.description || null,
            geomJson,
          ]);

          // Store mapping of geojson id to database id
          if (featureId) {
            nodeMap[featureId] = nodeResult[0].id;
          }
          imported.nodes++;
        } catch (err) {
          warnings.push(`Failed to import node ${featureId}: ${err.message}`);
        }
      }

      // Step 6: Fourth pass - import edges (routing graph connections)
      for (const feature of geojson.features) {
        const props = feature.properties;
        const geom = feature.geometry;
        const edgeFeatureId = (feature as any).id || props.id;

        if (!geom || !geom.coordinates) continue;

        // Only process edges (accept both props.type and props.feature_type)
        const edgeType = props.type || props.feature_type;
        if (edgeType !== 'edge') continue;

        const geomJson = JSON.stringify(geom);

        try {
          // Resolve source and target node IDs from nodeMap
          // Accept both props.source/props.target and props.source_id/props.target_id
          const sourceNodeId = props.source_id || props.source;
          const targetNodeId = props.target_id || props.target;
          const sourceDbId = nodeMap[sourceNodeId];
          const targetDbId = nodeMap[targetNodeId];

          if (!sourceDbId) {
            warnings.push(`Edge ${edgeFeatureId}: source node ${sourceNodeId} not found in imported nodes`);
            continue;
          }
          if (!targetDbId) {
            warnings.push(`Edge ${edgeFeatureId}: target node ${targetNodeId} not found in imported nodes`);
            continue;
          }

          // Map edge_type to allowed database values
          // Allowed: corridor, door, staircase, elevator, ramp, ladder, emergency_exit, other
          const edgeTypeMap: Record<string, string> = {
            'room_to_door': 'door',
            'door_to_corridor': 'corridor',
            'door_to_room': 'door',
            'corridor': 'corridor',
            'door': 'door',
            'staircase': 'staircase',
            'stairs': 'staircase',
            'elevator': 'elevator',
            'ramp': 'ramp',
            'ladder': 'ladder',
            'emergency_exit': 'emergency_exit',
            'exit': 'emergency_exit',
          };
          const mappedEdgeType = edgeTypeMap[props.edge_type] || 'other';

          await queryRunner.query(`
            INSERT INTO edges (
              source_id, target_id, edge_type, cost, is_emergency_route, width_meters, geometry,
              created_at, updated_at
            )
            VALUES (
              $1, $2, $3, $4, $5, $6,
              ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($7), 4326), 3857),
              NOW(), NOW()
            )
          `, [
            sourceDbId,
            targetDbId,
            mappedEdgeType,
            Math.round(props.cost || 1),  // Cast to integer for database
            props.is_emergency_route === true,
            props.width_meters || null,
            geomJson,
          ]);

          imported.edges++;
        } catch (err) {
          warnings.push(`Failed to import edge ${edgeFeatureId}: ${err.message}`);
        }
      }

      // Step 7: Fifth pass - import cameras
      const cameraFeatures = geojson.features.filter(f =>
        f.properties?.type === 'camera' || f.properties?.is_camera
      );
      console.log(`[ImportFloorPlan] Found ${cameraFeatures.length} camera features to import`);
      console.log(`[ImportFloorPlan] FloorMap keys:`, Object.keys(floorMap));

      for (const feature of geojson.features) {
        const props = feature.properties;
        const geom = feature.geometry;

        if (!geom || !geom.coordinates) continue;

        // Only process cameras
        if (!(props.type === 'camera' || props.is_camera)) {
          continue;
        }

        console.log(`[ImportFloorPlan] Processing camera: ${props.name || props.id}, level: "${props.level}", floorMap has this level: ${floorMap[props.level] !== undefined}`);

        const level = props.level || '1';
        const floorId = floorMap[level];

        if (!floorId) {
          warnings.push(`Skipping camera ${props.id}: floor level ${level} not found`);
          continue;
        }

        const geomJson = JSON.stringify(geom);

        try {
          // Resolve linked room_id if provided
          const linkedRoomDbId = props.linked_room_id ? roomMap[props.linked_room_id] || null : null;

          // Generate unique camera_id - include building ID and timestamp for uniqueness
          const timestamp = Date.now();
          const cameraId = props.camera_id
            ? `B${buildingId}_${props.camera_id}`
            : `B${buildingId}_CAM${String(imported.cameras + 1).padStart(3, '0')}_${timestamp}`;

          console.log(`[ImportFloorPlan] Inserting camera with ID: ${cameraId}, floorId: ${floorId}`);

          await queryRunner.query(`
            INSERT INTO camera (
              name, camera_id, rtsp_url, building_id, floor_id, room_id,
              status, location_description, is_fire_detection_enabled,
              geometry, created_at, updated_at
            )
            VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9,
              ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($10), 4326), 3857),
              NOW(), NOW()
            )
          `, [
            props.name || `Camera ${imported.cameras + 1}`,
            cameraId,
            props.rtsp_url || '',
            buildingId,
            floorId,
            linkedRoomDbId,
            'active',
            props.location_description || null,
            props.is_fire_detection_enabled !== false,
            geomJson,
          ]);

          imported.cameras++;
          console.log(`[ImportFloorPlan] Successfully imported camera: ${cameraId}`);
        } catch (err) {
          console.error(`[ImportFloorPlan] Failed to import camera ${props.id}:`, err.message);
          warnings.push(`Failed to import camera ${props.id}: ${err.message}`);
        }
      }

      console.log(`[ImportFloorPlan] Total cameras imported: ${imported.cameras}`);

      // Mark building as having a floor plan and save image/editor state
      const buildingUpdates: any = {
        hasFloorPlan: true,
        floorPlanUpdatedAt: new Date(),
      };

      // Save floor plan image if provided (Base64 encoded)
      if (floorPlanImage) {
        buildingUpdates.floorPlanImage = floorPlanImage;
        console.log(`[ImportFloorPlan] Saving floor plan image (${Math.round(floorPlanImage.length / 1024)}KB)`);
      }

      // Save editor state if provided (for complete restoration)
      if (editorState) {
        buildingUpdates.editorState = editorState;
        console.log(`[ImportFloorPlan] Saving editor state`);
      }

      await queryRunner.manager.update('building', buildingId, buildingUpdates);

      await queryRunner.commitTransaction();

      return {
        success: true,
        imported,
        warnings: warnings.length > 0 ? warnings : undefined,
        message: `Imported ${imported.rooms} rooms, ${imported.openings} openings (${imported.opening_room_connections} room connections), ${imported.nodes} nodes, ${imported.edges} edges, ${imported.cameras} cameras, ${imported.floors} floors`,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      return {
        success: false,
        error: error.message,
        warnings,
      };
    } finally {
      await queryRunner.release();
    }
  }

  @Post()
  @Public()
  async create(@Body() createDto: {
    name: string;
    address: string;
    type?: string;
    society_id?: number;
    total_floors?: number;
    apartments_per_floor?: number;
  }) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const totalFloors = createDto.total_floors || 1;
      const apartmentsPerFloor = createDto.apartments_per_floor || 1;

      // Step 1: Create building with configuration
      const newBuilding = this.buildingRepo.create({
        name: createDto.name,
        address: createDto.address,
        type: createDto.type || 'residential',
        society_id: createDto.society_id || 1,
        geometry: null,
        totalFloors: totalFloors,
        apartmentsPerFloor: apartmentsPerFloor,
        hasFloorPlan: false,
      });
      const savedBuilding = await queryRunner.manager.save(newBuilding);

      // Step 2: Create floors (without geometry - set during map import)
      for (let level = 1; level <= totalFloors; level++) {
        const floorRecord = this.floorRepo.create({
          name: `Floor ${level}`,
          level: level,
          building_id: savedBuilding.id,
          geometry: null,
        });
        const savedFloor = await queryRunner.manager.save(floorRecord);

        // Step 3: Create apartments for this floor
        for (let apt = 1; apt <= apartmentsPerFloor; apt++) {
          const unitNumber = `${level}${String(apt).padStart(2, '0')}`; // "101", "102"
          const apartmentRecord = this.apartmentRepo.create({
            unit_number: unitNumber,
            floor_id: savedFloor.id,
            occupied: false,
          });
          await queryRunner.manager.save(apartmentRecord);
        }
      }

      await queryRunner.commitTransaction();

      return {
        ...savedBuilding,
        floors_created: totalFloors,
        apartments_created: totalFloors * apartmentsPerFloor,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  @Patch(':id')
  @Public()
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDto: { 
      name?: string; 
      address?: string; 
      type?: string;
      society_id?: number;
    },
  ) {
    await this.buildingRepo.update(id, updateDto);
    return this.buildingRepo.findOne({ where: { id } });
  }

  @Delete(':id')
  @Public()
  async delete(@Param('id', ParseIntPipe) id: number) {
    await this.buildingRepo.delete(id);
    return { message: 'Building deleted successfully' };
  }

  // Handle differential (incremental) floor plan saves
  // Uses db_id (database primary key) for updates/deletes
  // Returns idMappings for newly inserted items so frontend can track them
  private async handleDifferentialSave(
    buildingId: number,
    differential: {
      isFirstSave: boolean;
      changes: {
        rooms: { added: any[]; modified: any[]; deleted: string[] };
        openings: { added: any[]; modified: any[]; deleted: string[] };
        cameras: { added: any[]; modified: any[]; deleted: string[] };
        safePoints: { added: any[]; modified: any[]; deleted: string[] };
      };
      routingGraph: { nodes: any[]; edges: any[] };
      properties: any;
    },
    floorPlanImage?: string,
    editorState?: any,
  ) {
    const stats = {
      rooms: { added: 0, modified: 0, deleted: 0 },
      openings: { added: 0, modified: 0, deleted: 0 },
      cameras: { added: 0, modified: 0, deleted: 0 },
      safePoints: { added: 0, modified: 0, deleted: 0 },
      nodes: 0,
      edges: 0,
    };
    const warnings: string[] = [];
    const floorMap: Record<string, number> = {};
    // ID mappings: frontend_id -> database_id (for newly inserted items)
    const idMappings: {
      rooms: Record<string, number>;
      openings: Record<string, number>;
      cameras: Record<string, number>;
      safePoints: Record<string, number>;
    } = { rooms: {}, openings: {}, cameras: {}, safePoints: {} };

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const { changes } = differential;

      // Check what types of changes we have
      const hasRoutingChanges =
        changes.rooms.added.length > 0 || changes.rooms.modified.length > 0 || changes.rooms.deleted.length > 0 ||
        changes.openings.added.length > 0 || changes.openings.modified.length > 0 || changes.openings.deleted.length > 0;

      const hasSafePointChanges = changes.safePoints &&
        (changes.safePoints.added.length > 0 || changes.safePoints.modified.length > 0 || changes.safePoints.deleted.length > 0);

      const hasCameraChanges =
        changes.cameras.added.length > 0 || changes.cameras.modified.length > 0 || changes.cameras.deleted.length > 0;

      const hasChanges = hasRoutingChanges || hasSafePointChanges || hasCameraChanges;

      console.log(`[DifferentialSave] Building ${buildingId}, hasRoutingChanges: ${hasRoutingChanges}, hasSafePointChanges: ${hasSafePointChanges}`, {
        rooms: { added: changes.rooms.added.length, modified: changes.rooms.modified.length, deleted: changes.rooms.deleted.length },
        openings: { added: changes.openings.added.length, modified: changes.openings.modified.length, deleted: changes.openings.deleted.length },
        cameras: { added: changes.cameras.added.length, modified: changes.cameras.modified.length, deleted: changes.cameras.deleted.length },
        safePoints: changes.safePoints ? { added: changes.safePoints.added.length, modified: changes.safePoints.modified.length, deleted: changes.safePoints.deleted.length } : 'not provided',
      });

      // ==================== UPDATE BUILDING PROPERTIES ====================
      if (differential.properties) {
        const updates: any = {};
        if (differential.properties.scale_pixels_per_meter !== undefined) {
          updates.scalePixelsPerMeter = differential.properties.scale_pixels_per_meter;
        }
        if (differential.properties.center_lat !== undefined) {
          updates.centerLat = differential.properties.center_lat;
        }
        if (differential.properties.center_lng !== undefined) {
          updates.centerLng = differential.properties.center_lng;
        }
        if (Object.keys(updates).length > 0) {
          await queryRunner.query(
            `UPDATE building SET
              scale_pixels_per_meter = COALESCE($2, scale_pixels_per_meter),
              center_lat = COALESCE($3, center_lat),
              center_lng = COALESCE($4, center_lng)
            WHERE id = $1`,
            [buildingId, updates.scalePixelsPerMeter, updates.centerLat, updates.centerLng]
          );
        }
      }

      // ==================== ENSURE FLOORS EXIST (using queryRunner) ====================
      const levels = differential.properties?.levels || [];
      for (const level of levels) {
        const levelNum = parseInt(level) || 0;
        // Check if floor exists using queryRunner (within transaction)
        const existingFloors = await queryRunner.query(
          `SELECT id FROM floor WHERE building_id = $1 AND level = $2`,
          [buildingId, levelNum]
        );

        if (existingFloors.length > 0) {
          floorMap[level] = existingFloors[0].id;
        } else {
          // Create floor within transaction
          const newFloor = await queryRunner.query(
            `INSERT INTO floor (name, level, building_id, created_at, updated_at)
             VALUES ($1, $2, $3, NOW(), NOW()) RETURNING id`,
            [`Floor ${level}`, levelNum, buildingId]
          );
          floorMap[level] = newFloor[0].id;
        }
      }

      // Helper to get floor ID from level (using cached floorMap or query within transaction)
      const getFloorId = async (level: string): Promise<number | null> => {
        if (floorMap[level]) return floorMap[level];
        const levelNum = parseInt(level) || 0;
        const floors = await queryRunner.query(
          `SELECT id FROM floor WHERE building_id = $1 AND level = $2`,
          [buildingId, levelNum]
        );
        if (floors.length > 0) {
          floorMap[level] = floors[0].id;
          return floors[0].id;
        }
        // Create floor if it doesn't exist
        const newFloor = await queryRunner.query(
          `INSERT INTO floor (name, level, building_id, created_at, updated_at)
           VALUES ($1, $2, $3, NOW(), NOW()) RETURNING id`,
          [`Floor ${level}`, levelNum, buildingId]
        );
        floorMap[level] = newFloor[0].id;
        return newFloor[0].id;
      };

      // Map room types
      const roomTypeMap: Record<string, string> = {
        'common': 'other', 'living': 'living_room', 'dining': 'dining_room',
        'bathroom': 'bathroom', 'kitchen': 'kitchen', 'bedroom': 'bedroom',
        'storage': 'storage', 'utility': 'utility', 'hallway': 'hallway',
        'lobby': 'lobby', 'stairwell': 'stairwell', 'office': 'office',
      };

      // ==================== PROCESS ROOM DELETIONS ====================
      for (const dbIdStr of changes.rooms.deleted) {
        const dbId = parseInt(dbIdStr, 10);
        if (isNaN(dbId)) {
          warnings.push(`Invalid room db_id for deletion: ${dbIdStr}`);
          continue;
        }
        const result = await queryRunner.query(
          `DELETE FROM room WHERE id = $1 RETURNING id`,
          [dbId]
        );
        if (result.length > 0) stats.rooms.deleted++;
      }

      // ==================== PROCESS ROOM ADDITIONS ====================
      for (const feature of changes.rooms.added) {
        const props = feature.properties;
        const geom = feature.geometry;
        if (!geom || !geom.coordinates) {
          warnings.push(`Room ${props?.name || props?.id}: missing geometry`);
          continue;
        }
        const level = props.level || '1';
        const floorId = await getFloorId(level);
        if (!floorId) {
          warnings.push(`Room ${props.name}: could not get floor for level ${level}`);
          continue;
        }

        const roomType = roomTypeMap[props.room_type] || props.room_type || 'other';
        const result = await queryRunner.query(`
          INSERT INTO room (name, type, floor_id, geometry, created_at, updated_at)
          VALUES ($1, $2, $3, ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($4), 4326), 3857), NOW(), NOW())
          RETURNING id
        `, [props.name || 'Unnamed Room', roomType, floorId, JSON.stringify(geom)]);

        if (result.length > 0 && props.id) {
          idMappings.rooms[props.id] = result[0].id;
        }
        stats.rooms.added++;
      }

      // ==================== PROCESS ROOM MODIFICATIONS ====================
      for (const feature of changes.rooms.modified) {
        const props = feature.properties;
        const geom = feature.geometry;
        if (!props.db_id) {
          warnings.push(`Room ${props?.name}: missing db_id for modification`);
          continue;
        }
        if (!geom || !geom.coordinates) {
          warnings.push(`Room ${props?.name}: missing geometry for modification`);
          continue;
        }
        const level = props.level || '1';
        const floorId = await getFloorId(level);
        if (!floorId) {
          warnings.push(`Room ${props.name}: could not get floor for level ${level}`);
          continue;
        }

        const roomType = roomTypeMap[props.room_type] || props.room_type || 'other';
        const result = await queryRunner.query(`
          UPDATE room SET name = $1, type = $2, floor_id = $3,
            geometry = ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($4), 4326), 3857),
            updated_at = NOW()
          WHERE id = $5
          RETURNING id
        `, [props.name || 'Unnamed Room', roomType, floorId, JSON.stringify(geom), props.db_id]);
        if (result.length > 0) stats.rooms.modified++;
      }

      // ==================== PROCESS OPENING DELETIONS ====================
      for (const dbIdStr of changes.openings.deleted) {
        const dbId = parseInt(dbIdStr, 10);
        if (isNaN(dbId)) {
          warnings.push(`Invalid opening db_id for deletion: ${dbIdStr}`);
          continue;
        }
        // First delete from junction table
        await queryRunner.query(`DELETE FROM opening_rooms WHERE opening_id = $1`, [dbId]);
        const result = await queryRunner.query(`DELETE FROM opening WHERE id = $1 RETURNING id`, [dbId]);
        if (result.length > 0) stats.openings.deleted++;
      }

      // ==================== PROCESS OPENING ADDITIONS ====================
      for (const feature of changes.openings.added) {
        const props = feature.properties;
        const geom = feature.geometry;
        if (!geom || !geom.coordinates) {
          warnings.push(`Opening ${props?.id}: missing geometry`);
          continue;
        }
        const level = props.level || '1';
        const floorId = await getFloorId(level);
        if (!floorId) {
          warnings.push(`Opening: could not get floor for level ${level}`);
          continue;
        }

        const isEmergencyExit = props.opening_type === 'emergency_exit' || props.opening_type === 'main_entrance';
        const result = await queryRunner.query(`
          INSERT INTO opening (floor_id, opening_type, geometry, name, is_emergency_exit, created_at, updated_at)
          VALUES ($1, $2, ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($3), 4326), 3857), $4, $5, NOW(), NOW())
          RETURNING id
        `, [floorId, props.opening_type || 'door', JSON.stringify(geom), props.name || null, isEmergencyExit]);

        if (result.length > 0 && props.id) {
          idMappings.openings[props.id] = result[0].id;
        }
        stats.openings.added++;
      }

      // ==================== PROCESS OPENING MODIFICATIONS ====================
      for (const feature of changes.openings.modified) {
        const props = feature.properties;
        const geom = feature.geometry;
        if (!props.db_id) {
          warnings.push(`Opening: missing db_id for modification`);
          continue;
        }
        if (!geom || !geom.coordinates) {
          warnings.push(`Opening: missing geometry for modification`);
          continue;
        }
        const level = props.level || '1';
        const floorId = await getFloorId(level);
        if (!floorId) {
          warnings.push(`Opening: could not get floor for level ${level}`);
          continue;
        }

        const isEmergencyExit = props.opening_type === 'emergency_exit' || props.opening_type === 'main_entrance';
        const result = await queryRunner.query(`
          UPDATE opening SET floor_id = $1, opening_type = $2,
            geometry = ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($3), 4326), 3857),
            is_emergency_exit = $4, updated_at = NOW()
          WHERE id = $5
          RETURNING id
        `, [floorId, props.opening_type || 'door', JSON.stringify(geom), isEmergencyExit, props.db_id]);
        if (result.length > 0) stats.openings.modified++;
      }

      // ==================== PROCESS CAMERA DELETIONS ====================
      for (const dbIdStr of changes.cameras.deleted) {
        const dbId = parseInt(dbIdStr, 10);
        if (isNaN(dbId)) {
          warnings.push(`Invalid camera db_id for deletion: ${dbIdStr}`);
          continue;
        }
        const result = await queryRunner.query(`DELETE FROM camera WHERE id = $1 RETURNING id`, [dbId]);
        if (result.length > 0) stats.cameras.deleted++;
      }

      // ==================== PROCESS CAMERA ADDITIONS ====================
      for (const feature of changes.cameras.added) {
        const props = feature.properties;
        const geom = feature.geometry;
        if (!geom || !geom.coordinates) {
          warnings.push(`Camera ${props?.name || props?.id}: missing geometry`);
          continue;
        }
        const level = props.level || '1';
        const floorId = await getFloorId(level);
        if (!floorId) {
          warnings.push(`Camera ${props.name}: could not get floor for level ${level}`);
          continue;
        }

        const cameraCode = `B${buildingId}_${props.camera_id || `CAM_${Date.now()}_${stats.cameras.added}`}`;
        const result = await queryRunner.query(`
          INSERT INTO camera (name, camera_id, rtsp_url, building_id, floor_id, status, is_fire_detection_enabled, geometry, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, 'active', $6, ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($7), 4326), 3857), NOW(), NOW())
          RETURNING id
        `, [props.name || 'Camera', cameraCode, props.rtsp_url || '', buildingId, floorId, props.is_fire_detection_enabled !== false, JSON.stringify(geom)]);

        if (result.length > 0 && props.id) {
          idMappings.cameras[props.id] = result[0].id;
        }
        stats.cameras.added++;
      }

      // ==================== PROCESS CAMERA MODIFICATIONS ====================
      for (const feature of changes.cameras.modified) {
        const props = feature.properties;
        const geom = feature.geometry;
        if (!props.db_id) {
          warnings.push(`Camera ${props?.name}: missing db_id for modification`);
          continue;
        }
        if (!geom || !geom.coordinates) {
          warnings.push(`Camera ${props?.name}: missing geometry for modification`);
          continue;
        }
        const level = props.level || '1';
        const floorId = await getFloorId(level);
        if (!floorId) {
          warnings.push(`Camera ${props.name}: could not get floor for level ${level}`);
          continue;
        }

        const result = await queryRunner.query(`
          UPDATE camera SET name = $1, rtsp_url = $2, floor_id = $3,
            is_fire_detection_enabled = $4,
            geometry = ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($5), 4326), 3857),
            updated_at = NOW()
          WHERE id = $6
          RETURNING id
        `, [props.name, props.rtsp_url || '', floorId, props.is_fire_detection_enabled !== false, JSON.stringify(geom), props.db_id]);
        if (result.length > 0) stats.cameras.modified++;
      }

      // ==================== GET ALL FLOOR IDS ====================
      const allFloorsResult = await queryRunner.query(
        `SELECT id FROM floor WHERE building_id = $1`,
        [buildingId]
      );
      const allFloorIds = allFloorsResult.map((f: any) => f.id);

      // Node type mapping (shared between routing nodes and safe point nodes)
      const nodeTypeMap: Record<string, string> = {
        'room_centroid': 'room', 'centroid': 'room', 'room': 'room',
        'opening_midpoint': 'door', 'door': 'door',
        'waypoint': 'junction', 'junction': 'junction',
        'exit': 'exit', 'entrance': 'entrance',
        'staircase': 'staircase', 'stairs': 'staircase',
        'elevator': 'elevator', 'corridor': 'corridor', 'hallway': 'corridor',
        'window': 'window', 'safe_point': 'other',
        'common': 'room', 'living': 'room', 'dining': 'room', 'bathroom': 'room',
        'kitchen': 'room', 'bedroom': 'room', 'storage': 'room', 'utility': 'room',
        'office': 'room', 'lobby': 'room', 'stairwell': 'staircase',
      };

      // ==================== REGENERATE ROUTING NODES & EDGES (only when rooms/openings change) ====================
      const nodeMap: Record<string, number> = {};

      if (allFloorIds.length > 0 && hasRoutingChanges) {
        // Delete ONLY routing nodes (preserve safe_point nodes)
        // First delete dependent records for routing nodes only
        await queryRunner.query(
          `DELETE FROM trapped_occupants WHERE node_id IN (SELECT id FROM nodes WHERE floor_id = ANY($1) AND (node_category IS NULL OR node_category != 'safe_point'))`,
          [allFloorIds]
        );
        await queryRunner.query(
          `DELETE FROM evacuation_route WHERE start_node_id IN (SELECT id FROM nodes WHERE floor_id = ANY($1) AND (node_category IS NULL OR node_category != 'safe_point')) OR end_node_id IN (SELECT id FROM nodes WHERE floor_id = ANY($1) AND (node_category IS NULL OR node_category != 'safe_point'))`,
          [allFloorIds]
        );
        await queryRunner.query(
          `DELETE FROM edges WHERE source_id IN (SELECT id FROM nodes WHERE floor_id = ANY($1) AND (node_category IS NULL OR node_category != 'safe_point')) OR target_id IN (SELECT id FROM nodes WHERE floor_id = ANY($1) AND (node_category IS NULL OR node_category != 'safe_point'))`,
          [allFloorIds]
        );
        await queryRunner.query(
          `DELETE FROM nodes WHERE floor_id = ANY($1) AND (node_category IS NULL OR node_category != 'safe_point')`,
          [allFloorIds]
        );

        // Insert routing nodes from routing graph
        if (differential.routingGraph?.nodes && Array.isArray(differential.routingGraph.nodes)) {
          for (const node of differential.routingGraph.nodes) {
            if (!node.lng || !node.lat) continue;
            const level = node.level || '1';
            const floorId = await getFloorId(level);
            if (!floorId) continue;

            const nodeType = nodeTypeMap[node.type] || 'other';
            const geomJson = JSON.stringify({ type: 'Point', coordinates: [node.lng, node.lat] });
            const result = await queryRunner.query(`
              INSERT INTO nodes (floor_id, type, geometry, created_at, updated_at)
              VALUES ($1, $2, ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($3), 4326), 3857), NOW(), NOW())
              RETURNING id
            `, [floorId, nodeType, geomJson]);

            if (result.length > 0) {
              nodeMap[node.id] = result[0].id;
              stats.nodes++;
            }
          }
        }

        // Insert edges
        if (differential.routingGraph?.edges && Array.isArray(differential.routingGraph.edges)) {
          for (const edge of differential.routingGraph.edges) {
            const sourceDbId = nodeMap[edge.source];
            const targetDbId = nodeMap[edge.target];
            if (!sourceDbId || !targetDbId) continue;

            const sourceNode = differential.routingGraph.nodes.find((n: any) => n.id === edge.source);
            const targetNode = differential.routingGraph.nodes.find((n: any) => n.id === edge.target);
            if (!sourceNode || !targetNode) continue;

            const geomJson = JSON.stringify({
              type: 'LineString',
              coordinates: [[sourceNode.lng, sourceNode.lat], [targetNode.lng, targetNode.lat]]
            });

            await queryRunner.query(`
              INSERT INTO edges (source_id, target_id, edge_type, cost, geometry, created_at, updated_at)
              VALUES ($1, $2, $3, $4, ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($5), 4326), 3857), NOW(), NOW())
            `, [sourceDbId, targetDbId, 'corridor', Math.round(edge.distance || 1), geomJson]);
            stats.edges++;
          }
        }
      }

      // ==================== DIFFERENTIAL SAFE POINTS PROCESSING ====================
      // Process safe points independently - only add/modify/delete what changed
      if (allFloorIds.length > 0 && changes.safePoints) {
        // Helper to get geo coordinates from various sources
        const getSafePointCoords = (sp: any, feature?: any): { lng: number; lat: number } | null => {
          // Try 1: GeoJSON feature coordinates
          if (feature?.geometry?.coordinates?.length >= 2) {
            return { lng: feature.geometry.coordinates[0], lat: feature.geometry.coordinates[1] };
          }
          // Try 2: Routing graph node
          const matchingNode = differential.routingGraph?.nodes?.find(
            (n: any) => n.id === sp.id || n.id === `sp_${sp.id}` || n.name === sp.name
          );
          if (matchingNode?.lng && matchingNode?.lat) {
            return { lng: matchingNode.lng, lat: matchingNode.lat };
          }
          // Try 3: Pixel position conversion
          if (sp.position && differential.properties?.center_lat && differential.properties?.center_lng && differential.properties?.scale_pixels_per_meter) {
            const centerLat = differential.properties.center_lat;
            const centerLng = differential.properties.center_lng;
            const scale = differential.properties.scale_pixels_per_meter;
            const metersPerDegree = 111000;
            const imageCenter = editorState?.imageSize ? { x: editorState.imageSize.width / 2, y: editorState.imageSize.height / 2 } : { x: 0, y: 0 };
            const dx = (sp.position.x - imageCenter.x) / scale;
            const dy = (imageCenter.y - sp.position.y) / scale;
            return {
              lng: centerLng + (dx / metersPerDegree) / Math.cos(centerLat * Math.PI / 180),
              lat: centerLat + (dy / metersPerDegree)
            };
          }
          return null;
        };

        // PROCESS DELETIONS - delete specific safe points by db_id
        for (const dbIdStr of changes.safePoints.deleted) {
          const dbId = parseInt(dbIdStr, 10);
          if (isNaN(dbId)) continue;
          // Get node_id before deleting safe_point
          const spRecord = await queryRunner.query(`SELECT node_id FROM safe_points WHERE id = $1`, [dbId]);
          if (spRecord.length > 0) {
            const nodeId = spRecord[0].node_id;
            // Delete safe_point first (foreign key constraint)
            await queryRunner.query(`DELETE FROM safe_points WHERE id = $1`, [dbId]);
            // Delete the associated node
            if (nodeId) {
              await queryRunner.query(`DELETE FROM nodes WHERE id = $1`, [nodeId]);
            }
            stats.safePoints.deleted++;
          }
        }

        // PROCESS ADDITIONS - create new safe points
        for (const feature of changes.safePoints.added) {
          const props = feature.properties;
          const level = props?.level || '1';
          const floorId = await getFloorId(level);
          if (!floorId) {
            warnings.push(`Safe point ${props?.name || props?.id}: could not get floor for level ${level}`);
            continue;
          }

          const coords = getSafePointCoords(props, feature);
          if (!coords) {
            warnings.push(`Safe point ${props?.name || props?.id}: could not determine coordinates`);
            continue;
          }

          // Create node for safe point
          const geomJson = JSON.stringify({ type: 'Point', coordinates: [coords.lng, coords.lat] });
          const nodeResult = await queryRunner.query(`
            INSERT INTO nodes (floor_id, type, node_category, geometry, created_at, updated_at)
            VALUES ($1, 'other', 'safe_point', ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($2), 4326), 3857), NOW(), NOW())
            RETURNING id
          `, [floorId, geomJson]);

          if (nodeResult.length === 0) {
            warnings.push(`Safe point ${props?.name || props?.id}: failed to create node`);
            continue;
          }

          const nodeId = nodeResult[0].id;
          stats.nodes++;

          // Create safe_point record
          const spResult = await queryRunner.query(`
            INSERT INTO safe_points (node_id, floor_id, capacity, priority, created_at)
            VALUES ($1, $2, $3, $4, NOW())
            RETURNING id
          `, [nodeId, floorId, props?.capacity || 4, 1]);

          if (spResult.length > 0) {
            idMappings.safePoints[props.id] = spResult[0].id;
            stats.safePoints.added++;
          }
        }

        // PROCESS MODIFICATIONS - update existing safe points
        for (const feature of changes.safePoints.modified) {
          const props = feature.properties;
          if (!props?.db_id) {
            warnings.push(`Safe point ${props?.name || props?.id}: missing db_id for modification`);
            continue;
          }

          const level = props.level || '1';
          const floorId = await getFloorId(level);
          if (!floorId) {
            warnings.push(`Safe point ${props?.name || props?.id}: could not get floor for level ${level}`);
            continue;
          }

          const coords = getSafePointCoords(props, feature);
          if (!coords) {
            warnings.push(`Safe point ${props?.name || props?.id}: could not determine coordinates`);
            continue;
          }

          // Get existing safe_point to find its node_id
          const existingSp = await queryRunner.query(`SELECT node_id FROM safe_points WHERE id = $1`, [props.db_id]);
          if (existingSp.length === 0) {
            warnings.push(`Safe point ${props?.name || props?.id}: not found in database`);
            continue;
          }

          const nodeId = existingSp[0].node_id;
          const geomJson = JSON.stringify({ type: 'Point', coordinates: [coords.lng, coords.lat] });

          // Update node geometry
          await queryRunner.query(`
            UPDATE nodes SET geometry = ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326), 3857), floor_id = $2, updated_at = NOW()
            WHERE id = $3
          `, [geomJson, floorId, nodeId]);

          // Update safe_point record
          await queryRunner.query(`
            UPDATE safe_points SET capacity = $1, floor_id = $2 WHERE id = $3
          `, [props.capacity || 4, floorId, props.db_id]);

          stats.safePoints.modified++;
        }
      }

      // ==================== UPDATE BUILDING METADATA ====================
      const buildingUpdates: any = { hasFloorPlan: true, floorPlanUpdatedAt: new Date() };
      if (floorPlanImage) buildingUpdates.floorPlanImage = floorPlanImage;

      // Update editorState with newly assigned database IDs before saving
      if (editorState) {
        const updatedEditorState = { ...editorState };

        // Inject db_id into rooms
        if (updatedEditorState.rooms && Array.isArray(updatedEditorState.rooms)) {
          updatedEditorState.rooms = updatedEditorState.rooms.map((room: any) => {
            if (idMappings.rooms[room.id]) {
              return { ...room, db_id: idMappings.rooms[room.id] };
            }
            return room;
          });
        }

        // Inject db_id into openings
        if (updatedEditorState.openings && Array.isArray(updatedEditorState.openings)) {
          updatedEditorState.openings = updatedEditorState.openings.map((opening: any) => {
            if (idMappings.openings[opening.id]) {
              return { ...opening, db_id: idMappings.openings[opening.id] };
            }
            return opening;
          });
        }

        // Inject db_id into cameras
        if (updatedEditorState.cameras && Array.isArray(updatedEditorState.cameras)) {
          updatedEditorState.cameras = updatedEditorState.cameras.map((camera: any) => {
            if (idMappings.cameras[camera.id]) {
              return { ...camera, db_id: idMappings.cameras[camera.id] };
            }
            return camera;
          });
        }

        // Inject db_id into safePoints
        if (updatedEditorState.safePoints && Array.isArray(updatedEditorState.safePoints)) {
          updatedEditorState.safePoints = updatedEditorState.safePoints.map((sp: any) => {
            if (idMappings.safePoints[sp.id]) {
              return { ...sp, db_id: idMappings.safePoints[sp.id] };
            }
            return sp;
          });
        }

        buildingUpdates.editorState = updatedEditorState;
      }

      await queryRunner.manager.update('building', buildingId, buildingUpdates);

      await queryRunner.commitTransaction();

      const message = hasChanges
        ? `Saved: ${stats.rooms.added} rooms added, ${stats.rooms.modified} modified, ${stats.rooms.deleted} deleted; ` +
          `${stats.openings.added} openings added, ${stats.openings.modified} modified, ${stats.openings.deleted} deleted; ` +
          `${stats.cameras.added} cameras added, ${stats.cameras.modified} modified, ${stats.cameras.deleted} deleted; ` +
          `${stats.safePoints.added} safe points saved, ${stats.safePoints.deleted} deleted; ` +
          `${stats.nodes} nodes, ${stats.edges} edges`
        : 'No changes to save (editor state updated)';

      return {
        success: true,
        message,
        stats,
        idMappings, // Return ID mappings so frontend can track database IDs
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      console.error('[DifferentialSave] Error:', error);
      return { success: false, error: error.message, warnings };
    } finally {
      await queryRunner.release();
    }
  }

  @Post('seed-societies')
  @Public()
  async seedSocieties() {
    const existingCount = await this.societyRepo.count();
    if (existingCount > 0) {
      return { message: 'Societies already exist', count: existingCount };
    }

    const societies = [
      { name: 'Green Valley Society', location: 'Downtown', owner_id: 1, brigade_id: 1 },
      { name: 'Sunset Heights Society', location: 'Westside', owner_id: 1, brigade_id: 1 },
      { name: 'Royal Gardens Society', location: 'East End', owner_id: 1, brigade_id: 1 },
    ];

    const created = await this.societyRepo.save(societies);
    return { message: 'Societies seeded successfully', societies: created };
  }
}
