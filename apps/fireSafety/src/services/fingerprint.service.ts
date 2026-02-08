import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Fingerprint } from '@app/entities';

@Injectable()
export class FingerprintService {
  constructor(
    @InjectRepository(Fingerprint)
    private fingerprintRepo: Repository<Fingerprint>,
  ) {}

  async uploadBatch(fingerprints: Partial<Fingerprint>[]): Promise<{ uploaded: number; failed: number; errors: string[] }> {
    let uploaded = 0;
    const errors: string[] = [];

    for (const fp of fingerprints) {
      try {
        const entity = this.fingerprintRepo.create({
          buildingId: fp.buildingId,
          floorId: fp.floorId,
          x: fp.x,
          y: fp.y,
          label: fp.label,
          signals: fp.signals,
          collectedAt: fp.collectedAt || new Date(),
        });
        await this.fingerprintRepo.save(entity);
        uploaded++;
      } catch (e) {
        errors.push(e.message);
      }
    }

    return { uploaded, failed: errors.length, errors: errors.length > 0 ? errors : undefined };
  }

  async findByBuilding(buildingId: number): Promise<Fingerprint[]> {
    return this.fingerprintRepo.find({
      where: { buildingId },
      order: { createdAt: 'DESC' },
    });
  }

  async delete(id: string): Promise<void> {
    await this.fingerprintRepo.delete(id);
  }
}
