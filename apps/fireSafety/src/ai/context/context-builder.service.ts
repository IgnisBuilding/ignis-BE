import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { Sensor, building, fire_detection_log, hazards } from '@app/entities';
import { ResolvedScope } from './interfaces/resolved-scope.interface';
import { BuiltContext } from './interfaces/built-context.interface';

type Language = 'en' | 'ur';

export interface ContextBuilderInput {
  scope: ResolvedScope;
  userRole: string;
  language: Language;
  userId: number | string;
}

interface RiskSummaryModel {
  totalHazards: number;
  activeHazards: number;
  criticalHazards: number;
  alertSensors: number;
}

function toIsoOrNow(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  return new Date().toISOString();
}

@Injectable()
export class ContextBuilderService {
  private readonly logger = new Logger(ContextBuilderService.name);
  private readonly MAX_ACTIVE_INCIDENTS = 12;
  private readonly MAX_RECENT_DETECTIONS = 10;
  private readonly MAX_SOCIETY_BUILDINGS = 5;

  constructor(
    @InjectRepository(hazards)
    private readonly hazardRepository: Repository<hazards>,
    @InjectRepository(Sensor)
    private readonly sensorRepository: Repository<Sensor>,
    @InjectRepository(fire_detection_log)
    private readonly detectionRepository: Repository<fire_detection_log>,
    @InjectRepository(building)
    private readonly buildingRepository: Repository<building>,
  ) {}

