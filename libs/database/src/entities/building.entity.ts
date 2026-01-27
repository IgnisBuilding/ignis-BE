import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class building {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column()
  type: string;

  @Column()
  address: string;

  @Column({ type: 'geometry', spatialFeatureType: 'Polygon', srid: 3857, nullable: true })
  geometry: string;

  @Column({ nullable: true })
  society_id: number;

  @Column({ name: 'scale_pixels_per_meter', type: 'numeric', precision: 12, scale: 6, nullable: true })
  scalePixelsPerMeter: number;

  @Column({ name: 'center_lat', type: 'numeric', precision: 12, scale: 8, nullable: true })
  centerLat: number;

  @Column({ name: 'center_lng', type: 'numeric', precision: 12, scale: 8, nullable: true })
  centerLng: number;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date;

  @Column({
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
  })
  updated_at: Date;
}
