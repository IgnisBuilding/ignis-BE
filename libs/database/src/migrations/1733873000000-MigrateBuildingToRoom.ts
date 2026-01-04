import { MigrationInterface, QueryRunner } from "typeorm";

export class MigrateBuildingToRoom1733873000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        // Check if Floor 2 exists, if not create it
        const floorExists = await queryRunner.query(`SELECT id FROM floor WHERE level = 2 LIMIT 1;`);
        
        let floor2Id = 2; // Default to existing First Floor (level=1)
        
        if (!floorExists || floorExists.length === 0) {
            // Create Floor 2 (Second Floor with level=2) with building_id and geometry
            await queryRunner.query(`
                INSERT INTO floor (id, name, level, building_id, geometry, created_at, updated_at)
                SELECT 4, 'Second Floor', 2, 1, 
                    ST_GeomFromText('POLYGON((7468250 2843200, 7468300 2843200, 7468300 2843250, 7468250 2843250, 7468250 2843200))', 3857),
                    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP;
            `);
            floor2Id = 4;
        } else {
            floor2Id = floorExists[0].id;
        }

        // Create a default apartment for these rooms if needed
        // Using apartment_id = 1 (GH-10 on First Floor)
        
        // Migrate data from building table to room table
        // Floor 1 → floor_id = 2 (First Floor with level=1)
        // Floor 2 → floor_id = floor2Id (dynamically determined)
        await queryRunner.query(`
            INSERT INTO room (name, type, geometry, apartment_id, floor_id, created_at, updated_at)
            SELECT 
                b.name,
                b.type,
                b.geometry,
                1 as apartment_id,  -- Default apartment (GH-10)
                CASE 
                    WHEN b.address = 'Floor 1' THEN 2
                    WHEN b.address = 'Floor 2' THEN ${floor2Id}
                    ELSE 2
                END as floor_id,
                b.created_at,
                b.updated_at
            FROM building b
            WHERE b.society_id = 1
                AND NOT EXISTS (
                    SELECT 1 FROM room r 
                    WHERE r.name = b.name 
                        AND r.floor_id = CASE 
                            WHEN b.address = 'Floor 1' THEN 2
                            WHEN b.address = 'Floor 2' THEN ${floor2Id}
                            ELSE 2
                        END
                );
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Remove the migrated rooms
        await queryRunner.query(`
            DELETE FROM room 
            WHERE apartment_id = 1 
            AND name IN (
                '2-Car Garage', 'Down to Basement', 'Mud Room', 'Walk-In', 'Pantry', 'Kitchen',
                'Dining Room', 'Living Room', 'Covered Porch', 'Bedroom 2', 'Office/Den', 'Foyer',
                'Stoop', 'Shower Room', 'Laundry Room', 'Master Suite', 'Master Bath', 'His Walk-In',
                'Hers Walk-In', 'Stairs to Floor 2', 'Lockers', 'Linen', 'Seat', 'Shelves',
                'Upper Hall', 'Bedroom 3', 'Bedroom 4', 'Bonus Room', 'Upper Bath', 'Storage',
                'Stairs from Floor 1'
            );
        `);
        
        // Optionally remove the Second Floor if it was created
        await queryRunner.query(`
            DELETE FROM floor WHERE id = 4 AND level = 2 AND name = 'Second Floor';
        `);
    }
}
