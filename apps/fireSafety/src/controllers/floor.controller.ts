import { Controller, Get, UseGuards, Param, ParseIntPipe } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { floor, room } from '@app/entities';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { Public } from '../decorators/public.decorator';

@Controller('floors')
@UseGuards(JwtAuthGuard)
export class FloorController {
  constructor(
    @InjectRepository(floor) private floorRepo: Repository<floor>,
    @InjectRepository(room) private roomRepo: Repository<room>,
  ) {}

  @Get(':id')
  @Public()
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.floorRepo.findOne({
      where: { id },
      relations: ['building'],
    });
  }

  @Get(':id/rooms')
  @Public()
  async getRooms(@Param('id', ParseIntPipe) floorId: number) {
    return this.roomRepo.find({
      where: { floor: { id: floorId } },
      order: { name: 'ASC' },
    });
  }
}
