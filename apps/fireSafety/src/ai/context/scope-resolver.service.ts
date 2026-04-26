import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { apartment, building, floor, Society } from '@app/entities';
import { ResolvedScope } from './interfaces/resolved-scope.interface';

type ContextMode = 'auto' | 'global' | 'society' | 'building';

export interface ScopeResolverInput {
  contextMode?: ContextMode;
  buildingId?: number;
  societyId?: number;
  buildingName?: string;
  societyName?: string;
  userId: number | string;
  userRole: string;
}

@Injectable()
export class ScopeResolverService {
  private readonly logger = new Logger(ScopeResolverService.name);

  constructor(
    @InjectRepository(building)
    private readonly buildingRepository: Repository<building>,
    @InjectRepository(Society)
    private readonly societyRepository: Repository<Society>,
    @InjectRepository(apartment)
    private readonly apartmentRepository: Repository<apartment>,
    @InjectRepository(floor)
    private readonly floorRepository: Repository<floor>,
  ) {}

  async resolve(input: ScopeResolverInput): Promise<ResolvedScope> {
    const baseScope = await this.resolveByPriority(input);
    const resolved = this.applyContextModeOverride(input, baseScope);
    this.logger.log(
      `Resolved scope level=${resolved.level} source=${resolved.source}`,
    );
    return resolved;
  }

  private async resolveByPriority(
    input: ScopeResolverInput,
  ): Promise<ResolvedScope> {
    if (input.buildingId) {
      const selectedBuilding = await this.buildingRepository.findOne({
        where: { id: input.buildingId },
      });
      if (!selectedBuilding) {
        throw new BadRequestException(
          `Unknown buildingId: ${input.buildingId}`,
        );
      }
      const selectedSociety = selectedBuilding.society_id
        ? await this.societyRepository.findOne({
            where: { id: selectedBuilding.society_id },
          })
        : null;

      return {
        level: 'building',
        buildingId: selectedBuilding.id,
        buildingName: selectedBuilding.name,
        societyId: selectedBuilding.society_id ?? undefined,
        societyName: selectedSociety?.name,
        source: 'input_id',
      };
    }

    if (input.societyId) {
      const selectedSociety = await this.societyRepository.findOne({
        where: { id: input.societyId },
      });
      if (!selectedSociety) {
        throw new BadRequestException(`Unknown societyId: ${input.societyId}`);
      }
      return {
        level: 'society',
        societyId: selectedSociety.id,
        societyName: selectedSociety.name,
        source: 'input_id',
      };
    }

    const normalizedBuildingName = this.normalizeName(input.buildingName);
    if (normalizedBuildingName) {
      const selectedBuilding = await this.findBuildingByNormalizedName(
        normalizedBuildingName,
      );
      if (!selectedBuilding) {
        throw new BadRequestException(
          `Unknown buildingName: ${input.buildingName?.trim()}`,
        );
      }

      const selectedSociety = selectedBuilding.society_id
        ? await this.societyRepository.findOne({
            where: { id: selectedBuilding.society_id },
          })
        : null;

      return {
        level: 'building',
        buildingId: selectedBuilding.id,
        buildingName: selectedBuilding.name,
        societyId: selectedBuilding.society_id ?? undefined,
        societyName: selectedSociety?.name,
        source: 'input_name',
      };
    }

    const normalizedSocietyName = this.normalizeName(input.societyName);
    if (normalizedSocietyName) {
      const selectedSociety = await this.findSocietyByNormalizedName(
        normalizedSocietyName,
      );
      if (!selectedSociety) {
        throw new BadRequestException(
          `Unknown societyName: ${input.societyName?.trim()}`,
        );
      }
      return {
        level: 'society',
        societyId: selectedSociety.id,
        societyName: selectedSociety.name,
        source: 'input_name',
      };
    }

    return this.resolveUserDefaultScope(input);
  }

