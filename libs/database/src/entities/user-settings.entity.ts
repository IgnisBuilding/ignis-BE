import { Entity, PrimaryGeneratedColumn, Column, OneToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { User } from './user.entity';

@Entity('user_settings')
export class UserSettings {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'user_id', unique: true })
  userId: number;

  @OneToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ default: 'light' })
  theme: string;

  @Column({ default: 'en' })
  language: string;

  @Column({ name: 'notify_push', default: true })
  notifyPush: boolean;

  @Column({ name: 'notify_email', default: true })
  notifyEmail: boolean;

  @Column({ name: 'notify_sms', default: true })
  notifySms: boolean;

  @Column({ name: 'notify_maintenance', default: true })
  notifyMaintenance: boolean;

  @Column({ name: 'notify_community', default: false })
  notifyCommunity: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
