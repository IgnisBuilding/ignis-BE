import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserSettings } from '@app/entities';
import { UpdateSettingsDto } from '../dto/settings.dto';

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(UserSettings)
    private readonly settingsRepo: Repository<UserSettings>,
  ) {}

  async getOrCreate(userId: number): Promise<UserSettings> {
    let settings = await this.settingsRepo.findOne({ where: { userId } });
    if (!settings) {
      settings = this.settingsRepo.create({ userId });
      settings = await this.settingsRepo.save(settings);
    }
    return settings;
  }

  async update(userId: number, dto: UpdateSettingsDto): Promise<UserSettings> {
    let settings = await this.getOrCreate(userId);
    Object.assign(settings, dto);
    return this.settingsRepo.save(settings);
  }
}
