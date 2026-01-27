import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { trapped_occupants } from './trapped_occupants.entity';
import { hazards } from './hazards.entity';

@Entity('trapped_occupant_blocking_hazards')
export class TrappedOccupantBlockingHazard {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'trapped_occupant_id' })
  trappedOccupantId: number;

  @ManyToOne(() => trapped_occupants, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'trapped_occupant_id' })
  trappedOccupant: trapped_occupants;

  @Column({ name: 'hazard_id' })
  hazardId: number;

  @ManyToOne(() => hazards, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'hazard_id' })
  hazard: hazards;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
