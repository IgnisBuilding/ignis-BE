import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class payment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  bill_id: number;

  @Column()
  type: string;

  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date;

  @Column({
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
  })
  updated_at: Date;
}
