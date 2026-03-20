import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Sensor } from '@app/entities';
import { CreateSensorDto, UpdateSensorDto } from '../dto/sensor.dto';

@Injectable()
export class SensorService {
  constructor(
    @InjectRepository(Sensor)
    private sensorRepository: Repository<Sensor>,
  ) {}

  findAll() {
    return this.sensorRepository.find({ 
      relations: ['room', 'room.floor', 'room.floor.building', 'floor', 'floor.building', 'building'], 
      order: { createdAt: 'DESC' } 
    });
  }

  async findOne(id: number) {
    const sensor = await this.sensorRepository.findOne({ 
      where: { id }, 
      relations: ['room', 'room.floor', 'room.floor.building', 'floor', 'floor.building', 'building'] 
    });
    if (!sensor) throw new NotFoundException(`Sensor with ID ${id} not found`);
    return sensor;
  }

  findByRoom(roomId: number) {
    return this.sensorRepository.find({ where: { roomId }, relations: ['room'] });
  }

  findByStatus(status: string) {
    return this.sensorRepository.find({ where: { status }, relations: ['room'] });
  }

  create(createSensorDto: CreateSensorDto) {
    const sensor = this.sensorRepository.create({ ...createSensorDto, lastReading: new Date() });
    return this.sensorRepository.save(sensor);
  }

  async update(id: number, updateSensorDto: UpdateSensorDto) {
    const sensor = await this.findOne(id);
    Object.assign(sensor, { ...updateSensorDto, lastReading: new Date() });
    return this.sensorRepository.save(sensor);
  }

  async updateReading(id: number, value: number, status?: string) {
    const updatePayload: Partial<Sensor> = {
      value,
      lastReading: new Date(),
    };

    if (status) {
      updatePayload.status = status;
    }

    const updateResult = await this.sensorRepository.update(id, updatePayload);
    if (!updateResult.affected) {
      throw new NotFoundException(`Sensor with ID ${id} not found`);
    }

    const sensor = await this.sensorRepository.findOne({ where: { id } });
    if (!sensor) {
      throw new NotFoundException(`Sensor with ID ${id} not found`);
    }

    return sensor;
  }

  async remove(id: number) {
    const sensor = await this.findOne(id);
    await this.sensorRepository.remove(sensor);
    return { message: 'Sensor deleted successfully' };
  }

  async getStats() {
    const total = await this.sensorRepository.count();
    const active = await this.sensorRepository.count({ where: { status: 'active' } });
    const alert = await this.sensorRepository.count({ where: { status: 'alert' } });
    const inactive = await this.sensorRepository.count({ where: { status: 'inactive' } });
    return { total, active, alert, inactive };
  }
}
