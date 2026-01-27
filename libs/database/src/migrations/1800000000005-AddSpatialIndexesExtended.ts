import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSpatialIndexesExtended1800000000005 implements MigrationInterface {
  name = 'AddSpatialIndexesExtended1800000000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add spatial indexes for geometry columns that may not have them
    // Using IF NOT EXISTS to avoid errors if they already exist

    // Building geometry index
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_building_geometry"
      ON "building" USING GIST ("geometry")
    `);

    // Floor geometry index
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_floor_geometry"
      ON "floor" USING GIST ("geometry")
    `);

    // Apartment geometry index
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_apartment_geometry"
      ON "apartment" USING GIST ("geometry")
    `);

    // Room geometry index
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_room_geometry"
      ON "room" USING GIST ("geometry")
    `);

    // Nodes geometry index (critical for pathfinding queries)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_nodes_geometry"
      ON "nodes" USING GIST ("geometry")
    `);

    // Edges geometry index (for spatial routing queries)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_edges_geometry"
      ON "edges" USING GIST ("geometry")
    `);

    // Exits geometry index
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_exits_geometry"
      ON "exits" USING GIST ("geometry")
    `);

    // Features geometry index
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_features_geometry"
      ON "features" USING GIST ("geometry")
    `);

    // Camera geometry index
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_camera_geometry"
      ON "camera" USING GIST ("geometry")
    `);

    // Evacuation route path geometry index
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_evacuation_route_path"
      ON "evacuation_route" USING GIST ("path")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_evacuation_route_path"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_camera_geometry"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_features_geometry"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_exits_geometry"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_edges_geometry"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_nodes_geometry"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_room_geometry"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_apartment_geometry"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_floor_geometry"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_building_geometry"`);
  }
}