  async build(input: ContextBuilderInput): Promise<BuiltContext> {
    const level = input.scope.level;
    const structured: BuiltContext['structuredData'] = {
      level,
      fireStatus: 'none',
      riskSummary: {},
      activeIncidents: [],
      recentDetections: [],
      building: undefined,
      society: undefined,
      timestamp: new Date().toISOString(),
    };

    if (input.scope.buildingId) {
      structured.building = {
        id: input.scope.buildingId,
        name: input.scope.buildingName,
      };
    }
    if (input.scope.societyId) {
      structured.society = {
        id: input.scope.societyId,
        name: input.scope.societyName,
      };
    }

    try {
      const riskSummary = await this.buildRiskSummary(input.scope);
      structured.riskSummary = riskSummary as unknown as Record<
        string,
        unknown
      >;

      structured.activeIncidents = await this.buildActiveIncidents(input.scope);
      structured.recentDetections = await this.buildRecentDetections(
        input.scope,
      );
      structured.fireStatus = this.deriveFireStatus(
        riskSummary,
        structured.recentDetections,
      );

      if (level === 'society' && input.scope.societyId) {
        structured.riskSummary.topBuildingSignals =
          await this.getSocietyTopSignals(input.scope.societyId);
      }
    } catch (error) {
      this.logger.warn(
        `Context build partial fallback used: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    }

    return {
      systemPromptContext: this.renderSystemPromptContext(
        input.scope,
        input.userRole,
        input.language,
        structured.fireStatus,
        structured.riskSummary,
      ),
      structuredData: structured,
    };
  }

  private async buildRiskSummary(
    scope: ResolvedScope,
  ): Promise<RiskSummaryModel> {
    const [totalHazards, activeHazards, criticalHazards, alertSensors] =
      await Promise.all([
        this.applyHazardScope(
          this.hazardRepository.createQueryBuilder('hazard'),
          scope,
        ).getCount(),
        this.applyHazardScope(
          this.hazardRepository.createQueryBuilder('hazard'),
          scope,
        )
          .andWhere('LOWER(hazard.status) IN (:...statuses)', {
            statuses: ['active', 'pending', 'responded', 'responding'],
          })
          .getCount(),
        this.applyHazardScope(
          this.hazardRepository.createQueryBuilder('hazard'),
          scope,
        )
          .andWhere('LOWER(hazard.status) IN (:...statuses)', {
            statuses: ['active', 'pending', 'responded', 'responding'],
          })
          .andWhere('LOWER(hazard.severity) IN (:...severities)', {
            severities: ['high', 'critical'],
          })
          .getCount(),
        this.applySensorScope(
          this.sensorRepository.createQueryBuilder('sensor'),
          scope,
        )
          .andWhere('LOWER(sensor.status) = :alertStatus', {
            alertStatus: 'alert',
          })
          .getCount(),
      ]);

    return { totalHazards, activeHazards, criticalHazards, alertSensors };
  }

  private async buildActiveIncidents(
    scope: ResolvedScope,
  ): Promise<Array<Record<string, unknown>>> {
    const rows = await this.applyHazardScope(
      this.hazardRepository.createQueryBuilder('hazard'),
      scope,
    )
      .andWhere('LOWER(hazard.status) IN (:...statuses)', {
        statuses: ['active', 'pending', 'responded', 'responding'],
      })
      .orderBy('hazard.created_at', 'DESC')
      .take(this.MAX_ACTIVE_INCIDENTS)
      .select([
        'hazard.id AS id',
        'hazard.type AS type',
        'hazard.severity AS severity',
        'hazard.status AS status',
        'hazard.floor_id AS floorId',
        'hazard.created_at AS createdAt',
      ])
      .getRawMany<{
        id: number;
        type: string;
        severity: string;
        status: string;
        floorId?: number;
        createdAt: Date;
      }>();

    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      severity: row.severity,
      status: row.status,
      floorId: row.floorId,
      createdAt: toIsoOrNow(row.createdAt),
    }));
  }

  private async buildRecentDetections(
    scope: ResolvedScope,
  ): Promise<Array<Record<string, unknown>>> {
    const detectionsQb = this.detectionRepository
      .createQueryBuilder('detection')
      .leftJoin('detection.camera', 'camera')
      .leftJoin('camera.building', 'building')
      .orderBy('detection.detection_timestamp', 'DESC')
      .take(this.MAX_RECENT_DETECTIONS);

    if (scope.level === 'building' && scope.buildingId) {
      detectionsQb.andWhere('building.id = :buildingId', {
        buildingId: scope.buildingId,
      });
    } else if (scope.level === 'society' && scope.societyId) {
      detectionsQb.andWhere('building.society_id = :societyId', {
        societyId: scope.societyId,
      });
    }

    const rows = await detectionsQb
      .select([
        'detection.id AS id',
        'detection.camera_code AS cameraCode',
        'detection.confidence AS confidence',
        'detection.hazard_id AS hazardId',
        'detection.detection_timestamp AS detectedAt',
      ])
      .getRawMany<{
        id: number;
        cameraCode: string;
        confidence: number;
        hazardId?: number;
        detectedAt: Date;
      }>();

    return rows.map((row) => ({
      id: row.id,
      cameraCode: row.cameraCode,
      confidence: Number(row.confidence),
      hazardId: row.hazardId,
      detectedAt: toIsoOrNow(row.detectedAt),
    }));
  }

  private async getSocietyTopSignals(
    societyId: number,
  ): Promise<Array<Record<string, unknown>>> {
    const societyBuildings = await this.buildingRepository.find({
      where: { society_id: societyId },
      order: { id: 'ASC' },
      take: this.MAX_SOCIETY_BUILDINGS,
      select: ['id', 'name'],
    });

    const signals: Array<Record<string, unknown>> = [];
    for (const row of societyBuildings) {
      const [activeHazards, alertSensors] = await Promise.all([
        this.hazardRepository
          .createQueryBuilder('hazard')
          .leftJoin('hazard.floor', 'floor')
          .where('floor.building_id = :buildingId', { buildingId: row.id })
          .andWhere('LOWER(hazard.status) IN (:...statuses)', {
            statuses: ['active', 'pending', 'responded', 'responding'],
          })
          .getCount(),
        this.sensorRepository.count({
          where: { buildingId: row.id, status: 'alert' },
        }),
      ]);
      signals.push({
        buildingId: row.id,
        buildingName: row.name,
        activeHazards,
        alertSensors,
      });
    }
    return signals;
  }

  private deriveFireStatus(
    riskSummary: RiskSummaryModel,
    recentDetections: Array<Record<string, unknown>>,
  ): 'none' | 'suspected' | 'confirmed' {
    if (riskSummary.criticalHazards > 0) {
      return 'confirmed';
    }

    if (riskSummary.activeHazards > 0) {
      return 'suspected';
    }

    const hasHighConfidenceDetection = recentDetections.some(
      (row) => Number(row.confidence || 0) >= 0.75,
    );
    if (hasHighConfidenceDetection) {
      return 'suspected';
    }

    return 'none';
  }

  private renderSystemPromptContext(
    scope: ResolvedScope,
    userRole: string,
    language: Language,
    fireStatus: 'none' | 'suspected' | 'confirmed',
    riskSummary: Record<string, unknown>,
  ): string {
    const levelLabel = scope.level;
    const scopeLabel =
      levelLabel === 'building'
        ? `${scope.buildingName || 'unknown-building'} (${scope.buildingId || 'n/a'})`
        : levelLabel === 'society'
          ? `${scope.societyName || 'unknown-society'} (${scope.societyId || 'n/a'})`
          : 'global';

    return [
      `Context level: ${levelLabel}.`,
      `Scope target: ${scopeLabel}.`,
      `User role: ${(userRole || 'unknown').toLowerCase()}.`,
      `Preferred language: ${language}.`,
      `Fire status: ${fireStatus}.`,
      `Risk summary: ${JSON.stringify(riskSummary)}.`,
      'Use concise, safety-first responses and do not generate autonomous actions.',
    ].join(' ');
  }

  private applyHazardScope(
    query: SelectQueryBuilder<hazards>,
    scope: ResolvedScope,
  ): SelectQueryBuilder<hazards> {
    query.leftJoin('hazard.floor', 'floor');
    if (scope.level === 'building' && scope.buildingId) {
      query.andWhere('floor.building_id = :buildingId', {
        buildingId: scope.buildingId,
      });
    } else if (scope.level === 'society' && scope.societyId) {
      query
        .leftJoin('floor.building', 'building')
        .andWhere('building.society_id = :societyId', {
          societyId: scope.societyId,
        });
    }
    return query;
  }

  private applySensorScope(
    query: SelectQueryBuilder<Sensor>,
    scope: ResolvedScope,
  ): SelectQueryBuilder<Sensor> {
    if (scope.level === 'building' && scope.buildingId) {
      query.andWhere('sensor.building_id = :buildingId', {
        buildingId: scope.buildingId,
      });
    } else if (scope.level === 'society' && scope.societyId) {
      query
        .leftJoin('sensor.building', 'building')
        .andWhere('building.society_id = :societyId', {
          societyId: scope.societyId,
        });
    }
    return query;
  }
}
