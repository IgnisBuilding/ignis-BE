import { Injectable, ConflictException, UnauthorizedException, NotFoundException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from '@app/entities';
import { LoginDto, RegisterDto, UpdateProfileDto, ChangePasswordDto } from '../dto/auth.dto';
import { Role } from '../enums/role.enum';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private jwtService: JwtService,
  ) {}

  // Generate initials from name
  private generateInitials(name: string): string {
    if (!name) return 'U';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) {
      return parts[0].substring(0, 2).toUpperCase();
    }
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  async register(registerDto: RegisterDto) {
    const existingUser = await this.userRepository.findOne({
      where: { email: registerDto.email },
    });

    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    const hashedPassword = await bcrypt.hash(registerDto.password, 10);

    // Default role is 'resident' for new registrations
    const user = this.userRepository.create({
      ...registerDto,
      password: hashedPassword,
      role: registerDto.role || Role.RESIDENT,
    });

    await this.userRepository.save(user);

    const { password, ...result } = user;
    return {
      ...result,
      initials: this.generateInitials(user.name),
    };
  }

  async login(loginDto: LoginDto) {
    const user = await this.userRepository.findOne({
      where: { email: loginDto.email },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(loginDto.password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    const payload = { email: user.email, sub: user.id, role: user.role };
    const token = this.jwtService.sign(payload);

    return {
      access_token: token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        phone: user.phone,
        emergencyContact: user.emergencyContact,
        initials: this.generateInitials(user.name),
      },
    };
  }

  async validateUser(userId: number) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user || !user.isActive) {
      return null;
    }
    const { password, ...result } = user;
    return {
      ...result,
      initials: this.generateInitials(user.name),
    };
  }

  async findById(userId: number) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      return null;
    }
    const { password, ...result } = user;
    return {
      ...result,
      initials: this.generateInitials(user.name),
    };
  }

  async updateProfile(userId: number, dto: UpdateProfileDto) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (dto.name !== undefined) user.name = dto.name;
    if (dto.phone !== undefined) user.phone = dto.phone;
    if (dto.emergencyContact !== undefined) user.emergencyContact = dto.emergencyContact;

    await this.userRepository.save(user);

    const { password, ...result } = user;
    return {
      ...result,
      initials: this.generateInitials(user.name),
    };
  }

  async changePassword(userId: number, dto: ChangePasswordDto) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const isCurrentValid = await bcrypt.compare(dto.currentPassword, user.password);
    if (!isCurrentValid) {
      throw new BadRequestException('Current password is incorrect');
    }

    user.password = await bcrypt.hash(dto.newPassword, 10);
    await this.userRepository.save(user);

    return { message: 'Password changed successfully' };
  }
}
