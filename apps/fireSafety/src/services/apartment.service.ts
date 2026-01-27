import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { apartment, User } from '@app/entities';

@Injectable()
export class ApartmentService {
  constructor(
    @InjectRepository(apartment)
    private readonly apartmentRepository: Repository<apartment>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async findAll(): Promise<any[]> {
    const apartments = await this.apartmentRepository.find({
      relations: ['floor', 'floor.building'],
    });

    return apartments.map((apt) => ({
      id: apt.id,
      number: apt.unit_number,
      floor: apt.floor?.level || 0,
      residents: 0, // TODO: Count users linked to apartment
      building: {
        id: apt.floor?.building?.id,
        name: apt.floor?.building?.name || 'Unknown',
        address: apt.floor?.building?.address || 'N/A',
      },
      occupied: apt.occupied,
      createdAt: apt.created_at,
      updatedAt: apt.updated_at,
    }));
  }

  async findOne(id: number): Promise<any> {
    const apt = await this.apartmentRepository.findOne({
      where: { id },
      relations: ['floor', 'floor.building'],
    });

    if (!apt) {
      throw new NotFoundException(`Apartment with ID ${id} not found`);
    }

    return {
      id: apt.id,
      number: apt.unit_number,
      floor: apt.floor?.level || 0,
      residents: 0,
      building: {
        id: apt.floor?.building?.id,
        name: apt.floor?.building?.name || 'Unknown',
        address: apt.floor?.building?.address || 'N/A',
      },
      occupied: apt.occupied,
      createdAt: apt.created_at,
      updatedAt: apt.updated_at,
    };
  }

  async findByUserId(userId: number): Promise<any> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['apartment', 'apartment.floor', 'apartment.floor.building'],
    });

    if (!user || !user.apartment) {
      throw new NotFoundException('No apartment assigned to this user');
    }

    const apt = user.apartment;

    return {
      id: apt.id,
      number: apt.unit_number,
      floor: apt.floor?.level || 0,
      residents: 0,
      building: {
        id: apt.floor?.building?.id,
        name: apt.floor?.building?.name || 'Unknown',
        address: apt.floor?.building?.address || 'N/A',
      },
      occupied: apt.occupied,
      createdAt: apt.created_at,
      updatedAt: apt.updated_at,
    };
  }
}
