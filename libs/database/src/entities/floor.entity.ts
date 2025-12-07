import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class floor {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column('integer')
  level: number;

  @Column()
  building_id: number;

  @Column({ type: 'geometry', spatialFeatureType: 'Polygon', srid: 3857 })
  geometry: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date;

  @Column({
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
  })
  updated_at: Date;
}
