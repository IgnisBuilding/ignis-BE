import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { room } from './room.entity';
import { floor } from './floor.entity';
import { building } from './building.entity';
import { nodes } from './nodes.entity';

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

    @Column({ name: 'warning_threshold', type: 'float', nullable: true })
    warningThreshold: number | null;

    @Column({ name: 'alert_threshold', type: 'float', nullable: true })
    alertThreshold: number | null;

    @Column({ name: 'room_id', nullable: true })
    roomId: number;

    @ManyToOne(() => room, { nullable: true })
    @JoinColumn({ name: 'room_id' })
    room: room;

    @Column({ name: 'floor_id', nullable: true })
    floorId: number;

    @ManyToOne(() => floor, { nullable: true })
    @JoinColumn({ name: 'floor_id' })
    floor: floor;

    @Column({ name: 'building_id', nullable: true })
    buildingId: number;

    @ManyToOne(() => building, { nullable: true })
    @JoinColumn({ name: 'building_id' })
    building: building;

    @Column({ name: 'node_id', nullable: true })
    nodeId: number;

    @ManyToOne(() => nodes, { nullable: true })
    @JoinColumn({ name: 'node_id' })
    node: nodes;

    @Column({ type: 'geometry', spatialFeatureType: 'Point', srid: 3857, nullable: true })
    geometry: string;

    @Column({ name: 'hardware_uid', nullable: true })
    hardwareUid: string;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;

    @Column({ name: 'last_reading', type: 'timestamp', nullable: true })
    lastReading: Date;

    @Column({ name: 'last_logged_value', type: 'numeric', precision: 10, scale: 2, nullable: true })
    lastLoggedValue: number | null;

    @Column({ name: 'last_logged_at', type: 'timestamp', nullable: true })
    lastLoggedAt: Date | null;
}
