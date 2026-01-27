import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { apartment, User } from '@app/entities';
import { UpdateApartmentDto, AssignApartmentDto } from '../dto/apartment.dto';

@Injectable()
export class ApartmentService {
  constructor(
    @InjectRepository(apartment)
    private readonly apartmentRepository: Repository<apartment>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly dataSource: DataSource,
  ) {}

  // Debug method to check database directly
  async debugApartmentAssignment(email: string): Promise<any> {
    // Get user info
    const userResult = await this.dataSource.query(
      `SELECT id, email, name, role FROM users WHERE email = $1`,
      [email]
    );

    // Get all apartments with user_id
    const apartmentsResult = await this.dataSource.query(
      `SELECT a.id, a.unit_number, a.user_id, a.occupied, a.floor_id, f.level as floor_level, b.name as building_name
       FROM apartment a
       LEFT JOIN floor f ON a.floor_id = f.id
       LEFT JOIN building b ON f.building_id = b.id`
    );

    // Get apartments specifically for this user
    const userApartments = userResult.length > 0
      ? await this.dataSource.query(
          `SELECT a.id, a.unit_number, a.user_id, a.occupied
           FROM apartment a WHERE a.user_id = $1`,
          [userResult[0]?.id]
        )
      : [];

    return {
      user: userResult[0] || null,
      allApartments: apartmentsResult,
      userApartments: userApartments,
      message: userApartments.length > 0
        ? 'User has apartments assigned'
        : 'No apartments found for this user'
    };
  }

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
      relations: ['apartments', 'apartments.floor', 'apartments.floor.building'],
    });

    if (!user || !user.apartments || user.apartments.length === 0) {
      throw new NotFoundException('No apartment assigned to this user');
    }

    // Return the first apartment for now
    const apt = user.apartments[0];

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

  async update(id: number, updateApartmentDto: UpdateApartmentDto): Promise<any> {
    const apt = await this.apartmentRepository.findOne({
      where: { id },
      relations: ['floor', 'floor.building'],
    });

    if (!apt) {
      throw new NotFoundException(`Apartment with ID ${id} not found`);
    }

    // Update the apartment
    if (updateApartmentDto.userId !== undefined) {
      apt.userId = updateApartmentDto.userId;
    }
    if (updateApartmentDto.occupied !== undefined) {
      apt.occupied = updateApartmentDto.occupied;
    }

    await this.apartmentRepository.save(apt);

    return this.findOne(id);
  }

  async assignToUser(id: number, assignDto: AssignApartmentDto): Promise<any> {
    const apt = await this.apartmentRepository.findOne({
      where: { id },
    });

    if (!apt) {
      throw new NotFoundException(`Apartment with ID ${id} not found`);
    }

    // Verify user exists
    const user = await this.userRepository.findOne({
      where: { id: assignDto.userId },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${assignDto.userId} not found`);
    }

    apt.userId = assignDto.userId;
    apt.occupied = true;
    await this.apartmentRepository.save(apt);

    return this.findOne(id);
  }

  async findByUserEmail(email: string): Promise<any> {
    const user = await this.userRepository.findOne({
      where: { email },
    });

    if (!user) {
      throw new NotFoundException(`User with email ${email} not found`);
    }

    return this.findByUserId(user.id);
  }
}
