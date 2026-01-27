import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { floor } from './floor.entity';
import { User } from './user.entity';
import { room } from './room.entity';

@Entity()
export class apartment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  unit_number: string;

  @Column()
  floor_id: number;

  @ManyToOne(() => floor, (floor) => floor.apartments)
  @JoinColumn({ name: 'floor_id' })
  floor: floor;

  @ManyToOne(() => User, (user) => user.ownedApartments, { nullable: true })
  @JoinColumn({ name: 'owner_id' })
  owner: User;

  @Column({ name: 'owner_id', nullable: true })
  ownerId: number;

  @Column({ type: 'boolean', default: false })
  occupied: boolean;

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

  @OneToMany(() => room, (room) => room.apartment)
  rooms: room[];

  // Residents are now stored in users table with role='resident' and apartment_id FK
  @OneToMany(() => User, (user) => user.apartment)
  residents: User[];
}
