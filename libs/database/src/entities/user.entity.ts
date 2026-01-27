import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany, ManyToOne, JoinColumn } from 'typeorm';
import { apartment } from './apartment.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  email: string;

  @Column()
  password: string;

  @Column()
  name: string;

  @Column({ default: 'user' })
  role: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  // Fields merged from residents table
  @Column({ nullable: true })
  phone: string;

  @Column({ name: 'apartment_id', nullable: true })
  apartmentId: number;

  @ManyToOne(() => apartment, { nullable: true })
  @JoinColumn({ name: 'apartment_id' })
  apartment: apartment;

  @Column({ name: 'emergency_contact', nullable: true })
  emergencyContact: string;

  // Relation for apartments owned by this user
  @OneToMany(() => apartment, (apartment) => apartment.owner)
  ownedApartments: apartment[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
