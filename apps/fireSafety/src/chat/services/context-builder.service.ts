import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { apartment, building, floor, Society } from '@app/entities';
import { ChatRequestDto } from '../dto/chat.dto';
import { BuiltContext, ResolvedContextScope } from '../chat.types';

interface AuthUser {
  userId?: number;
  role?: string;
}

@Injectable()
export class ContextBuilderService {
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

  async build(
    input: ChatRequestDto,
    authUser?: AuthUser,
  ): Promise<BuiltContext> {
    const scope = await this.resolveScope(input, authUser);
    const summary = this.buildSummary(scope);
    return { ...scope, summary };
  }

  private async resolveScope(
    input: ChatRequestDto,
    authUser?: AuthUser,
  ): Promise<ResolvedContextScope> {
    if (input.buildingId || input.societyId) {
      return this.resolveFromIds(input);
    }

    if (input.buildingName || input.societyName) {
      return this.resolveFromNames(input);
    }

    return this.resolveFromUserScope(authUser);
  }

  private async resolveFromIds(
    input: ChatRequestDto,
  ): Promise<ResolvedContextScope> {
    if (input.buildingId) {
      const selectedBuilding = await this.buildingRepository.findOne({
        where: { id: input.buildingId },
      });
      if (!selectedBuilding) {
        return { mode: 'global' };
      }

      const society = selectedBuilding.society_id
        ? await this.societyRepository.findOne({
            where: { id: selectedBuilding.society_id },
          })
        : null;

      return {
        mode: 'building',
        buildingId: selectedBuilding.id,
        buildingName: selectedBuilding.name,
        societyId: selectedBuilding.society_id ?? undefined,
        societyName: society?.name,
      };
    }

    const society = input.societyId
      ? await this.societyRepository.findOne({ where: { id: input.societyId } })
      : null;
    if (!society) {
      return { mode: 'global' };
    }

    return {
      mode: 'society',
      societyId: society.id,
      societyName: society.name,
    };
  }

  private async resolveFromNames(
    input: ChatRequestDto,
  ): Promise<ResolvedContextScope> {
    if (input.buildingName?.trim()) {
      const selectedBuilding = await this.buildingRepository
        .createQueryBuilder('building')
        .where('LOWER(building.name) = LOWER(:name)', {
          name: input.buildingName.trim(),
        })
        .orderBy('building.id', 'ASC')
        .getOne();

      if (!selectedBuilding) {
        return { mode: 'global' };
      }

      const society = selectedBuilding.society_id
        ? await this.societyRepository.findOne({
            where: { id: selectedBuilding.society_id },
          })
        : null;

      return {
        mode: 'building',
        buildingId: selectedBuilding.id,
        buildingName: selectedBuilding.name,
        societyId: selectedBuilding.society_id ?? undefined,
        societyName: society?.name,
      };
    }

    if (input.societyName?.trim()) {
      const society = await this.societyRepository
        .createQueryBuilder('society')
        .where('LOWER(society.name) = LOWER(:name)', {
          name: input.societyName.trim(),
        })
        .orderBy('society.id', 'ASC')
        .getOne();

      if (!society) {
        return { mode: 'global' };
      }

      return {
        mode: 'society',
        societyId: society.id,
        societyName: society.name,
      };
    }

    return { mode: 'global' };
  }

  private async resolveFromUserScope(
    authUser?: AuthUser,
  ): Promise<ResolvedContextScope> {
    const userId = authUser?.userId;
    if (!userId || userId <= 0) {
      return { mode: 'global' };
    }

    const ownedApartment = await this.apartmentRepository.findOne({
      where: { ownerId: userId },
      order: { id: 'ASC' },
    });
    if (!ownedApartment) {
      return { mode: 'global' };
    }

    const userFloor = await this.floorRepository.findOne({
      where: { id: ownedApartment.floor_id },
    });
    if (!userFloor) {
      return { mode: 'global' };
    }

    const userBuilding = await this.buildingRepository.findOne({
      where: { id: userFloor.building_id },
    });
    if (!userBuilding) {
      return { mode: 'global' };
    }

    const society = userBuilding.society_id
      ? await this.societyRepository.findOne({
          where: { id: userBuilding.society_id },
        })
      : null;

    return {
      mode: 'building',
      buildingId: userBuilding.id,
      buildingName: userBuilding.name,
      societyId: userBuilding.society_id ?? undefined,
      societyName: society?.name,
    };
  }

  private buildSummary(scope: ResolvedContextScope): string {
    if (scope.mode === 'building') {
      return `Context mode: building. Building: ${scope.buildingName || 'unknown'}${scope.buildingId ? ` (#${scope.buildingId})` : ''}. Society: ${scope.societyName || 'unknown'}${scope.societyId ? ` (#${scope.societyId})` : ''}.`;
    }

    if (scope.mode === 'society') {
      return `Context mode: society. Society: ${scope.societyName || 'unknown'}${scope.societyId ? ` (#${scope.societyId})` : ''}.`;
    }

    return 'Context mode: global. Use cross-building dashboard-style reasoning.';
  }
}
