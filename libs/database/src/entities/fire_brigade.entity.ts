import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { FireBrigadeState } from './fire_brigade_state.entity';
import { Employee } from './employee.entity';
import { User } from './user.entity';

@Entity('fire_brigade')
export class FireBrigade {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'user_id', nullable: true })
  userId: number;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column()
  name: string;

  @Column()
  location: string;

  @Column({ default: 'active' })
  status: string;

  @Column({ name: 'state_id', nullable: true })
  stateId: number;

  @ManyToOne(() => FireBrigadeState, (state) => state.brigades, { nullable: true })
  @JoinColumn({ name: 'state_id' })
  stateOffice: FireBrigadeState;

  @Column({ nullable: true })
  address: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ nullable: true })
  email: string;

  @Column({ default: 10 })
  capacity: number;

  @OneToMany(() => Employee, (employee) => employee.brigade)
  employees: Employee[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
