import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { User } from './user.entity';

@Entity('notification')
export class Notification {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'user_id', nullable: true })
  userId: number | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ default: 'Notification' })
  title: string;

  @Column()
  type: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ default: 'medium' })
  priority: string;

  @Column({ name: 'role_target', nullable: true })
  roleTarget: string | null;

  @Column({ type: 'varchar', default: 'unread' })
  status: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
