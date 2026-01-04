import { MigrationInterface, QueryRunner } from "typeorm";

export class AddHazardData1765419994258 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Delete all existing hazards
        await queryRunner.query(`DELETE FROM hazards`);

        // Get existing apartment IDs
        const apartments = await queryRunner.query(`SELECT id FROM apartment ORDER BY id LIMIT 4`);
        
        if (apartments.length === 0) {
            console.log('No apartments found, skipping hazard insertion');
            return;
        }

        // Use the first 4 apartment IDs that exist
        const apt1 = apartments[0]?.id;
        const apt2 = apartments[1]?.id || apt1;
        const apt3 = apartments[2]?.id || apt1;
        const apt4 = apartments[3]?.id || apt1;

        // Insert 4 active hazards with valid apartment_id
        await queryRunner.query(`
            INSERT INTO hazards (type, severity, status, description, apartment_id, created_at, updated_at) 
            VALUES
                ('FIRE', 'CRITICAL', 'ACTIVE', 'Major fire in kitchen - immediate evacuation required', ${apt1}, NOW() - INTERVAL '8 minutes', NOW() - INTERVAL '8 minutes'),
                ('FIRE', 'HIGH', 'ACTIVE', 'Electrical fire spreading in living room', ${apt2}, NOW() - INTERVAL '12 minutes', NOW() - INTERVAL '12 minutes'),
                ('SMOKE', 'MEDIUM', 'ACTIVE', 'Heavy smoke detected in bedroom area', ${apt3}, NOW() - INTERVAL '15 minutes', NOW() - INTERVAL '15 minutes'),
                ('FIRE', 'HIGH', 'RESPONDED', 'Fire in garage - firefighters on scene', ${apt4}, NOW() - INTERVAL '20 minutes', NOW() - INTERVAL '5 minutes')
        `);

        // Update responded timestamp for responded hazard
        await queryRunner.query(`
            UPDATE hazards 
            SET responded_at = NOW() - INTERVAL '5 minutes' 
            WHERE status = 'RESPONDED' AND responded_at IS NULL
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Remove the hazards we added
        await queryRunner.query(`DELETE FROM hazards WHERE apartment_id IN (1, 2, 3, 4)`);
    }

}
