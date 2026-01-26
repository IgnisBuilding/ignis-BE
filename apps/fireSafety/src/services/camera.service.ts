import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { camera } from '@app/entities';
import { CreateCameraDto, UpdateCameraDto } from '../dto/camera.dto';

@Injectable()
export class CameraService {
  constructor(
    @InjectRepository(camera)
    private cameraRepository: Repository<camera>,
  ) {}

  findAll(filters?: { building_id?: number; floor_id?: number; room_id?: number; status?: string }) {
    const where: any = {};
    if (filters?.building_id) where.building_id = filters.building_id;
    if (filters?.floor_id) where.floor_id = filters.floor_id;
    if (filters?.room_id) where.room_id = filters.room_id;
    if (filters?.status) where.status = filters.status;

    return this.cameraRepository.find({
      where,
      relations: ['building', 'floor', 'room'],
      order: { created_at: 'DESC' },
    });
  }

  async findOne(id: number) {
    const cam = await this.cameraRepository.findOne({
      where: { id },
      relations: ['building', 'floor', 'room'],
    });
    if (!cam) throw new NotFoundException(`Camera with ID ${id} not found`);
    return cam;
  }

  async findByCameraCode(cameraCode: string) {
    const cam = await this.cameraRepository.findOne({
      where: { camera_id: cameraCode },
      relations: ['building', 'floor', 'room'],
    });
    if (!cam) throw new NotFoundException(`Camera with code '${cameraCode}' not found`);
    return cam;
  }

  async findByBuilding(buildingId: number) {
    return this.cameraRepository.find({
      where: { building_id: buildingId },
      relations: ['building', 'floor', 'room'],
      order: { created_at: 'DESC' },
    });
  }

  async findByRoom(roomId: number) {
    return this.cameraRepository.find({
      where: { room_id: roomId },
      relations: ['building', 'floor', 'room'],
    });
  }

  async create(createCameraDto: CreateCameraDto) {
    // Check if camera_id already exists
    const existing = await this.cameraRepository.findOne({
      where: { camera_id: createCameraDto.camera_id },
    });
    if (existing) {
      throw new ConflictException(`Camera with code '${createCameraDto.camera_id}' already exists`);
    }

    const cam = this.cameraRepository.create({
      ...createCameraDto,
      status: createCameraDto.status || 'active',
      is_fire_detection_enabled: createCameraDto.is_fire_detection_enabled ?? true,
    });
    return this.cameraRepository.save(cam);
  }

  async update(id: number, updateCameraDto: UpdateCameraDto) {
    const cam = await this.findOne(id);
    Object.assign(cam, updateCameraDto);
    return this.cameraRepository.save(cam);
  }

  async updateStatus(id: number, status: string) {
    const cam = await this.findOne(id);
    cam.status = status;
    return this.cameraRepository.save(cam);
  }

  async remove(id: number) {
    const cam = await this.findOne(id);
    await this.cameraRepository.remove(cam);
    return { message: 'Camera deleted successfully' };
  }

  async getStats() {
    const total = await this.cameraRepository.count();
    const active = await this.cameraRepository.count({ where: { status: 'active' } });
    const inactive = await this.cameraRepository.count({ where: { status: 'inactive' } });
    const maintenance = await this.cameraRepository.count({ where: { status: 'maintenance' } });
    const fireDetectionEnabled = await this.cameraRepository.count({ where: { is_fire_detection_enabled: true } });

    return { total, active, inactive, maintenance, fireDetectionEnabled };
  }

  async getByBuildingStats(buildingId: number) {
    const total = await this.cameraRepository.count({ where: { building_id: buildingId } });
    const active = await this.cameraRepository.count({ where: { building_id: buildingId, status: 'active' } });
    const inactive = await this.cameraRepository.count({ where: { building_id: buildingId, status: 'inactive' } });

    return { buildingId, total, active, inactive };
  }
}
