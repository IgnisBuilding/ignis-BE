import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { apartment } from './apartment.entity';

@Entity('residents')
export class Resident {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ unique: true })
  email: string;

  @Column()
  phone: string;

  @Column({ name: 'apartment_id', nullable: true })
  apartmentId: number;

  @ManyToOne(() => apartment, { nullable: true })
  @JoinColumn({ name: 'apartment_id' })
  apartment: apartment;

  @Column({ default: 'resident' })
  type: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'emergency_contact', nullable: true })
  emergencyContact: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
