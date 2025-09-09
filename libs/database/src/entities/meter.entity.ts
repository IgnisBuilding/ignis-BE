import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class meter {
    @PrimaryGeneratedColumn()
    id: number;
    
    @Column()
    appartment_id: number;

    @Column()
    type: string;

    @Column({type: 'date'})
    installed_at: string;

    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
    created_at: Date;

    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
    updated_at: Date;
}  