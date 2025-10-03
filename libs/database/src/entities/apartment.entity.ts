import { Entity, PrimaryGeneratedColumn, Column, JoinColumn, ManyToOne } from 'typeorm';
import { floor } from './floor.entity';

@Entity()
export class apartment {
    @PrimaryGeneratedColumn()
    id: number;
    
    @Column()
    unit_number: string;

    @ManyToOne(()=>floor)
    @JoinColumn({ name: 'floor_id' })
    floor: floor;

    @Column({ type: 'boolean', default: false })
    occupied: boolean;

    //Needed to be updated when user table is created
    @Column()
    owner_id: number;

    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
    created_at: Date;

    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
    updated_at: Date;
}  