import { Entity, PrimaryGeneratedColumn, Column, JoinColumn, ManyToOne } from 'typeorm';
import { floor } from './floor.entity';
import { User } from './user.entity';

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

    @ManyToOne(() => User, (user) => user.apartments, { nullable: true })
    @JoinColumn({ name: 'user_id' })
    user: User;

    @Column({ name: 'user_id', nullable: true })
    userId: number;

    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
    created_at: Date;

    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
    updated_at: Date;
}  