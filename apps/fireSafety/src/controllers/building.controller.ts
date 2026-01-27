import { Controller, Get, Post, Patch, Delete, UseGuards, Param, ParseIntPipe, Body } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { building, floor, apartment, Society, room, nodes, edges, Opening, OpeningRoom } from '@app/entities';
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

  @Get(':id')
  @Public()
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.buildingRepo.findOne({ where: { id } });
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
    };
  }

  @Post(':id/import-floor-plan')
  @Public()
  async importFloorPlan(
    @Param('id', ParseIntPipe) buildingId: number,
    @Body() geojson: {
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
        geometry: {
          type: string;
          coordinates: any;
        };
      }>;
    },
  ) {
    const buildingData = await this.buildingRepo.findOne({ where: { id: buildingId } });
    if (!buildingData) {
      return { success: false, error: 'Building not found' };
    }

    const imported = {
      floors: 0,
      rooms: 0,
      openings: 0,
      opening_room_connections: 0,
      nodes: 0,
      edges: 0,
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

      // Step 2: Clear existing data for this building's floors (to allow re-import)
      const existingFloorIds = Object.values(floorMap);
      if (existingFloorIds.length > 0) {
        // Delete existing openings and their room connections for these floors
        await queryRunner.query(`
          DELETE FROM opening_rooms WHERE opening_id IN (
            SELECT id FROM opening WHERE floor_id = ANY($1)
          )
        `, [existingFloorIds]);
        await queryRunner.query(`DELETE FROM opening WHERE floor_id = ANY($1)`, [existingFloorIds]);

        // Delete existing rooms for these floors
        await queryRunner.query(`DELETE FROM room WHERE floor_id = ANY($1)`, [existingFloorIds]);
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

      await queryRunner.commitTransaction();

      return {
        success: true,
        imported,
        warnings: warnings.length > 0 ? warnings : undefined,
        message: `Imported ${imported.rooms} rooms, ${imported.openings} openings (${imported.opening_room_connections} room connections), ${imported.floors} floors`,
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
  }) {
    const newBuilding = this.buildingRepo.create({
      name: createDto.name,
      address: createDto.address,
      type: createDto.type || 'residential',
      society_id: createDto.society_id || 1, // Default to society ID 1
      geometry: null, // Set geometry to null explicitly
    });
    return this.buildingRepo.save(newBuilding);
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
