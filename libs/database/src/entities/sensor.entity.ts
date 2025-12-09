import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { room } from './room.entity';

@Entity('sensors')
export class Sensor {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    name: string;

    @Column()
    type: string;

    @Column({ type: 'float' })
    value: number;

    @Column()
    unit: string;

    @Column()
    status: string;

    @Column({ name: 'room_id', nullable: true })
    roomId: number;

    @ManyToOne(() => room, { nullable: true })
    @JoinColumn({ name: 'room_id' })
    room: room;

    @Column({ type: 'float', nullable: true })
    latitude: number;

    @Column({ type: 'float', nullable: true })
    longitude: number;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;

    @Column({ name: 'last_reading', type: 'timestamp', nullable: true })
    lastReading: Date;
}  