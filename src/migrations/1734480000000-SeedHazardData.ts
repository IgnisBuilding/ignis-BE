import { MigrationInterface, QueryRunner } from "typeorm";

export class SeedHazardData1734480000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        // Insert sample hazard data
        await queryRunner.query(`
            INSERT INTO hazards (type, apartment_id, node_id, severity, status, created_at, updated_at) VALUES
            ('fire', 1, 1, 'critical', 'active', NOW() - INTERVAL '30 minutes', NOW()),
            ('fire', 2, 2, 'high', 'responding', NOW() - INTERVAL '1 hour', NOW()),
            ('smoke', 3, 3, 'medium', 'reported', NOW() - INTERVAL '15 minutes', NOW()),
            ('fire', 4, 4, 'critical', 'active', NOW() - INTERVAL '45 minutes', NOW()),
            ('gas_leak', 5, 5, 'high', 'responding', NOW() - INTERVAL '2 hours', NOW()),
            ('fire', 6, 6, 'low', 'resolved', NOW() - INTERVAL '3 hours', NOW()),
            ('smoke', 7, 7, 'medium', 'reported', NOW() - INTERVAL '20 minutes', NOW()),
            ('fire', 8, 8, 'critical', 'active', NOW() - INTERVAL '10 minutes', NOW()),
            ('electrical', 9, 9, 'medium', 'responding', NOW() - INTERVAL '1.5 hours', NOW()),
            ('fire', 10, 10, 'high', 'resolved', NOW() - INTERVAL '5 hours', NOW())
            ON CONFLICT DO NOTHING;
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DELETE FROM hazards WHERE type IN ('fire', 'smoke', 'gas_leak', 'electrical')`);
    }
}
