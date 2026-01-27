import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSpatialIndexes1706300000003 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add spatial indexes for faster geometry queries
    // Using IF NOT EXISTS to avoid errors if indexes already exist

    // Building geometry index
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_building_geometry
      ON public.building USING GIST (geometry)
    `);

    // Floor geometry index
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_floor_geometry
      ON public.floor USING GIST (geometry)
    `);

    // Room geometry index
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_room_geometry
      ON public.room USING GIST (geometry)
    `);

    // Nodes geometry index
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_nodes_geometry
      ON public.nodes USING GIST (geometry)
    `);

    // Edges geometry index
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_edges_geometry
      ON public.edges USING GIST (geometry)
    `);

    // Exits geometry index
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_exits_geometry
      ON public.exits USING GIST (geometry)
    `);

    // Camera geometry index (Point)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_camera_geometry
      ON public.camera USING GIST (geometry)
    `);

    // Apartment geometry index (if exists)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_apartment_geometry
      ON public.apartment USING GIST (geometry)
    `);

    console.log('Added GIST spatial indexes for all geometry columns');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop spatial indexes
    await queryRunner.query(`DROP INDEX IF EXISTS idx_apartment_geometry`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_camera_geometry`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_exits_geometry`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_edges_geometry`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_nodes_geometry`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_room_geometry`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_floor_geometry`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_building_geometry`);

    console.log('Dropped GIST spatial indexes');
  }
}
