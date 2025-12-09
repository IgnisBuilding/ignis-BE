import { Injectable, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class DatabaseService implements OnModuleInit {
  constructor(private dataSource: DataSource) {}
  async onModuleInit() {
    try {
      await this.dataSource.query('SELECT 1'); // simple query
      console.log('✅ Database connection successful');
    } catch (err) {
      console.error('❌ Database connection failed:', err);
    }
  }
}