  private async resolveUserDefaultScope(
    input: ScopeResolverInput,
  ): Promise<ResolvedScope> {
    const role = (input.userRole || '').toLowerCase();
    const userId =
      typeof input.userId === 'string' ? Number(input.userId) : input.userId;

    const isResidentLike = role === 'resident' || role === 'evacuee';
    const isManagementLike =
      role === 'management' || role === 'building_authority';
    const isHighPrivilege =
      role === 'admin' ||
      role === 'commander' ||
      role === 'firefighter' ||
      role === 'firefighter_district' ||
      role === 'firefighter_state' ||
      role === 'firefighter_hq';

    if ((isResidentLike || isManagementLike) && userId > 0) {
      const apartmentRow = await this.apartmentRepository.findOne({
        where: { ownerId: userId },
        order: { id: 'ASC' },
      });

      if (apartmentRow) {
        const floorRow = await this.floorRepository.findOne({
          where: { id: apartmentRow.floor_id },
        });
        if (floorRow) {
          const buildingRow = await this.buildingRepository.findOne({
            where: { id: floorRow.building_id },
          });
          if (buildingRow) {
            const societyRow = buildingRow.society_id
              ? await this.societyRepository.findOne({
                  where: { id: buildingRow.society_id },
                })
              : null;
            return {
              level: 'building',
              buildingId: buildingRow.id,
              buildingName: buildingRow.name,
              societyId: buildingRow.society_id ?? undefined,
              societyName: societyRow?.name,
              source: 'user_default',
            };
          }
        }
      }
    }

    if (isHighPrivilege) {
      return {
        level: 'global',
        source: 'user_default',
      };
    }

    return {
      level: 'global',
      source: 'auto_resolver',
    };
  }

  private applyContextModeOverride(
    input: ScopeResolverInput,
    scope: ResolvedScope,
  ): ResolvedScope {
    const requestedMode = input.contextMode || 'auto';
    if (requestedMode === 'auto') {
      return this.degradeIfNeeded(scope);
    }

    if (requestedMode === 'global') {
      if (this.isGlobalAllowedForRole(input.userRole)) {
        return {
          ...scope,
          level: 'global',
          source:
            scope.source === 'user_default' ? 'user_default' : 'auto_resolver',
        };
      }
      return this.degradeIfNeeded(scope);
    }

    if (requestedMode === 'building') {
      if (scope.buildingId) {
        return { ...scope, level: 'building' };
      }

      if (input.buildingName || input.buildingId) {
        throw new BadRequestException(
          'Requested building scope but building could not be resolved.',
        );
      }

      if (input.societyName || input.societyId) {
        return this.degradeIfNeeded({ ...scope, level: 'society' });
      }

      return this.degradeIfNeeded(scope);
    }

    if (requestedMode === 'society') {
      if (scope.societyId) {
        return { ...scope, level: 'society' };
      }

      if (input.societyName || input.societyId) {
        throw new BadRequestException(
          'Requested society scope but society could not be resolved.',
        );
      }

      return this.degradeIfNeeded(scope);
    }

    return this.degradeIfNeeded(scope);
  }

  private degradeIfNeeded(scope: ResolvedScope): ResolvedScope {
    if (scope.level === 'building' && !scope.buildingId) {
      if (scope.societyId) {
        return { ...scope, level: 'society' };
      }
      return { ...scope, level: 'global' };
    }

    if (scope.level === 'society' && !scope.societyId) {
      return { ...scope, level: 'global' };
    }

    return scope;
  }

  private normalizeName(value?: string): string | null {
    if (!value) return null;
    const normalized = value.trim().replace(/\s+/g, ' ').toLowerCase();
    return normalized.length ? normalized : null;
  }

  private async findBuildingByNormalizedName(
    normalizedName: string,
  ): Promise<building | null> {
    return this.buildingRepository
      .createQueryBuilder('building')
      .where('LOWER(TRIM(building.name)) = :name', { name: normalizedName })
      .orderBy('building.id', 'ASC')
      .getOne();
  }

  private async findSocietyByNormalizedName(
    normalizedName: string,
  ): Promise<Society | null> {
    return this.societyRepository
      .createQueryBuilder('society')
      .where('LOWER(TRIM(society.name)) = :name', { name: normalizedName })
      .orderBy('society.id', 'ASC')
      .getOne();
  }

  private isGlobalAllowedForRole(roleValue: string): boolean {
    const role = (roleValue || '').toLowerCase();
    return (
      role === 'admin' ||
      role === 'commander' ||
      role === 'firefighter' ||
      role === 'firefighter_district' ||
      role === 'firefighter_state' ||
      role === 'firefighter_hq'
    );
  }
}
