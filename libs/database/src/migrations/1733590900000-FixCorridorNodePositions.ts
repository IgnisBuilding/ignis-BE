import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Fix Corridor Node Positions
 *
 * This migration relocates corridor/junction nodes that are incorrectly
 * positioned inside room geometries. The nodes are moved to be just outside
 * the room boundaries while maintaining connectivity.
 *
 * Problem: Corridor nodes 42, 43, 44, 45, 52 are geometrically inside Bedroom 2
 * (lat 24.8612-24.8617), which causes fire blocking to either:
 * - Block valid escape routes (if we block all nodes in fire room)
 * - Allow routes through fire zones (if we don't block corridor nodes)
 *
 * Solution: Move these nodes northward (lat += 0.0002) so they're in the
 * corridor space between Bedroom 2 and Upper Hall.
 */
export class FixCorridorNodePositions1733590900000 implements MigrationInterface {
  name = 'FixCorridorNodePositions1733590900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Move corridor nodes that are inside Bedroom 2 northward
    // Bedroom 2 max lat is 24.8617, Upper Hall min lat is 24.8618
    // We'll place corridor nodes at lat ~24.86175 (between the two rooms)

    // The offset in EPSG:3857 (Web Mercator) for ~0.0002 degrees latitude
    // At this latitude, 0.0002 degrees ≈ 22 meters
    // In EPSG:3857, this is approximately 22 units in Y direction
    const yOffset = 25; // Move nodes 25 meters north in Web Mercator

    // Update corridor nodes that intersect with Bedroom 2
    await queryRunner.query(`
      UPDATE nodes
      SET geometry = ST_SetSRID(
        ST_MakePoint(
          ST_X(geometry),
          ST_Y(geometry) + ${yOffset}
        ),
        3857
      ),
      updated_at = NOW()
      WHERE id IN (
        -- Select corridor/junction nodes that are inside Bedroom 2
        SELECT n.id
        FROM nodes n
        JOIN room r ON ST_Intersects(n.geometry, r.geometry)
        WHERE r.name = 'Bedroom 2'
          AND n.node_category IN ('path_corridor', 'path_junction')
      )
    `);

    // Also update the edge geometries that connect to these nodes
    await queryRunner.query(`
      UPDATE edges
      SET geometry = ST_MakeLine(
        (SELECT geometry FROM nodes WHERE id = edges.source_id),
        (SELECT geometry FROM nodes WHERE id = edges.target_id)
      ),
      updated_at = NOW()
      WHERE source_id IN (42, 43, 44, 45, 52)
         OR target_id IN (42, 43, 44, 45, 52)
    `);

    // Log the changes
    await queryRunner.query(`
      SELECT n.id, n.type, n.node_category,
        ST_X(ST_Transform(n.geometry, 4326)) as new_lon,
        ST_Y(ST_Transform(n.geometry, 4326)) as new_lat
      FROM nodes n
      WHERE n.id IN (42, 43, 44, 45, 52)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Move nodes back south
    const yOffset = 25;

    await queryRunner.query(`
      UPDATE nodes
      SET geometry = ST_SetSRID(
        ST_MakePoint(
          ST_X(geometry),
          ST_Y(geometry) - ${yOffset}
        ),
        3857
      ),
      updated_at = NOW()
      WHERE id IN (42, 43, 44, 45, 52)
    `);

    // Restore edge geometries
    await queryRunner.query(`
      UPDATE edges
      SET geometry = ST_MakeLine(
        (SELECT geometry FROM nodes WHERE id = edges.source_id),
        (SELECT geometry FROM nodes WHERE id = edges.target_id)
      ),
      updated_at = NOW()
      WHERE source_id IN (42, 43, 44, 45, 52)
         OR target_id IN (42, 43, 44, 45, 52)
    `);
  }
}
