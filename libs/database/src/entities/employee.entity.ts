import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { User } from './user.entity';
import { FireBrigade } from './fire_brigade.entity';
import { FireBrigadeState } from './fire_brigade_state.entity';
import { FireBrigadeHQ } from './fire_brigade_hq.entity';

@Entity('employee')
export class Employee {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'user_id' })
  userId: number;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'brigade_id', nullable: true })
  brigadeId: number;

  @ManyToOne(() => FireBrigade, (brigade) => brigade.employees, { nullable: true })
  @JoinColumn({ name: 'brigade_id' })
  brigade: FireBrigade;

  @Column({ name: 'state_id', nullable: true })
  stateId: number;

  @ManyToOne(() => FireBrigadeState, (state) => state.employees, { nullable: true })
  @JoinColumn({ name: 'state_id' })
  state: FireBrigadeState;

  @Column({ name: 'hq_id', nullable: true })
  hqId: number;

  @ManyToOne(() => FireBrigadeHQ, (hq) => hq.employees, { nullable: true })
  @JoinColumn({ name: 'hq_id' })
  hq: FireBrigadeHQ;

  @Column({ default: 'active' })
  status: string;

  @Column({ nullable: true })
  position: string;

  @Column({ nullable: true })
  rank: string;

  @Column({ name: 'badge_number', nullable: true })
  badgeNumber: string;

  @Column({ name: 'hire_date', type: 'date', nullable: true })
  hireDate: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
