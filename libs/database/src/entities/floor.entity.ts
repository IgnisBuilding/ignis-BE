import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { building } from './building.entity';
import { apartment } from './apartment.entity';

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

  @ManyToOne(() => building)
  @JoinColumn({ name: 'building_id' })
  building: building;

  @Column({ type: 'geometry', spatialFeatureType: 'Polygon', srid: 3857, nullable: true })
  geometry: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date;

  @Column({
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
  })
  updated_at: Date;

  @OneToMany(() => apartment, (apartment) => apartment.floor)
  apartments: apartment[];
}
