import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { building, floor, hazards } from '@app/entities';
import { ResolvedScope } from '../context/interfaces/resolved-scope.interface';
import {
  SafetyTemplateContext,
  buildSafetyTemplate,
  SafetyTemplateRole,
} from './safety-templates';

type Language = 'en' | 'ur';

export interface SafetyEngineInput {
  userId: number | string;
  userRole: string;
  language: Language;
  message: string;
  scope: ResolvedScope;
}

export interface SafetyOverrideResponse {
  text: string;
  voiceText: string;
  mode: 'emergency';
  priority: 'high';
  language: Language;
}

export interface SafetyEngineOutput {
  override: boolean;
  response?: SafetyOverrideResponse;
}

interface HazardSnapshot {
  activeCount: number;
  criticalCount: number;
  confirmedCriticalCount: number;
}

@Injectable()
export class SafetyEngineService {
  private readonly logger = new Logger(SafetyEngineService.name);

  constructor(
    @InjectRepository(hazards)
    private readonly hazardRepository: Repository<hazards>,
    @InjectRepository(building)
    private readonly buildingRepository: Repository<building>,
    @InjectRepository(floor)
    private readonly floorRepository: Repository<floor>,
  ) {}

  async evaluate(input: SafetyEngineInput): Promise<SafetyEngineOutput> {
    try {
      const scope = input.scope;
      const role = this.resolveTemplateRole(input.userRole);
      const language = input.language || 'en';

      if (scope.level === 'building') {
        const snapshot = await this.getBuildingHazardSnapshot(scope.buildingId);
        if (this.shouldOverrideForBuilding(snapshot)) {
          return {
            override: true,
            response: this.buildEmergencyResponse(role, language, {
              level: 'building',
              buildingName: scope.buildingName,
              activeCount: snapshot.activeCount,
              criticalCount: snapshot.criticalCount,
            }),
          };
        }
        return { override: false };
      }

      if (scope.level === 'society') {
        const buildingIds = await this.getSocietyBuildingIds(scope.societyId);
        const snapshots = await this.getSnapshotsForBuildings(buildingIds);
        if (this.shouldOverrideForSociety(snapshots)) {
          const criticalBuildings = snapshots.filter(
            (snapshot) => snapshot.criticalCount > 0,
          ).length;
          return {
            override: true,
            response: this.buildEmergencyResponse(role, language, {
              level: 'society',
              societyName: scope.societyName,
              activeCount: snapshots.reduce(
                (acc, snapshot) => acc + snapshot.activeCount,
                0,
              ),
              criticalCount: snapshots.reduce(
                (acc, snapshot) => acc + snapshot.criticalCount,
                0,
              ),
              criticalBuildings,
            }),
          };
        }
        return { override: false };
      }

      const globalSnapshot = await this.getGlobalHazardSnapshot();
      if (this.shouldOverrideForGlobal(globalSnapshot)) {
        return {
          override: true,
          response: this.buildEmergencyResponse(role, language, {
            level: 'global',
            activeCount: globalSnapshot.activeCount,
            criticalCount: globalSnapshot.criticalCount,
          }),
        };
      }

      return { override: false };
    } catch (error) {
      this.logger.warn(
        `Safety evaluation failed; falling back to normal path. ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
      return { override: false };
    }
  }

  async check(input: SafetyEngineInput): Promise<SafetyEngineOutput> {
    return this.evaluate(input);
  }

  private async getBuildingHazardSnapshot(
    buildingId?: number,
  ): Promise<HazardSnapshot> {
    if (!buildingId) {
      return { activeCount: 0, criticalCount: 0, confirmedCriticalCount: 0 };
    }

    const activeRows = await this.hazardRepository
      .createQueryBuilder('hazard')
      .leftJoin('hazard.floor', 'floor')
      .where('floor.building_id = :buildingId', { buildingId })
      .andWhere('LOWER(hazard.status) IN (:...statuses)', {
        statuses: ['active', 'pending', 'responded', 'responding'],
      })
      .select(['hazard.severity AS severity', 'hazard.status AS status'])
      .getRawMany<{ severity: string; status: string }>();

    return this.toSnapshot(activeRows);
  }

  private async getSnapshotsForBuildings(
    buildingIds: number[],
  ): Promise<HazardSnapshot[]> {
    if (!buildingIds.length) return [];
    const snapshots: HazardSnapshot[] = [];
    for (const buildingId of buildingIds) {
      snapshots.push(await this.getBuildingHazardSnapshot(buildingId));
    }
    return snapshots;
  }

  private async getGlobalHazardSnapshot(): Promise<HazardSnapshot> {
    const activeRows = await this.hazardRepository
      .createQueryBuilder('hazard')
      .andWhere('LOWER(hazard.status) IN (:...statuses)', {
        statuses: ['active', 'pending', 'responded', 'responding'],
      })
      .select(['hazard.severity AS severity', 'hazard.status AS status'])
      .getRawMany<{ severity: string; status: string }>();

    return this.toSnapshot(activeRows);
  }

  private async getSocietyBuildingIds(societyId?: number): Promise<number[]> {
    if (!societyId) return [];
    const rows = await this.buildingRepository.find({
      where: { society_id: societyId },
      select: ['id'],
    });
    return rows.map((row) => row.id);
  }

  private shouldOverrideForBuilding(snapshot: HazardSnapshot): boolean {
    return snapshot.confirmedCriticalCount > 0 || snapshot.criticalCount > 0;
  }

  private shouldOverrideForSociety(snapshots: HazardSnapshot[]): boolean {
    if (!snapshots.length) return false;
    // Any critical building in the rollup triggers society emergency mode.
    return snapshots.some((snapshot) =>
      this.shouldOverrideForBuilding(snapshot),
    );
  }

  private shouldOverrideForGlobal(snapshot: HazardSnapshot): boolean {
    // Global override is intentionally conservative to avoid emergency spam.
    const hasSevereState = snapshot.confirmedCriticalCount >= 2;
    const hasBroadCriticalLoad = snapshot.criticalCount >= 4;
    return hasSevereState || hasBroadCriticalLoad;
  }

  private toSnapshot(
    rows: Array<{ severity?: string; status?: string }>,
  ): HazardSnapshot {
    const activeCount = rows.length;
    const criticalRows = rows.filter((row) =>
      ['critical', 'high'].includes((row.severity || '').toLowerCase()),
    );
    const confirmedCriticalCount = criticalRows.filter((row) => {
      const status = (row.status || '').toLowerCase();
      return status === 'responded' || status === 'responding';
    }).length;

    return {
      activeCount,
      criticalCount: criticalRows.length,
      confirmedCriticalCount,
    };
  }

  private resolveTemplateRole(userRole: string): SafetyTemplateRole {
    const role = (userRole || '').toLowerCase();
    const isFirefighter =
      role === 'firefighter' ||
      role === 'firefighter_district' ||
      role === 'firefighter_state' ||
      role === 'firefighter_hq' ||
      role === 'commander';

    return isFirefighter ? 'firefighter' : 'civilian';
  }

  private buildEmergencyResponse(
    role: SafetyTemplateRole,
    language: Language,
    context: SafetyTemplateContext,
  ): SafetyOverrideResponse {
    const text = buildSafetyTemplate(role, language, context);
    return {
      text,
      voiceText: text,
      mode: 'emergency',
      priority: 'high',
      language,
    };
  }
}
