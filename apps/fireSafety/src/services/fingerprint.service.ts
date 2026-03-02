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
        // Handle both Android format (snake_case / different names) and web format (camelCase)
        const raw = fp as any;
        const entity = this.fingerprintRepo.create({
          buildingId: fp.buildingId ?? raw.building_id,
          floorId: fp.floorId ?? raw.floor_id,
          x: fp.x,
          y: fp.y,
          label: fp.label ?? raw.locationName,
          signals: fp.signals,
          collectedAt: fp.collectedAt ?? (raw.timestamp ? new Date(raw.timestamp) : new Date()),
        });
        await this.fingerprintRepo.save(entity);
        uploaded++;
      } catch (e) {
        errors.push(e.message);
      }
    }

    return { uploaded, failed: errors.length, errors: errors.length > 0 ? errors : undefined };
  }

  async findByBuilding(buildingId: number): Promise<any[]> {
    const fingerprints = await this.fingerprintRepo.find({
      where: { buildingId },
      relations: ['floor'],
      order: { createdAt: 'DESC' },
    });

    // Return both camelCase (web) and snake_case (Android) field names
    return fingerprints.map(fp => ({
      id: fp.id,
      buildingId: fp.buildingId,
      building_id: fp.buildingId,
      floorId: fp.floorId,
      floor_id: fp.floorId,
      floor: fp.floor?.level ?? 0,
      x: fp.x,
      y: fp.y,
      label: fp.label,
      locationName: fp.label || '',
      signals: fp.signals,
      collectedAt: fp.collectedAt,
      timestamp: fp.collectedAt ? new Date(fp.collectedAt).getTime() : 0,
    }));
  }

  async delete(id: string): Promise<void> {
    await this.fingerprintRepo.delete(id);
  }
}
