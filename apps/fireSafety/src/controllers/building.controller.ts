import { Controller, Get, Post, Patch, Delete, UseGuards, Param, ParseIntPipe, Body } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { building, floor, apartment, Society, room, nodes, edges, exits } from '@app/entities';
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
    @InjectRepository(exits) private exitsRepo: Repository<exits>,
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

    // Get rooms with geometry as GeoJSON
    const roomsRaw = await this.dataSource.query(`
      SELECT
        r.id, r.name, r.type, r.floor_id,
        f.level as floor_level,
        ST_AsGeoJSON(ST_Transform(r.geometry, 4326))::json as geometry
      FROM room r
      JOIN floor f ON r.floor_id = f.id
      WHERE r.floor_id = ANY($1)
      ORDER BY f.level, r.name
    `, [floorIds]);

    // Get nodes with geometry as GeoJSON
    const nodesRaw = await this.dataSource.query(`
      SELECT
        n.id, n.name, n.type, n.floor_id, n.room_id,
        f.level as floor_level,
        ST_AsGeoJSON(ST_Transform(n.geometry, 4326))::json as geometry
      FROM nodes n
      JOIN floor f ON n.floor_id = f.id
      WHERE n.floor_id = ANY($1)
      ORDER BY f.level, n.name
    `, [floorIds]);

    // Get edges with geometry as GeoJSON
    const edgesRaw = await this.dataSource.query(`
      SELECT
        e.id, e.source_id, e.target_id, e.type, e.distance, e.floor_id,
        f.level as floor_level,
        ST_AsGeoJSON(ST_Transform(e.geometry, 4326))::json as geometry
      FROM edges e
      JOIN floor f ON e.floor_id = f.id
      WHERE e.floor_id = ANY($1)
    `, [floorIds]);

    // Get exits with geometry as GeoJSON
    const exitsRaw = await this.dataSource.query(`
      SELECT
        ex.id, ex.name, ex.type, ex.floor_id,
        f.level as floor_level,
        ST_AsGeoJSON(ST_Transform(ex.geometry, 4326))::json as geometry
      FROM exits ex
      JOIN floor f ON ex.floor_id = f.id
      WHERE ex.floor_id = ANY($1)
    `, [floorIds]);

    // Build GeoJSON FeatureCollection
    const features = [];

    // Add rooms as Polygon features
    for (const r of roomsRaw) {
      if (r.geometry) {
        features.push({
          type: 'Feature',
          properties: {
            id: `room_${r.id}`,
            db_id: r.id,
            type: 'room',
            name: r.name,
            room_type: r.type,
            level: String(r.floor_level),
            floor_id: r.floor_id,
          },
          geometry: r.geometry,
        });
      }
    }

    // Add nodes as Point features
    for (const n of nodesRaw) {
      if (n.geometry) {
        features.push({
          type: 'Feature',
          properties: {
            id: `node_${n.id}`,
            db_id: n.id,
            type: 'node',
            node_type: n.type,
            name: n.name,
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
            id: `edge_${e.id}`,
            db_id: e.id,
            type: 'edge',
            edge_type: e.type,
            source_id: e.source_id,
            target_id: e.target_id,
            distance: e.distance,
            level: String(e.floor_level),
            floor_id: e.floor_id,
          },
          geometry: e.geometry,
        });
      }
    }

    // Add exits as LineString features
    for (const ex of exitsRaw) {
      if (ex.geometry) {
        features.push({
          type: 'Feature',
          properties: {
            id: `exit_${ex.id}`,
            db_id: ex.id,
            type: 'exit',
            exit_type: ex.type,
            name: ex.name,
            level: String(ex.floor_level),
            floor_id: ex.floor_id,
          },
          geometry: ex.geometry,
        });
      }
    }

    return {
      type: 'FeatureCollection',
      properties: {
        building_id: buildingId,
        building_name: buildingData.name,
        levels: floors.map(f => String(f.level)),
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
      nodes: 0,
      edges: 0,
      exits: 0,
      cameras: 0,
    };
    const warnings: string[] = [];
    const floorMap: Record<string, number> = {}; // level -> floor_id
    const roomMap: Record<string, number> = {}; // local_id -> db_id

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
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

      // Step 2: Process features
      for (const feature of geojson.features) {
        const props = feature.properties;
        const geom = feature.geometry;

        if (!geom || !geom.coordinates) {
          warnings.push(`Skipping feature without geometry: ${props?.id || 'unknown'}`);
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

        // Convert GeoJSON geometry to PostGIS (WGS84 -> Web Mercator)
        const geomJson = JSON.stringify(geom);

        if (props.room_type || (props.type === 'room') || (geom.type === 'Polygon' && !props.type)) {
          // This is a room
          try {
            const result = await queryRunner.query(`
              INSERT INTO room (name, type, floor_id, geometry, created_at, updated_at)
              VALUES ($1, $2, $3, ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($4), 4326), 3857), NOW(), NOW())
              RETURNING id
            `, [
              props.name || 'Unnamed Room',
              props.room_type || props.type || 'room',
              floorId,
              geomJson,
            ]);
            roomMap[props.id] = result[0].id;
            imported.rooms++;
          } catch (err) {
            warnings.push(`Failed to import room ${props.name || props.id}: ${err.message}`);
          }
        } else if (props.type === 'opening' || props.opening_type) {
          // This is a door/opening - create as edge between rooms
          // For now, skip openings as they require node creation
          warnings.push(`Skipping opening: ${props.id} (not yet implemented)`);
        } else if (props.type === 'safe_point' || props.is_safe_point) {
          // Safe point - create as a node
          try {
            await queryRunner.query(`
              INSERT INTO nodes (name, type, floor_id, geometry, created_at, updated_at)
              VALUES ($1, $2, $3, ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($4), 4326), 3857), NOW(), NOW())
            `, [
              props.name || 'Safe Point',
              'safe_point',
              floorId,
              geomJson,
            ]);
            imported.nodes++;
          } catch (err) {
            warnings.push(`Failed to import safe point ${props.name}: ${err.message}`);
          }
        } else if (props.type === 'camera' || props.is_camera) {
          // Camera - just count for now, cameras are managed separately
          imported.cameras++;
        } else if (props.type === 'vertical_connection') {
          // Vertical connection (stairs/elevator) - skip for now
          warnings.push(`Skipping vertical connection: ${props.id}`);
        }
      }

      await queryRunner.commitTransaction();

      return {
        success: true,
        imported,
        warnings: warnings.length > 0 ? warnings : undefined,
        message: `Imported ${imported.rooms} rooms, ${imported.nodes} nodes, ${imported.floors} floors`,
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
