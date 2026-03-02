import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Opening } from './opening.entity';
import { room } from './room.entity';

@Entity('opening_rooms')
export class OpeningRoom {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'opening_id' })
  openingId: number;

  @ManyToOne(() => Opening, (opening) => opening.openingRooms, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'opening_id' })
  opening: Opening;

  @Column({ name: 'room_id' })
  roomId: number;

  @ManyToOne(() => room, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'room_id' })
  room: room;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
