import { Controller, Get, Post, Patch, Delete, UseGuards, Param, ParseIntPipe, Body, Req, Query, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { building, floor, apartment, Society, room, nodes, edges, Opening, OpeningRoom, camera, Sensor, User } from '@app/entities';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { Public } from '../decorators/public.decorator';
import { Request } from 'express';
import * as bcrypt from 'bcryptjs';

// Helper function to generate email from name
function generateEmail(name: string, type: 'hq' | 'state' | 'station'): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return `${slug}.${type}@ignis.com`;
}

// Helper function to generate random password
function generatePassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let password = '';
  for (let i = 0; i < 10; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

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
    @InjectRepository(Sensor) private sensorRepo: Repository<Sensor>,
    private dataSource: DataSource,
  ) {}

  @Get()
  @Public()
  findAll() {
    return this.buildingRepo.find({ order: { created_at: 'DESC' } });
  }

  /**
   * Get buildings grouped by city and area for cascading selector (Android setup screen)
   */
  @Get('grouped')
  @Public()
  async getBuildingsGrouped() {
    let buildings: any[];
    try {
      // Try with city/area columns (requires migration 1800000000037)
      buildings = await this.dataSource.query(`
        SELECT b.id, b.name, b.address, b.type,
               COALESCE(b.city, 'Unknown') as city,
               COALESCE(b.area, s.location, 'Unknown') as area,
               b.center_lat, b.center_lng
        FROM building b
        LEFT JOIN society s ON b.society_id = s.id
        ORDER BY city, area, b.name
      `);
    } catch {
      // Fallback if city/area columns don't exist yet
      buildings = await this.dataSource.query(`
        SELECT b.id, b.name, b.address, b.type,
               'Unknown' as city,
               COALESCE(s.location, 'Unknown') as area,
               b.center_lat, b.center_lng
        FROM building b
        LEFT JOIN society s ON b.society_id = s.id
        ORDER BY area, b.name
      `);
    }

    // Group by city, then by area
    const cityMap: Record<string, Record<string, any[]>> = {};
    for (const b of buildings) {
      if (!cityMap[b.city]) cityMap[b.city] = {};
      if (!cityMap[b.city][b.area]) cityMap[b.city][b.area] = [];
      cityMap[b.city][b.area].push({
        id: b.id,
        name: b.name,
        address: b.address,
        type: b.type,
        centerLat: b.center_lat,
        centerLng: b.center_lng,
      });
    }

    return {
      cities: Object.entries(cityMap).map(([city, areas]) => ({
        city,
        areas: Object.entries(areas).map(([area, buildings]) => ({
          area,
          buildings,
        })),
      })),
    };
  }

  /**
   * Find nearest building to GPS coordinates (for Android auto-switching)
   */
  @Get('nearby')
  @Public()
  async findNearby(
    @Query('lat') lat: string,
    @Query('lng') lng: string,
    @Query('radius') radius?: string,
  ) {
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);
    const radiusMeters = parseFloat(radius || '100');

    if (isNaN(latitude) || isNaN(longitude)) {
      return { building: null };
    }

    // Use center_lat/center_lng for distance calculation (works even without geometry)
    // Also try PostGIS geometry if available
    const result = await this.dataSource.query(`
      SELECT * FROM (
        SELECT id, name, address, type, city, area, center_lat, center_lng, access_level,
          CASE
            WHEN geometry IS NOT NULL THEN
              ST_Distance(
                ST_Transform(geometry, 4326)::geography,
                ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography
              )
            ELSE
              ST_Distance(
                ST_SetSRID(ST_MakePoint(center_lng::float, center_lat::float), 4326)::geography,
                ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography
              )
          END as distance_meters
        FROM building
        WHERE center_lat IS NOT NULL AND center_lng IS NOT NULL
      ) sub
      WHERE distance_meters <= $3
      ORDER BY distance_meters ASC
      LIMIT 1
    `, [latitude, longitude, radiusMeters]);

    if (result.length === 0) {
      return { building: null };
    }

    return {
      building: {
        id: result[0].id,
        name: result[0].name,
        address: result[0].address,
        type: result[0].type,
        city: result[0].city,
        area: result[0].area,
        centerLat: result[0].center_lat,
        centerLng: result[0].center_lng,
        accessLevel: result[0].access_level || 'private',
        distanceMeters: Math.round(result[0].distance_meters),
      },
    };
  }

  /**
   * Get buildings accessible to a user at given GPS coordinates.
   * Returns: public buildings within radius, private buildings where user is resident,
   * and any building with active fire within 50m (emergency override).
   */
  @Get('accessible')
  @Public()
  async findAccessible(
    @Query('lat') lat: string,
    @Query('lng') lng: string,
    @Query('radius') radius?: string,
    @Query('user_id') userId?: string,
  ) {
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);
    const radiusMeters = parseFloat(radius || '200');

    if (isNaN(latitude) || isNaN(longitude)) {
      return { buildings: [] };
    }

    const userIdNum = userId ? parseInt(userId, 10) : null;

    const result = await this.dataSource.query(`
      SELECT * FROM (
        SELECT DISTINCT b.id, b.name, b.address, b.type, b.city, b.area,
               b.center_lat, b.center_lng,
               COALESCE(b.access_level, 'private') as access_level,
               ST_Distance(
                 ST_SetSRID(ST_MakePoint(b.center_lng::float, b.center_lat::float), 4326)::geography,
                 ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography
               ) as distance_meters
        FROM building b
        WHERE b.center_lat IS NOT NULL AND b.center_lng IS NOT NULL
        AND (
          -- Public buildings within radius
          (COALESCE(b.access_level, 'private') = 'public')
          OR
          -- Private/restricted buildings where user is apartment owner
          ($4::integer IS NOT NULL AND EXISTS (
            SELECT 1 FROM apartment a
            WHERE a.floor_id IN (SELECT f.id FROM floor f WHERE f.building_id = b.id)
            AND a.owner_id = $4
          ))
          OR
          -- Emergency override: any building with active fire
          (EXISTS (
            SELECT 1 FROM hazards h
            WHERE h.floor_id IN (SELECT f.id FROM floor f WHERE f.building_id = b.id)
            AND h.status = 'ACTIVE'
          ))
        )
      ) sub
      WHERE sub.distance_meters <= $3
      ORDER BY sub.distance_meters ASC
    `, [latitude, longitude, radiusMeters, userIdNum]);

    return {
      buildings: result.map((r: any) => ({
        id: r.id,
        name: r.name,
        address: r.address,
        type: r.type,
        city: r.city,
        area: r.area,
        centerLat: r.center_lat,
        centerLng: r.center_lng,
        accessLevel: r.access_level,
        distanceMeters: Math.round(r.distance_meters),
      })),
    };
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

  // Get all societies with their brigade information (for dropdown selection)
  @Get('societies')
  @Public()
  async getSocieties() {
    const societies = await this.dataSource.query(`
      SELECT s.id, s.name, s.location, s.brigade_id, s.owner_id, s.created_at,
             fb.name as brigade_name, fb.location as brigade_location,
             fbs.name as state_name, fbs.state,
             fbh.name as hq_name,
             (SELECT COUNT(*) FROM building b WHERE b.society_id = s.id) as building_count
      FROM society s
      LEFT JOIN fire_brigade fb ON s.brigade_id = fb.id
      LEFT JOIN fire_brigade_state fbs ON fb.state_id = fbs.id
      LEFT JOIN fire_brigade_hq fbh ON fbs.hq_id = fbh.id
      ORDER BY s.name
    `);
    return societies.map((s: any) => ({
      id: s.id,
      name: s.name,
      location: s.location,
      brigade_id: s.brigade_id,
      owner_id: s.owner_id,
      brigade_name: s.brigade_name,
      state_name: s.state_name,
      hq_name: s.hq_name,
      building_count: parseInt(s.building_count) || 0,
      created_at: s.created_at,
      display_label: `${s.name} (${s.brigade_name || 'No Brigade'})`,
    }));
  }

  // Get a single society by ID
  @Get('societies/:id')
  @Public()
  async getSociety(@Param('id', ParseIntPipe) id: number) {
    const society = await this.societyRepo.findOne({ where: { id } });
    if (!society) {
      return { error: 'Society not found' };
    }
    return society;
  }

  // Get buildings belonging to a society
  @Get('societies/:id/buildings')
  @Public()
  async getSocietyBuildings(@Param('id', ParseIntPipe) id: number) {
    const buildings = await this.dataSource.query(`
      SELECT b.id, b.name, b.address, b.type, b.total_floors, b.apartments_per_floor,
             b.has_floor_plan, b.center_lat, b.center_lng, b.created_at,
             s.name as society_name, s.location as society_location
      FROM building b
      LEFT JOIN society s ON b.society_id = s.id
      WHERE b.society_id = $1
      ORDER BY b.name
    `, [id]);
    return buildings;
  }

  // Create a new society
  @Post('societies')
  @Public()
  async createSociety(@Body() body: { name: string; location: string; brigade_id: number; owner_id?: number }) {
    const result = await this.dataSource.query(`
      INSERT INTO society (name, location, brigade_id, owner_id, created_at, updated_at)
      VALUES ($1, $2, $3, $4, NOW(), NOW())
      RETURNING *
    `, [body.name, body.location, body.brigade_id, body.owner_id || 1]);
    return result[0];
  }

  // Update a society
  @Patch('societies/:id')
  @Public()
  async updateSociety(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { name?: string; location?: string; brigade_id?: number }
  ) {
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (body.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(body.name);
    }
    if (body.location !== undefined) {
      updates.push(`location = $${paramIndex++}`);
      values.push(body.location);
    }
    if (body.brigade_id !== undefined) {
      updates.push(`brigade_id = $${paramIndex++}`);
      values.push(body.brigade_id);
    }
    updates.push(`updated_at = NOW()`);

    if (updates.length === 1) {
      return { error: 'No fields to update' };
    }

    values.push(id);
    const result = await this.dataSource.query(`
      UPDATE society SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *
    `, values);

    return result[0] || { error: 'Society not found' };
  }

  // Delete a society
  @Delete('societies/:id')
  @Public()
  async deleteSociety(@Param('id', ParseIntPipe) id: number) {
    // Check if society has buildings
    const buildingCount = await this.dataSource.query(
      `SELECT COUNT(*) as count FROM building WHERE society_id = $1`,
      [id]
    );
    if (parseInt(buildingCount[0].count) > 0) {
      return { error: 'Cannot delete society with existing buildings. Remove buildings first.' };
    }

    const result = await this.dataSource.query(
      `DELETE FROM society WHERE id = $1 RETURNING id`,
      [id]
    );
    if (result.length > 0) {
      return { message: 'Society deleted successfully' };
    }
    return { error: 'Society not found' };
  }

  // Get all fire brigades (districts) for dropdown
  @Get('brigades')
  @Public()
  async getBrigades() {
    const brigades = await this.dataSource.query(`
      SELECT fb.id, fb.name, fb.location, fb.status, fb.state_id,
             fbs.name as state_name, fbs.state,
             fbh.name as hq_name
      FROM fire_brigade fb
      LEFT JOIN fire_brigade_state fbs ON fb.state_id = fbs.id
      LEFT JOIN fire_brigade_hq fbh ON fbs.hq_id = fbh.id
      ORDER BY fb.name
    `);
    return brigades.map((b: any) => ({
      id: b.id,
      name: b.name,
      location: b.location,
      status: b.status,
      state_id: b.state_id,
      state_name: b.state_name,
      hq_name: b.hq_name,
      display_label: `${b.name} (${b.state_name || 'No State'})`,
    }));
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

  // Get buildings filtered by firefighter's jurisdiction level
  // HQ level: all buildings in all states under the HQ
  // State level: all buildings in all brigades under the state
  // District/Brigade level: all buildings in societies linked to the brigade
  @Get('by-jurisdiction/:userId')
  @Public()
  async getBuildingsByJurisdiction(@Param('userId', ParseIntPipe) userId: number) {
    // First, get the employee record to determine jurisdiction level
    const employee = await this.dataSource.query(`
      SELECT e.id, e.user_id, e.brigade_id, e.state_id, e.hq_id,
             fb.name as brigade_name, fb.state_id as brigade_state_id,
             fbs.name as state_name, fbs.hq_id as state_hq_id,
             fbh.name as hq_name
      FROM employee e
      LEFT JOIN fire_brigade fb ON e.brigade_id = fb.id
      LEFT JOIN fire_brigade_state fbs ON e.state_id = fbs.id OR fb.state_id = fbs.id
      LEFT JOIN fire_brigade_hq fbh ON e.hq_id = fbh.id OR fbs.hq_id = fbh.id
      WHERE e.user_id = $1
    `, [userId]);

    if (!employee || employee.length === 0) {
      return { buildings: [], jurisdiction: null, message: 'No employee record found for this user' };
    }

    const emp = employee[0];
    let buildings: any[] = [];
    let jurisdiction: { level: string; name: string; id: number } | null = null;

    if (emp.hq_id) {
      // HQ level - get ALL buildings under all states under this HQ
      jurisdiction = { level: 'hq', name: emp.hq_name || 'HQ', id: emp.hq_id };
      buildings = await this.dataSource.query(`
        SELECT DISTINCT b.id, b.name, b.address, b.type, b.total_floors, b.apartments_per_floor,
               b.has_floor_plan, b.floor_plan_updated_at, b.center_lat, b.center_lng, b.created_at,
               s.name as society_name, fb.name as brigade_name, fbs.name as state_name
        FROM building b
        LEFT JOIN society s ON b.society_id = s.id
        LEFT JOIN fire_brigade fb ON s.brigade_id = fb.id
        LEFT JOIN fire_brigade_state fbs ON fb.state_id = fbs.id
        LEFT JOIN fire_brigade_hq fbh ON fbs.hq_id = fbh.id
        WHERE fbh.id = $1
        ORDER BY b.created_at DESC
      `, [emp.hq_id]);
    } else if (emp.state_id) {
      // State level - get all buildings under all brigades in this state
      jurisdiction = { level: 'state', name: emp.state_name || 'State', id: emp.state_id };
      buildings = await this.dataSource.query(`
        SELECT DISTINCT b.id, b.name, b.address, b.type, b.total_floors, b.apartments_per_floor,
               b.has_floor_plan, b.floor_plan_updated_at, b.center_lat, b.center_lng, b.created_at,
               s.name as society_name, fb.name as brigade_name
        FROM building b
        LEFT JOIN society s ON b.society_id = s.id
        LEFT JOIN fire_brigade fb ON s.brigade_id = fb.id
        WHERE fb.state_id = $1
        ORDER BY b.created_at DESC
      `, [emp.state_id]);
    } else if (emp.brigade_id) {
      // District/Brigade level - get buildings in societies linked to this brigade
      jurisdiction = { level: 'district', name: emp.brigade_name || 'District', id: emp.brigade_id };
      buildings = await this.dataSource.query(`
        SELECT DISTINCT b.id, b.name, b.address, b.type, b.total_floors, b.apartments_per_floor,
               b.has_floor_plan, b.floor_plan_updated_at, b.center_lat, b.center_lng, b.created_at,
               s.name as society_name
        FROM building b
        LEFT JOIN society s ON b.society_id = s.id
        WHERE s.brigade_id = $1
        ORDER BY b.created_at DESC
      `, [emp.brigade_id]);
    }

    return {
      buildings: buildings.map(b => ({
        id: b.id,
        name: b.name,
        address: b.address,
        type: b.type,
        total_floors: b.total_floors || 1,
        apartments_per_floor: b.apartments_per_floor || 1,
        has_floor_plan: b.has_floor_plan || false,
        floor_plan_updated_at: b.floor_plan_updated_at,
        center_lat: b.center_lat ? parseFloat(b.center_lat) : null,
        center_lng: b.center_lng ? parseFloat(b.center_lng) : null,
        society_name: b.society_name,
        brigade_name: b.brigade_name,
        state_name: b.state_name,
        created_at: b.created_at,
      })),
      jurisdiction,
      jurisdictionLevel: jurisdiction?.level || null,
      employee: {
        id: emp.id,
        user_id: emp.user_id,
        brigade_id: emp.brigade_id,
        state_id: emp.state_id || emp.brigade_state_id,
        hq_id: emp.hq_id || emp.state_hq_id,
        brigade_name: emp.brigade_name,
        state_name: emp.state_name,
        hq_name: emp.hq_name,
      },
      count: buildings.length,
    };
  }

  // ==================== FIRE BRIGADE HQ ENDPOINTS (Super Admin) ====================

  @Get('fire-brigade-hqs')
  @Public()
  async getFireBrigadeHQs() {
    const hqs = await this.dataSource.query(`
      SELECT fbh.id, fbh.name, fbh.address, fbh.phone, fbh.email, fbh.status,
             fbh.created_at, fbh.updated_at,
             (SELECT COUNT(*) FROM fire_brigade_state fbs WHERE fbs.hq_id = fbh.id) as state_count,
             (SELECT COUNT(*) FROM employee e WHERE e.hq_id = fbh.id) as employee_count
      FROM fire_brigade_hq fbh
      ORDER BY fbh.name
    `);
    return hqs.map((h: any) => ({
      ...h,
      state_count: parseInt(h.state_count) || 0,
      employee_count: parseInt(h.employee_count) || 0,
    }));
  }

  @Get('fire-brigade-hqs/:id')
  @Public()
  async getFireBrigadeHQ(@Param('id', ParseIntPipe) id: number) {
    const hq = await this.dataSource.query(`
      SELECT fbh.*,
             (SELECT COUNT(*) FROM fire_brigade_state fbs WHERE fbs.hq_id = fbh.id) as state_count
      FROM fire_brigade_hq fbh
      WHERE fbh.id = $1
    `, [id]);
    return hq[0] || { error: 'HQ not found' };
  }

  @Post('fire-brigade-hqs')
  @Public()
  async createFireBrigadeHQ(@Body() body: { name: string; address?: string; phone?: string; email?: string }) {
    // Generate credentials for the HQ admin
    const generatedEmail = generateEmail(body.name, 'hq');
    const generatedPassword = generatePassword();
    const hashedPassword = await bcrypt.hash(generatedPassword, 10);

    // Check if email already exists
    const existingUser = await this.dataSource.query(
      `SELECT id FROM users WHERE email = $1`, [generatedEmail]
    );

    let userId: number;
    if (existingUser.length > 0) {
      userId = existingUser[0].id;
    } else {
      // Create user account for HQ admin
      const userResult = await this.dataSource.query(`
        INSERT INTO users (email, password, name, role, is_active, created_at, updated_at)
        VALUES ($1, $2, $3, 'firefighter_hq', true, NOW(), NOW())
        RETURNING id
      `, [generatedEmail, hashedPassword, `${body.name} Admin`]);
      userId = userResult[0].id;
    }

    // Create the HQ and link to user
    const result = await this.dataSource.query(`
      INSERT INTO fire_brigade_hq (name, address, phone, email, status, user_id, created_at, updated_at)
      VALUES ($1, $2, $3, $4, 'active', $5, NOW(), NOW())
      RETURNING *
    `, [body.name, body.address || null, body.phone || null, body.email || null, userId]);

    const hqId = result[0].id;

    // Create employee record linking user to HQ
    await this.dataSource.query(`
      INSERT INTO employee (user_id, hq_id, position, rank, badge_number, status, hire_date, created_at, updated_at)
      VALUES ($1, $2, 'HQ Commander', 'Commander', $3, 'active', NOW(), NOW(), NOW())
      ON CONFLICT (user_id) DO UPDATE SET hq_id = $2
    `, [userId, hqId, `HQ-${hqId}-${Date.now().toString().slice(-4)}`]);

    return {
      ...result[0],
      credentials: {
        email: generatedEmail,
        password: generatedPassword,
        role: 'firefighter_hq'
      }
    };
  }

  @Patch('fire-brigade-hqs/:id')
  @Public()
  async updateFireBrigadeHQEarly(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { name?: string; address?: string; phone?: string; email?: string; status?: string }
  ) {
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;
    if (body.name !== undefined) { updates.push(`name = $${paramIndex++}`); values.push(body.name); }
    if (body.address !== undefined) { updates.push(`address = $${paramIndex++}`); values.push(body.address); }
    if (body.phone !== undefined) { updates.push(`phone = $${paramIndex++}`); values.push(body.phone); }
    if (body.email !== undefined) { updates.push(`email = $${paramIndex++}`); values.push(body.email); }
    if (body.status !== undefined) { updates.push(`status = $${paramIndex++}`); values.push(body.status); }
    updates.push(`updated_at = NOW()`);
    if (updates.length === 1) return { error: 'No fields to update' };
    values.push(id);
    const result = await this.dataSource.query(
      `UPDATE fire_brigade_hq SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );
    return result[0] || { error: 'HQ not found' };
  }

  @Delete('fire-brigade-hqs/:id')
  @Public()
  async deleteFireBrigadeHQEarly(@Param('id', ParseIntPipe) id: number) {
    const stateCount = await this.dataSource.query(
      `SELECT COUNT(*) as count FROM fire_brigade_state WHERE hq_id = $1`, [id]
    );
    if (parseInt(stateCount[0].count) > 0) {
      return { error: 'Cannot delete HQ with existing states. Remove states first.' };
    }
    const result = await this.dataSource.query(`DELETE FROM fire_brigade_hq WHERE id = $1 RETURNING id`, [id]);
    if (result.length > 0) return { message: 'HQ deleted successfully' };
    return { error: 'HQ not found' };
  }

  // ==================== FIRE BRIGADE STATE ENDPOINTS ====================

  @Get('fire-brigade-states')
  @Public()
  async getFireBrigadeStates() {
    const states = await this.dataSource.query(`
      SELECT fbs.id, fbs.name, fbs.state, fbs.address, fbs.phone, fbs.status,
             fbs.hq_id, fbs.created_at, fbs.updated_at,
             fbh.name as hq_name,
             (SELECT COUNT(*) FROM fire_brigade fb WHERE fb.state_id = fbs.id) as brigade_count,
             (SELECT COUNT(*) FROM employee e WHERE e.state_id = fbs.id) as employee_count
      FROM fire_brigade_state fbs
      LEFT JOIN fire_brigade_hq fbh ON fbs.hq_id = fbh.id
      ORDER BY fbs.name
    `);
    return states.map((s: any) => ({
      ...s,
      brigade_count: parseInt(s.brigade_count) || 0,
      employee_count: parseInt(s.employee_count) || 0,
    }));
  }

  @Get('fire-brigade-states/by-hq/:hqId')
  @Public()
  async getFireBrigadeStatesByHQEarly(@Param('hqId', ParseIntPipe) hqId: number) {
    const states = await this.dataSource.query(`
      SELECT fbs.id, fbs.name, fbs.state, fbs.address, fbs.phone, fbs.status,
             fbs.hq_id, fbs.created_at,
             (SELECT COUNT(*) FROM fire_brigade fb WHERE fb.state_id = fbs.id) as brigade_count
      FROM fire_brigade_state fbs
      WHERE fbs.hq_id = $1
      ORDER BY fbs.name
    `, [hqId]);
    return states.map((s: any) => ({ ...s, brigade_count: parseInt(s.brigade_count) || 0 }));
  }

  @Post('fire-brigade-states')
  @Public()
  async createFireBrigadeState(@Body() body: { name: string; state: string; hq_id: number; address?: string; phone?: string }) {
    // Generate credentials for the State admin
    const generatedEmail = generateEmail(body.name, 'state');
    const generatedPassword = generatePassword();
    const hashedPassword = await bcrypt.hash(generatedPassword, 10);

    // Check if email already exists
    const existingUser = await this.dataSource.query(
      `SELECT id FROM users WHERE email = $1`, [generatedEmail]
    );

    let userId: number;
    if (existingUser.length > 0) {
      userId = existingUser[0].id;
    } else {
      // Create user account for State admin
      const userResult = await this.dataSource.query(`
        INSERT INTO users (email, password, name, role, is_active, created_at, updated_at)
        VALUES ($1, $2, $3, 'firefighter_state', true, NOW(), NOW())
        RETURNING id
      `, [generatedEmail, hashedPassword, `${body.name} Admin`]);
      userId = userResult[0].id;
    }

    // Create the State and link to user
    const result = await this.dataSource.query(`
      INSERT INTO fire_brigade_state (name, state, hq_id, address, phone, status, user_id, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, 'active', $6, NOW(), NOW())
      RETURNING *
    `, [body.name, body.state, body.hq_id, body.address || null, body.phone || null, userId]);

    const stateId = result[0].id;

    // Create employee record linking user to State
    await this.dataSource.query(`
      INSERT INTO employee (user_id, state_id, position, rank, badge_number, status, hire_date, created_at, updated_at)
      VALUES ($1, $2, 'State Commander', 'Commander', $3, 'active', NOW(), NOW(), NOW())
      ON CONFLICT (user_id) DO UPDATE SET state_id = $2
    `, [userId, stateId, `ST-${stateId}-${Date.now().toString().slice(-4)}`]);

    return {
      ...result[0],
      credentials: {
        email: generatedEmail,
        password: generatedPassword,
        role: 'firefighter_state'
      }
    };
  }

  @Patch('fire-brigade-states/:id')
  @Public()
  async updateFireBrigadeStateEarly(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { name?: string; state?: string; hq_id?: number; address?: string; phone?: string; status?: string }
  ) {
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;
    if (body.name !== undefined) { updates.push(`name = $${paramIndex++}`); values.push(body.name); }
    if (body.state !== undefined) { updates.push(`state = $${paramIndex++}`); values.push(body.state); }
    if (body.hq_id !== undefined) { updates.push(`hq_id = $${paramIndex++}`); values.push(body.hq_id); }
    if (body.address !== undefined) { updates.push(`address = $${paramIndex++}`); values.push(body.address); }
    if (body.phone !== undefined) { updates.push(`phone = $${paramIndex++}`); values.push(body.phone); }
    if (body.status !== undefined) { updates.push(`status = $${paramIndex++}`); values.push(body.status); }
    updates.push(`updated_at = NOW()`);
    if (updates.length === 1) return { error: 'No fields to update' };
    values.push(id);
    const result = await this.dataSource.query(
      `UPDATE fire_brigade_state SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );
    return result[0] || { error: 'State not found' };
  }

  @Delete('fire-brigade-states/:id')
  @Public()
  async deleteFireBrigadeStateEarly(@Param('id', ParseIntPipe) id: number) {
    const brigadeCount = await this.dataSource.query(
      `SELECT COUNT(*) as count FROM fire_brigade WHERE state_id = $1`, [id]
    );
    if (parseInt(brigadeCount[0].count) > 0) {
      return { error: 'Cannot delete state with existing brigades/stations. Remove them first.' };
    }
    const result = await this.dataSource.query(`DELETE FROM fire_brigade_state WHERE id = $1 RETURNING id`, [id]);
    if (result.length > 0) return { message: 'State deleted successfully' };
    return { error: 'State not found' };
  }

  // ==================== FIRE BRIGADE STATION ENDPOINTS ====================

  @Get('fire-brigade-stations')
  @Public()
  async getFireBrigadeStations() {
    const brigades = await this.dataSource.query(`
      SELECT fb.id, fb.name, fb.location, fb.address, fb.phone, fb.email,
             fb.capacity, fb.status, fb.state_id, fb.created_at, fb.updated_at,
             fbs.name as state_name, fbs.state as state_code,
             fbh.name as hq_name, fbh.id as hq_id,
             (SELECT COUNT(*) FROM society s WHERE s.brigade_id = fb.id) as society_count,
             (SELECT COUNT(*) FROM employee e WHERE e.brigade_id = fb.id) as employee_count
      FROM fire_brigade fb
      LEFT JOIN fire_brigade_state fbs ON fb.state_id = fbs.id
      LEFT JOIN fire_brigade_hq fbh ON fbs.hq_id = fbh.id
      ORDER BY fb.name
    `);
    return brigades.map((b: any) => ({
      ...b,
      society_count: parseInt(b.society_count) || 0,
      employee_count: parseInt(b.employee_count) || 0,
    }));
  }

  @Get('fire-brigade-stations/by-state/:stateId')
  @Public()
  async getFireBrigadeStationsByStateEarly(@Param('stateId', ParseIntPipe) stateId: number) {
    const brigades = await this.dataSource.query(`
      SELECT fb.id, fb.name, fb.location, fb.address, fb.phone, fb.email,
             fb.capacity, fb.status, fb.state_id, fb.created_at,
             (SELECT COUNT(*) FROM society s WHERE s.brigade_id = fb.id) as society_count
      FROM fire_brigade fb
      WHERE fb.state_id = $1
      ORDER BY fb.name
    `, [stateId]);
    return brigades.map((b: any) => ({ ...b, society_count: parseInt(b.society_count) || 0 }));
  }

  @Post('fire-brigade-stations')
  @Public()
  async createFireBrigadeStation(@Body() body: {
    name: string; location: string; state_id: number;
    address?: string; phone?: string; email?: string; capacity?: number
  }) {
    // Generate credentials for the Station/District firefighter
    const generatedEmail = generateEmail(body.name, 'station');
    const generatedPassword = generatePassword();
    const hashedPassword = await bcrypt.hash(generatedPassword, 10);

    // Check if email already exists
    const existingUser = await this.dataSource.query(
      `SELECT id FROM users WHERE email = $1`, [generatedEmail]
    );

    let userId: number;
    if (existingUser.length > 0) {
      userId = existingUser[0].id;
    } else {
      // Create user account for Station/District firefighter
      const userResult = await this.dataSource.query(`
        INSERT INTO users (email, password, name, role, is_active, created_at, updated_at)
        VALUES ($1, $2, $3, 'firefighter_district', true, NOW(), NOW())
        RETURNING id
      `, [generatedEmail, hashedPassword, `${body.name} Firefighter`]);
      userId = userResult[0].id;
    }

    // Create the Station and link to user
    const result = await this.dataSource.query(`
      INSERT INTO fire_brigade (name, location, state_id, address, phone, email, capacity, status, user_id, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', $8, NOW(), NOW())
      RETURNING *
    `, [body.name, body.location, body.state_id, body.address || null, body.phone || null, body.email || null, body.capacity || 10, userId]);

    const brigadeId = result[0].id;

    // Create employee record linking user to Brigade/Station
    await this.dataSource.query(`
      INSERT INTO employee (user_id, brigade_id, position, rank, badge_number, status, hire_date, created_at, updated_at)
      VALUES ($1, $2, 'Station Officer', 'Officer', $3, 'active', NOW(), NOW(), NOW())
      ON CONFLICT (user_id) DO UPDATE SET brigade_id = $2
    `, [userId, brigadeId, `FB-${brigadeId}-${Date.now().toString().slice(-4)}`]);

    return {
      ...result[0],
      credentials: {
        email: generatedEmail,
        password: generatedPassword,
        role: 'firefighter_district'
      }
    };
  }

  @Patch('fire-brigade-stations/:id')
  @Public()
  async updateFireBrigadeStationEarly(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { name?: string; location?: string; state_id?: number; address?: string; phone?: string; email?: string; capacity?: number; status?: string }
  ) {
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;
    if (body.name !== undefined) { updates.push(`name = $${paramIndex++}`); values.push(body.name); }
    if (body.location !== undefined) { updates.push(`location = $${paramIndex++}`); values.push(body.location); }
    if (body.state_id !== undefined) { updates.push(`state_id = $${paramIndex++}`); values.push(body.state_id); }
    if (body.address !== undefined) { updates.push(`address = $${paramIndex++}`); values.push(body.address); }
    if (body.phone !== undefined) { updates.push(`phone = $${paramIndex++}`); values.push(body.phone); }
    if (body.email !== undefined) { updates.push(`email = $${paramIndex++}`); values.push(body.email); }
    if (body.capacity !== undefined) { updates.push(`capacity = $${paramIndex++}`); values.push(body.capacity); }
    if (body.status !== undefined) { updates.push(`status = $${paramIndex++}`); values.push(body.status); }
    updates.push(`updated_at = NOW()`);
    if (updates.length === 1) return { error: 'No fields to update' };
    values.push(id);
    const result = await this.dataSource.query(
      `UPDATE fire_brigade SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );
    return result[0] || { error: 'Station not found' };
  }

  @Delete('fire-brigade-stations/:id')
  @Public()
  async deleteFireBrigadeStationEarly(@Param('id', ParseIntPipe) id: number) {
    const societyCount = await this.dataSource.query(
      `SELECT COUNT(*) as count FROM society WHERE brigade_id = $1`, [id]
    );
    if (parseInt(societyCount[0].count) > 0) {
      return { error: 'Cannot delete station with existing societies. Remove societies first.' };
    }
    const result = await this.dataSource.query(`DELETE FROM fire_brigade WHERE id = $1 RETURNING id`, [id]);
    if (result.length > 0) return { message: 'Station deleted successfully' };
    return { error: 'Station not found' };
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
    // LEFT JOIN nodes to include the routing node_id for each room
    const roomsRaw = await this.dataSource.query(`
      SELECT
        r.id, r.name, r.type, r.floor_id, r.color, r.area_sqm, r.capacity,
        f.level as floor_level,
        ST_AsGeoJSON(ST_Transform(r.geometry, 4326))::json as geometry,
        ST_Y(ST_Transform(r.centroid, 4326)) as centroid_lat,
        ST_X(ST_Transform(r.centroid, 4326)) as centroid_lng,
        (SELECT n.id FROM nodes n WHERE n.room_id = r.id LIMIT 1) as node_id
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

    // Get room-to-node mapping using spatial query (node inside or near room)
    const roomNodesMapping = await this.dataSource.query(`
      SELECT DISTINCT ON (r.id)
        r.id as room_id,
        n.id as node_id
      FROM room r
      JOIN nodes n ON n.floor_id = r.floor_id
      WHERE r.floor_id = ANY($1)
        AND (ST_Intersects(n.geometry, r.geometry) OR ST_DWithin(n.geometry, r.geometry, 5))
      ORDER BY r.id, ST_Distance(n.geometry, ST_Centroid(r.geometry)) ASC
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

    // Build room_id -> node_id mapping from spatial query result
    const roomToNodeMap = new Map<number, number>();
    for (const mapping of roomNodesMapping) {
      roomToNodeMap.set(mapping.room_id, mapping.node_id);
    }

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
            node_id: r.node_id || roomToNodeMap.get(r.id) || null,  // Prefer FK lookup, fall back to spatial query
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

    // Debug logging for floor plan data
    const featuresByType = { rooms: 0, openings: 0, nodes: 0, edges: 0, cameras: 0 };
    for (const f of features) {
      if (f.properties?.room_type && !f.properties?.type) featuresByType.rooms++;
      else if (f.properties?.type === 'opening') featuresByType.openings++;
      else if (f.properties?.type === 'node') featuresByType.nodes++;
      else if (f.properties?.type === 'edge') featuresByType.edges++;
      else if (f.properties?.type === 'camera') featuresByType.cameras++;
    }
    console.log(`[GetFloorPlan] Building ${buildingId}: ${features.length} total features`, featuresByType,
      `center_lat=${buildingData.centerLat}, center_lng=${buildingData.centerLng}, floors=${floorIds.length}`);

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
          sensors?: { added: any[]; modified: any[]; deleted: string[] };
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
              'garage': 'storage',
              'stairs': 'stairwell',
              'elevator': 'other',
              'corridor': 'hallway',
              'closet': 'storage',
              'entry': 'lobby',
              'outdoor': 'other',
              'recreation': 'other',
              'exit': 'other',
            };
            const roomType = roomTypeMap[props.room_type] || 'other';

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
      total_floors?: number;
      apartments_per_floor?: number;
      totalFloors?: number;
      apartmentsPerFloor?: number;
    },
  ) {
    // Map snake_case to camelCase for entity properties
    const mappedDto: any = {};

    if (updateDto.name !== undefined) mappedDto.name = updateDto.name;
    if (updateDto.address !== undefined) mappedDto.address = updateDto.address;
    if (updateDto.type !== undefined) mappedDto.type = updateDto.type;
    if (updateDto.society_id !== undefined) mappedDto.society_id = updateDto.society_id;

    // Handle both snake_case and camelCase for these properties
    const totalFloors = updateDto.total_floors ?? updateDto.totalFloors;
    const apartmentsPerFloor = updateDto.apartments_per_floor ?? updateDto.apartmentsPerFloor;

    if (totalFloors !== undefined) mappedDto.totalFloors = totalFloors;
    if (apartmentsPerFloor !== undefined) mappedDto.apartmentsPerFloor = apartmentsPerFloor;

    if (Object.keys(mappedDto).length > 0) {
      await this.buildingRepo.update(id, mappedDto);
    }

    return this.buildingRepo.findOne({ where: { id } });
  }

  @Delete(':id')
  @Public()
  async delete(@Param('id', ParseIntPipe) id: number) {
    const building = await this.buildingRepo.findOne({ where: { id } });
    if (!building) {
      throw new NotFoundException(`Building with id ${id} not found`);
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Get all floor IDs for this building
      const floors = await queryRunner.query(
        `SELECT id FROM floor WHERE building_id = $1`,
        [id],
      );
      const floorIds = floors.map((f: any) => f.id);

      if (floorIds.length > 0) {
        // 1. Delete fire_detection_log (FK → camera, FK → hazards)
        await queryRunner.query(`
          DELETE FROM fire_detection_log WHERE camera_id IN (
            SELECT id FROM camera WHERE building_id = $1 OR floor_id = ANY($2)
          ) OR hazard_id IN (
            SELECT id FROM hazards WHERE floor_id = ANY($2)
              OR room_id IN (SELECT id FROM room WHERE floor_id = ANY($2))
              OR node_id IN (SELECT id FROM nodes WHERE floor_id = ANY($2))
          )
        `, [id, floorIds]);

        // 2. Delete cameras (FK → building, floor, room, nodes)
        await queryRunner.query(`
          DELETE FROM camera WHERE building_id = $1 OR floor_id = ANY($2)
        `, [id, floorIds]);

        // 3. Delete fire_alert_config (FK → building)
        await queryRunner.query(`DELETE FROM fire_alert_config WHERE building_id = $1`, [id]);

        // 4. Delete features (FK → room, floor)
        await queryRunner.query(`
          DELETE FROM features WHERE room_id IN (
            SELECT id FROM room WHERE floor_id = ANY($1)
          ) OR floor_id = ANY($1)
        `, [floorIds]);

        // 5. Detach sensors (nullable FKs → building, room, node, floor)
        await queryRunner.query(`
          UPDATE sensors SET building_id = NULL, room_id = NULL, node_id = NULL, floor_id = NULL
          WHERE building_id = $1 OR floor_id = ANY($2)
        `, [id, floorIds]);

        // 6. Delete trapped_occupant_blocking_hazards (FK → trapped_occupants, hazards)
        await queryRunner.query(`
          DELETE FROM trapped_occupant_blocking_hazards
          WHERE trapped_occupant_id IN (
            SELECT id FROM trapped_occupants WHERE node_id IN (
              SELECT id FROM nodes WHERE floor_id = ANY($1)
            ) OR floor_id = ANY($1)
          ) OR hazard_id IN (
            SELECT id FROM hazards WHERE floor_id = ANY($1)
              OR room_id IN (SELECT id FROM room WHERE floor_id = ANY($1))
              OR node_id IN (SELECT id FROM nodes WHERE floor_id = ANY($1))
          )
        `, [floorIds]);

        // 7. Delete isolation_events (FK → nodes, hazards, trapped_occupants, rescue_teams)
        await queryRunner.query(`
          DELETE FROM isolation_events WHERE node_id IN (
            SELECT id FROM nodes WHERE floor_id = ANY($1)
          ) OR hazard_id IN (
            SELECT id FROM hazards WHERE floor_id = ANY($1)
              OR room_id IN (SELECT id FROM room WHERE floor_id = ANY($1))
              OR node_id IN (SELECT id FROM nodes WHERE floor_id = ANY($1))
          ) OR trapped_occupant_id IN (
            SELECT id FROM trapped_occupants WHERE node_id IN (
              SELECT id FROM nodes WHERE floor_id = ANY($1)
            ) OR floor_id = ANY($1)
          )
        `, [floorIds]);

        // 8. Delete evacuation_route (FK → nodes)
        await queryRunner.query(`
          DELETE FROM evacuation_route WHERE start_node_id IN (
            SELECT id FROM nodes WHERE floor_id = ANY($1)
          ) OR end_node_id IN (
            SELECT id FROM nodes WHERE floor_id = ANY($1)
          )
        `, [floorIds]);

        // 9. Detach rescue_teams from trapped_occupants (FK → trapped_occupants)
        await queryRunner.query(`
          UPDATE rescue_teams SET current_assignment_id = NULL
          WHERE current_assignment_id IN (
            SELECT id FROM trapped_occupants WHERE node_id IN (
              SELECT id FROM nodes WHERE floor_id = ANY($1)
            ) OR floor_id = ANY($1)
          )
        `, [floorIds]);

        // 10. Delete trapped_occupants (FK → nodes, floor, rescue_teams)
        await queryRunner.query(`
          DELETE FROM trapped_occupants WHERE node_id IN (
            SELECT id FROM nodes WHERE floor_id = ANY($1)
          ) OR floor_id = ANY($1)
        `, [floorIds]);

        // 11. Delete hazards (FK → apartment, node, room, floor)
        await queryRunner.query(`
          DELETE FROM hazards
          WHERE floor_id = ANY($1)
             OR room_id IN (SELECT id FROM room WHERE floor_id = ANY($1))
             OR node_id IN (SELECT id FROM nodes WHERE floor_id = ANY($1))
             OR apartment_id IN (SELECT id FROM apartment WHERE floor_id = ANY($1))
        `, [floorIds]);

        // 12. Delete safe_points (FK → nodes, floor)
        await queryRunner.query(`
          DELETE FROM safe_points WHERE node_id IN (
            SELECT id FROM nodes WHERE floor_id = ANY($1)
          ) OR floor_id = ANY($1)
        `, [floorIds]);

        // 13. Delete edges (FK → nodes)
        await queryRunner.query(`
          DELETE FROM edges WHERE source_id IN (
            SELECT id FROM nodes WHERE floor_id = ANY($1)
          ) OR target_id IN (
            SELECT id FROM nodes WHERE floor_id = ANY($1)
          )
        `, [floorIds]);

        // 14. Delete opening_rooms (FK → opening, room)
        await queryRunner.query(`
          DELETE FROM opening_rooms WHERE opening_id IN (
            SELECT id FROM opening WHERE floor_id = ANY($1)
          )
        `, [floorIds]);

        // 15. Delete openings (FK → floor, nodes)
        await queryRunner.query(`DELETE FROM opening WHERE floor_id = ANY($1)`, [floorIds]);

        // 16. Delete nodes (FK → room, floor, apartment)
        await queryRunner.query(`DELETE FROM nodes WHERE floor_id = ANY($1)`, [floorIds]);

        // 17. Delete rooms (FK → apartment, floor)
        await queryRunner.query(`DELETE FROM room WHERE floor_id = ANY($1)`, [floorIds]);

        // 18. Delete incident_log (FK → apartment, floor)
        await queryRunner.query(`
          DELETE FROM incident_log WHERE apartment_id IN (
            SELECT id FROM apartment WHERE floor_id = ANY($1)
          ) OR floor_id = ANY($1)
        `, [floorIds]);

        // 19. Detach apartment owners before deleting apartments
        await queryRunner.query(`
          UPDATE apartment SET owner_id = NULL
          WHERE floor_id = ANY($1)
        `, [floorIds]);

        // 20. Delete apartments (FK → floor)
        await queryRunner.query(`DELETE FROM apartment WHERE floor_id = ANY($1)`, [floorIds]);

        // 21. Detach rescue_teams from floors (FK → floor)
        await queryRunner.query(`
          UPDATE rescue_teams SET current_floor_id = NULL
          WHERE current_floor_id = ANY($1)
        `, [floorIds]);
      } else {
        // Even with no floors, clean up building-level references
        await queryRunner.query(`
          DELETE FROM fire_detection_log WHERE camera_id IN (
            SELECT id FROM camera WHERE building_id = $1
          )
        `, [id]);
        await queryRunner.query(`DELETE FROM camera WHERE building_id = $1`, [id]);
        await queryRunner.query(`DELETE FROM fire_alert_config WHERE building_id = $1`, [id]);
        await queryRunner.query(`UPDATE sensors SET building_id = NULL WHERE building_id = $1`, [id]);
      }

      // 22. Delete floors (FK → building)
      await queryRunner.query(`DELETE FROM floor WHERE building_id = $1`, [id]);

      // 23. Delete the building itself
      await queryRunner.query(`DELETE FROM building WHERE id = $1`, [id]);

      await queryRunner.commitTransaction();

      return {
        message: 'Building deleted successfully',
        deletedBuildingId: id,
        floorsRemoved: floorIds.length,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
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
        sensors?: { added: any[]; modified: any[]; deleted: string[] };
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
        sensors: { added: 0, modified: 0, deleted: 0 },
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
      sensors?: Record<string, number>;
    } = { rooms: {}, openings: {}, cameras: {},
        sensors: {}, safePoints: {} };

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

      const hasSensorChanges = changes.sensors &&
        (changes.sensors.added.length > 0 || changes.sensors.modified.length > 0 || changes.sensors.deleted.length > 0);

      const hasChanges = hasRoutingChanges || hasSafePointChanges || hasCameraChanges || hasSensorChanges;

      console.log(`[DifferentialSave] Building ${buildingId}, hasRoutingChanges: ${hasRoutingChanges}, hasSafePointChanges: ${hasSafePointChanges}, hasSensorChanges: ${hasSensorChanges}`, {
        rooms: { added: changes.rooms.added.length, modified: changes.rooms.modified.length, deleted: changes.rooms.deleted.length },
        openings: { added: changes.openings.added.length, modified: changes.openings.modified.length, deleted: changes.openings.deleted.length },
        cameras: { added: changes.cameras.added.length, modified: changes.cameras.modified.length, deleted: changes.cameras.deleted.length },
        sensors: changes.sensors ? { added: changes.sensors.added.length, modified: changes.sensors.modified.length, deleted: changes.sensors.deleted.length } : 'not provided',
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

      // Helper: safely coerce value to integer (for integer DB columns)
      const toInt = (val: any): number | null => {
        if (val === null || val === undefined) return null;
        const n = Number(val);
        if (isNaN(n)) return null;
        return Math.round(n);
      };

      // Map FE room types to DB-valid room types
      // DB CHECK constraint allows: bedroom, bathroom, kitchen, living_room, dining_room, office, storage, utility, hallway, lobby, stairwell, other
      const roomTypeMap: Record<string, string> = {
        'bedroom': 'bedroom', 'bathroom': 'bathroom', 'kitchen': 'kitchen',
        'living': 'living_room', 'dining': 'dining_room', 'office': 'office',
        'storage': 'storage', 'utility': 'utility', 'hallway': 'hallway',
        'lobby': 'lobby', 'stairwell': 'stairwell',
        // FE types that need mapping
        'common': 'other', 'stairs': 'stairwell', 'elevator': 'other',
        'corridor': 'hallway', 'closet': 'storage', 'entry': 'lobby',
        'garage': 'other', 'outdoor': 'other', 'recreation': 'other',
        'exit': 'other', 'living_room': 'living_room', 'dining_room': 'dining_room',
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

        const roomType = roomTypeMap[props.room_type] || 'other';
        const geomJson = JSON.stringify(geom);
        const result = await queryRunner.query(`
          INSERT INTO room (name, type, floor_id, geometry, color, area_sqm, centroid, created_at, updated_at)
          VALUES ($1, $2, $3,
            ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($4), 4326), 3857),
            $5,
            ST_Area(ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($4), 4326), 3857)),
            ST_Centroid(ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($4), 4326), 3857)),
            NOW(), NOW())
          RETURNING id
        `, [props.name || 'Unnamed Room', roomType, floorId, geomJson, props.color || null]);

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

        const roomType = roomTypeMap[props.room_type] || 'other';
        const geomJson = JSON.stringify(geom);
        const result = await queryRunner.query(`
          UPDATE room SET name = $1, type = $2, floor_id = $3,
            geometry = ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($4), 4326), 3857),
            color = $5,
            area_sqm = ST_Area(ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($4), 4326), 3857)),
            centroid = ST_Centroid(ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($4), 4326), 3857)),
            updated_at = NOW()
          WHERE id = $6
          RETURNING id
        `, [props.name || 'Unnamed Room', roomType, floorId, geomJson, props.color || null, toInt(props.db_id)]);
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

      // Helper to insert opening_rooms connections
      const insertOpeningRoomConnections = async (openingDbId: number, props: any) => {
        const connects = props.connects || [];
        const connectsDbIds = props.connects_db_ids || [];
        for (let i = 0; i < connects.length; i++) {
          // Prefer pre-resolved DB ID, then check idMappings for newly added rooms
          const roomDbId = toInt(connectsDbIds[i]) || idMappings.rooms[connects[i]] || null;
          if (roomDbId) {
            try {
              await queryRunner.query(
                `INSERT INTO opening_rooms (opening_id, room_id, created_at) VALUES ($1, $2, NOW())`,
                [openingDbId, roomDbId]
              );
            } catch (err) {
              warnings.push(`Failed to connect opening ${openingDbId} to room ${roomDbId}: ${(err as Error).message}`);
            }
          }
        }
      };

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

        const openingType = props.opening_type || 'door';
        const isEmergencyExit = openingType === 'emergency_exit' || openingType === 'main_entrance';
        const result = await queryRunner.query(`
          INSERT INTO opening (floor_id, opening_type, geometry, name, is_emergency_exit, width_meters, created_at, updated_at)
          VALUES ($1, $2, ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($3), 4326), 3857), $4, $5, $6, NOW(), NOW())
          RETURNING id
        `, [floorId, openingType, JSON.stringify(geom), props.name || null, isEmergencyExit, props.width_meters || null]);

        if (result.length > 0) {
          const openingDbId = result[0].id;
          if (props.id) {
            idMappings.openings[props.id] = openingDbId;
          }
          // Insert opening_rooms connections
          await insertOpeningRoomConnections(openingDbId, props);
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

        const openingType = props.opening_type || 'door';
        const isEmergencyExit = openingType === 'emergency_exit' || openingType === 'main_entrance';
        const result = await queryRunner.query(`
          UPDATE opening SET floor_id = $1, opening_type = $2,
            geometry = ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($3), 4326), 3857),
            is_emergency_exit = $4, name = $5, width_meters = $6, updated_at = NOW()
          WHERE id = $7
          RETURNING id
        `, [floorId, openingType, JSON.stringify(geom), isEmergencyExit, props.name || null, props.width_meters || null, toInt(props.db_id)]);
        if (result.length > 0) {
          // Re-create opening_rooms connections (delete old, insert new)
          const openingDbIdInt = toInt(props.db_id);
          await queryRunner.query(`DELETE FROM opening_rooms WHERE opening_id = $1`, [openingDbIdInt]);
          await insertOpeningRoomConnections(openingDbIdInt, props);
          stats.openings.modified++;
        }
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

      // Helper to resolve a frontend room ID to a database room ID (always returns integer or null)
      const resolveRoomDbId = (frontendRoomId: string | undefined, dbId: number | string | undefined): number | null => {
        // Prefer the pre-resolved DB ID from frontend
        if (dbId !== null && dbId !== undefined) {
          const n = toInt(dbId);
          if (n !== null) return n;
        }
        if (!frontendRoomId) return null;
        // Check if this room was newly added in this save
        if (idMappings.rooms[frontendRoomId]) return idMappings.rooms[frontendRoomId];
        // Check if it's already a numeric DB ID
        const parsed = parseInt(String(frontendRoomId), 10);
        if (!isNaN(parsed)) return parsed;
        return null;
      };

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

        const roomDbId = resolveRoomDbId(props.linked_room_id, props.linked_room_db_id);
        const cameraCode = `B${buildingId}_${props.camera_id || `CAM_${Date.now()}_${stats.cameras.added}`}`;
        const result = await queryRunner.query(`
          INSERT INTO camera (name, camera_id, rtsp_url, building_id, floor_id, room_id, status, is_fire_detection_enabled, geometry, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, 'active', $7, ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($8), 4326), 3857), NOW(), NOW())
          RETURNING id
        `, [props.name || 'Camera', cameraCode, props.rtsp_url || '', buildingId, floorId, roomDbId, props.is_fire_detection_enabled !== false, JSON.stringify(geom)]);

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

        const roomDbId = resolveRoomDbId(props.linked_room_id, props.linked_room_db_id);
        const result = await queryRunner.query(`
          UPDATE camera SET name = $1, rtsp_url = $2, floor_id = $3,
            room_id = $4, is_fire_detection_enabled = $5,
            geometry = ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($6), 4326), 3857),
            updated_at = NOW()
          WHERE id = $7
          RETURNING id
        `, [props.name, props.rtsp_url || '', floorId, roomDbId, props.is_fire_detection_enabled !== false, JSON.stringify(geom), toInt(props.db_id)]);
        if (result.length > 0) stats.cameras.modified++;
      }

      // ==================== GET ALL FLOOR IDS ====================
      const allFloorsResult = await queryRunner.query(
        `SELECT id FROM floor WHERE building_id = $1`,
        [buildingId]
      );
      const allFloorIds = allFloorsResult.map((f: any) => f.id);

      // Node type mapping (shared between routing nodes and safe point nodes)
      // DB CHECK allows: room, corridor, staircase, elevator, exit, entrance, junction, door, window, other
      const nodeTypeMap: Record<string, string> = {
        'room_centroid': 'room', 'centroid': 'room', 'room': 'room',
        'opening_midpoint': 'door', 'door': 'door', 'arch': 'door',
        'waypoint': 'junction', 'junction': 'junction',
        'exit': 'exit', 'entrance': 'entrance',
        'emergency_exit': 'exit', 'fire_exit': 'exit',
        'main_entrance': 'entrance',
        'staircase': 'staircase', 'stairs': 'staircase', 'stairwell': 'staircase',
        'elevator': 'elevator', 'corridor': 'corridor', 'hallway': 'corridor',
        'window': 'window', 'safe_point': 'other',
        // FE room types → node types
        'common': 'room', 'living': 'room', 'dining': 'room', 'bathroom': 'room',
        'kitchen': 'room', 'bedroom': 'room', 'storage': 'room', 'utility': 'room',
        'office': 'room', 'lobby': 'room', 'outdoor': 'exit',
        'garage': 'room', 'closet': 'room', 'entry': 'entrance', 'recreation': 'room',
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
        const routingGraphNodes = differential.routingGraph?.nodes || [];
        const routingGraphEdges = differential.routingGraph?.edges || [];
        console.log(`[DifferentialSave] Routing graph received: ${routingGraphNodes.length} nodes, ${routingGraphEdges.length} edges`);

        let nodesSkipped = { noCoords: 0, noFloor: 0, insertFailed: 0 };
        if (Array.isArray(routingGraphNodes) && routingGraphNodes.length > 0) {
          for (const node of routingGraphNodes) {
            // Use proper null/NaN check (not falsy - 0 is a valid coordinate)
            if (node.lng == null || node.lat == null || isNaN(Number(node.lng)) || isNaN(Number(node.lat))) {
              nodesSkipped.noCoords++;
              continue;
            }
            const level = node.level || '1';
            const floorId = await getFloorId(level);
            if (!floorId) {
              nodesSkipped.noFloor++;
              continue;
            }

            const nodeType = nodeTypeMap[node.type] || 'other';
            // Resolve room_id: prefer DB ID from frontend, then check idMappings for newly added rooms
            const roomDbId = resolveRoomDbId(node.room_id, node.room_db_id);
            const geomJson = JSON.stringify({ type: 'Point', coordinates: [node.lng, node.lat] });
            const result = await queryRunner.query(`
              INSERT INTO nodes (floor_id, room_id, type, geometry, created_at, updated_at)
              VALUES ($1, $2, $3, ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($4), 4326), 3857), NOW(), NOW())
              RETURNING id
            `, [floorId, roomDbId, nodeType, geomJson]);

            if (result.length > 0) {
              nodeMap[node.id] = result[0].id;
              stats.nodes++;
            } else {
              nodesSkipped.insertFailed++;
            }
          }
        }
        console.log(`[DifferentialSave] Nodes inserted: ${stats.nodes}, skipped: noCoords=${nodesSkipped.noCoords}, noFloor=${nodesSkipped.noFloor}, insertFailed=${nodesSkipped.insertFailed}`);
        const nodeMapKeys = Object.keys(nodeMap);
        console.log(`[DifferentialSave] nodeMap has ${nodeMapKeys.length} entries, first 5 keys:`, nodeMapKeys.slice(0, 5));
        if (routingGraphEdges.length > 0) {
          console.log(`[DifferentialSave] First 3 edge source/targets:`, routingGraphEdges.slice(0, 3).map((e: any) => ({ source: e.source, target: e.target, type: e.type })));
        }

        // Insert edges
        let edgesSkipped = { noSourceTarget: 0, noSourceTargetNode: 0 };
        if (Array.isArray(routingGraphEdges) && routingGraphEdges.length > 0) {
          for (const edge of routingGraphEdges) {
            const sourceDbId = nodeMap[edge.source];
            const targetDbId = nodeMap[edge.target];
            if (!sourceDbId || !targetDbId) {
              edgesSkipped.noSourceTarget++;
              if (edgesSkipped.noSourceTarget <= 5) {
                console.log(`[DifferentialSave] Edge skipped: source=${edge.source} (dbId=${sourceDbId}), target=${edge.target} (dbId=${targetDbId})`);
              }
              continue;
            }

            const sourceNode = routingGraphNodes.find((n: any) => n.id === edge.source);
            const targetNode = routingGraphNodes.find((n: any) => n.id === edge.target);
            if (!sourceNode || !targetNode) {
              edgesSkipped.noSourceTargetNode++;
              continue;
            }

            const geomJson = JSON.stringify({
              type: 'LineString',
              coordinates: [[sourceNode.lng, sourceNode.lat], [targetNode.lng, targetNode.lat]]
            });

            // Map edge type from routing graph
            let edgeType = 'corridor';
            if (edge.type === 'vertical_connection') {
              edgeType = edge.connection_type === 'elevator' ? 'elevator' : 'staircase';
            }

            await queryRunner.query(`
              INSERT INTO edges (source_id, target_id, edge_type, cost, geometry, created_at, updated_at)
              VALUES ($1, $2, $3, $4, ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($5), 4326), 3857), NOW(), NOW())
            `, [sourceDbId, targetDbId, edgeType, Math.max(1, Math.round(edge.distance || 1)), geomJson]);
            stats.edges++;
          }
        }
        console.log(`[DifferentialSave] Edges inserted: ${stats.edges}, skipped: noSourceTarget=${edgesSkipped.noSourceTarget}, noSourceTargetNode=${edgesSkipped.noSourceTargetNode}`);
      }

      
      // ==================== DIFFERENTIAL SENSORS PROCESSING ====================
      if (allFloorIds.length > 0 && changes.sensors) {
        // PROCESS DELETIONS
        for (const dbIdStr of changes.sensors.deleted) {
          const dbId = parseInt(dbIdStr, 10);
          if (!isNaN(dbId)) {
            await queryRunner.query(`DELETE FROM "sensors" WHERE id = $1`, [dbId]);
            stats.sensors.deleted++;
          }
        }

        // PROCESS ADDITIONS
        for (const feature of changes.sensors.added) {
          const props = feature.properties;
          
          // NEW: If db_id is present, it means we are mapping a NEW map element to an EXISTING hardware sensor.
          // In this case, we should UPDATE the existing sensor's building/floor/room instead of INSERTING.
          if (props?.db_id) {
            const dbId = parseInt(props.db_id, 10);
            const level = props?.level || '1';
            const floorId = await getFloorId(level);
            const roomId = props?.linked_room_db_id ? parseInt(props?.linked_room_db_id) : null;
            
            await queryRunner.query(`
              UPDATE "sensors" SET
                room_id = $1,
                floor_id = $2,
                building_id = $3,
                hardware_uid = $4,
                updated_at = NOW()
              WHERE id = $5
            `, [roomId, floorId, buildingId, props?.hardware_uid || null, dbId]);
            
            idMappings.sensors[props.id] = dbId;
            stats.sensors.added++;
            continue;
          }

          const level = props?.level || '1';
          const floorId = await getFloorId(level);
          if (!floorId) {
            warnings.push(`Sensor ${props?.name || props?.id}: could not get floor for level ${level}`);
            continue;
          }

          const roomId = props?.linked_room_db_id ? parseInt(props?.linked_room_db_id) : null;
          
          const result = await queryRunner.query(`
            INSERT INTO "sensors" (name, type, status, unit, value, room_id, floor_id, building_id, hardware_uid, created_at, updated_at)
            VALUES ($1, $2, 'active', $3, 0, $4, $5, $6, $7, NOW(), NOW())
            RETURNING id
          `, [
            props?.name || 'New Sensor',
            props?.sensor_type || 'gas',
            props?.unit || 'ppm',
            roomId,
            floorId,
            buildingId,
            props?.hardware_uid || null
          ]);
          
          if (result.length > 0) {
            idMappings.sensors[props.id] = result[0].id;
            stats.sensors.added++;
          }
        }

        // PROCESS MODIFICATIONS
        for (const feature of changes.sensors.modified) {
          const props = feature.properties;
          if (!props?.db_id) continue;
          
          const dbId = toInt(props.db_id);
          const level = props.level || '1';
          const floorId = await getFloorId(level);
          const roomId = props?.linked_room_db_id ? parseInt(props?.linked_room_db_id) : null;

          await queryRunner.query(`
            UPDATE "sensors" SET
              name = $1,
              type = $2,
              unit = $3,
              room_id = $4,
              floor_id = $5,
              hardware_uid = $6,
              updated_at = NOW()
            WHERE id = $7
          `, [
            props?.name || 'Sensor',
            props?.sensor_type || 'gas',
            props?.unit || 'ppm',
            roomId,
            floorId,
            props?.hardware_uid || null,
            dbId
          ]);
          stats.sensors.modified++;
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
          `, [nodeId, floorId, toInt(props?.capacity) || 4, 1]);

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
          const spDbId = toInt(props.db_id);
          const existingSp = await queryRunner.query(`SELECT node_id FROM safe_points WHERE id = $1`, [spDbId]);
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
          `, [toInt(props.capacity) || 4, floorId, spDbId]);

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

        
        // Inject db_id into sensors
        if (updatedEditorState.sensors && Array.isArray(updatedEditorState.sensors)) {
          updatedEditorState.sensors = updatedEditorState.sensors.map((sen: any) => {
            if (idMappings.sensors[sen.id]) {
              return { ...sen, db_id: idMappings.sensors[sen.id] };
            }
            return sen;
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
      console.error('[DifferentialSave] Stats at failure:', JSON.stringify(stats));
      console.error('[DifferentialSave] Warnings at failure:', warnings);
      return { success: false, error: error.message, warnings };
    } finally {
      await queryRunner.release();
    }
  }

  @Post('migrate-access-level')
  @Public()
  async migrateAccessLevel(@Body() body?: { building_id?: number; access_level?: string }) {
    try {
      await this.dataSource.query(`ALTER TABLE building ADD COLUMN IF NOT EXISTS access_level VARCHAR(20) DEFAULT 'private'`);
      // Optionally update a specific building's access level
      if (body?.building_id && body?.access_level) {
        await this.dataSource.query(
          `UPDATE building SET access_level = $1 WHERE id = $2`,
          [body.access_level, body.building_id],
        );
        return { message: `Building ${body.building_id} set to ${body.access_level}` };
      }
      return { message: 'access_level column added successfully' };
    } catch (e) {
      return { message: 'Column may already exist', error: e.message };
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
