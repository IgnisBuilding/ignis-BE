import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class notification {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  user_id: string;

  @Column()
  type: string;

  @Column({ type: 'date' })
  message: string;

  @Column({ type: 'date' })
  status: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date;

  @Column({
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
  })
  updated_at: Date;
}
