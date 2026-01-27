import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { FireBrigadeHQ } from './fire_brigade_hq.entity';
import { FireBrigade } from './fire_brigade.entity';
import { Employee } from './employee.entity';

@Entity('fire_brigade_state')
export class FireBrigadeState {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column()
  state: string;

  @Column({ name: 'hq_id', nullable: true })
  hqId: number;

  @ManyToOne(() => FireBrigadeHQ, (hq) => hq.states, { nullable: true })
  @JoinColumn({ name: 'hq_id' })
  hq: FireBrigadeHQ;

  @Column({ default: 'active' })
  status: string;

  @Column({ nullable: true })
  address: string;

  @Column({ nullable: true })
  phone: string;

  @OneToMany(() => FireBrigade, (brigade) => brigade.stateOffice)
  brigades: FireBrigade[];

  @OneToMany(() => Employee, (employee) => employee.state)
  employees: Employee[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
