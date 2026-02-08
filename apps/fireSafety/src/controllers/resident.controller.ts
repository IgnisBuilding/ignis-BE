import { Controller, Get, Post, Put, Delete, Body, Param, Query, ParseIntPipe, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, apartment } from '@app/entities';

@Controller('residents')
export class ResidentController {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(apartment)
    private apartmentRepository: Repository<apartment>,
  ) {}

  @Get()
  async getResidents(
    @Query('search') search?: string,
    @Query('status') status?: string,
  ) {
    const query = this.userRepository.createQueryBuilder('user')
      .leftJoinAndSelect('user.ownedApartments', 'apartment')
      .where('user.role = :role', { role: 'resident' });

    if (search) {
      query.andWhere(
        '(user.name ILIKE :search OR user.email ILIKE :search OR user.phone ILIKE :search)',
        { search: `%${search}%` }
      );
    }

    if (status === 'active') {
      query.andWhere('user.isActive = :isActive', { isActive: true });
    } else if (status === 'inactive') {
      query.andWhere('user.isActive = :isActive', { isActive: false });
    }

    const residents = await query.orderBy('user.createdAt', 'DESC').getMany();

    // Transform to match expected resident format
    return residents.map(user => {
      const apt = user.ownedApartments?.[0] || null;
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        apartmentId: apt?.id || null,
        apartment: apt ? { id: apt.id, unit_number: apt.unit_number } : null,
        emergencyContact: user.emergencyContact,
        isActive: user.isActive,
        status: user.isActive ? 'active' : 'inactive',
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      };
    });
  }

  @Get(':id')
  async getResident(@Param('id', ParseIntPipe) id: number) {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: ['ownedApartments'],
    });

    if (!user) {
      throw new HttpException('Resident not found', HttpStatus.NOT_FOUND);
    }

    const apt = user.ownedApartments?.[0] || null;

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      apartmentId: apt?.id || null,
      apartment: apt ? { id: apt.id, unit_number: apt.unit_number } : null,
      emergencyContact: user.emergencyContact,
      isActive: user.isActive,
      status: user.isActive ? 'active' : 'inactive',
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  @Post()
  async createResident(@Body() body: {
    name: string;
    email: string;
    phone?: string;
    apartmentId?: number;
    emergencyContact?: string;
    password?: string;
  }) {
    // Check if email already exists
    const existing = await this.userRepository.findOne({ where: { email: body.email } });
    if (existing) {
      throw new HttpException('Email already registered', HttpStatus.CONFLICT);
    }

    const user = this.userRepository.create({
      name: body.name,
      email: body.email,
      phone: body.phone,
      emergencyContact: body.emergencyContact,
      password: body.password || 'resident123', // Default password
      role: 'resident',
      isActive: true,
    });

    const saved = await this.userRepository.save(user);

    // If apartmentId provided, assign the apartment to this user
    if (body.apartmentId) {
      await this.apartmentRepository.update(body.apartmentId, {
        ownerId: saved.id,
        occupied: true,
      });
    }

    return {
      id: saved.id,
      name: saved.name,
      email: saved.email,
      phone: saved.phone,
      apartmentId: body.apartmentId || null,
      emergencyContact: saved.emergencyContact,
      isActive: saved.isActive,
      status: 'active',
      createdAt: saved.createdAt,
    };
  }

  @Put(':id')
  async updateResident(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: {
      name?: string;
      email?: string;
      phone?: string;
      apartmentId?: number;
      emergencyContact?: string;
      isActive?: boolean;
    }
  ) {
    const user = await this.userRepository.findOne({ where: { id } });

    if (!user) {
      throw new HttpException('Resident not found', HttpStatus.NOT_FOUND);
    }

    // Update user fields
    if (body.name !== undefined) user.name = body.name;
    if (body.email !== undefined) user.email = body.email;
    if (body.phone !== undefined) user.phone = body.phone;
    if (body.emergencyContact !== undefined) user.emergencyContact = body.emergencyContact;
    if (body.isActive !== undefined) user.isActive = body.isActive;

    const saved = await this.userRepository.save(user);

    // If apartmentId provided, update the apartment ownership
    if (body.apartmentId !== undefined) {
      // Unassign old apartment
      await this.apartmentRepository.update(
        { ownerId: id },
        { ownerId: null as any, occupied: false },
      );
      // Assign new apartment
      if (body.apartmentId) {
        await this.apartmentRepository.update(body.apartmentId, {
          ownerId: saved.id,
          occupied: true,
        });
      }
    }

    // Fetch the updated apartment
    const apt = await this.apartmentRepository.findOne({ where: { ownerId: saved.id } });

    return {
      id: saved.id,
      name: saved.name,
      email: saved.email,
      phone: saved.phone,
      apartmentId: apt?.id || null,
      emergencyContact: saved.emergencyContact,
      isActive: saved.isActive,
      status: saved.isActive ? 'active' : 'inactive',
      updatedAt: saved.updatedAt,
    };
  }

  @Delete(':id')
  async deleteResident(@Param('id', ParseIntPipe) id: number) {
    const user = await this.userRepository.findOne({ where: { id } });

    if (!user) {
      throw new HttpException('Resident not found', HttpStatus.NOT_FOUND);
    }

    // Unassign any apartments owned by this user
    await this.apartmentRepository.update(
      { ownerId: id },
      { ownerId: null as any, occupied: false },
    );

    await this.userRepository.remove(user);

    return { message: 'Resident deleted successfully' };
  }
}
