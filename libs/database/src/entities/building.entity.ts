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

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date;

  @Column({
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
  })
  updated_at: Date;
}
