import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from '@app/entities';
import { CreateNotificationDto } from '../dto/notification.dto';

@Injectable()
export class NotificationService {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
  ) {}

  async findForUser(userId: number, role: string): Promise<Notification[]> {
    return this.notificationRepo
      .createQueryBuilder('n')
      .where('n.user_id = :userId OR n.role_target = :role', { userId, role })
      .orderBy('n.created_at', 'DESC')
      .limit(50)
      .getMany();
  }

  async getUnreadCount(userId: number, role: string): Promise<number> {
    return this.notificationRepo
      .createQueryBuilder('n')
      .where('(n.user_id = :userId OR n.role_target = :role)', { userId, role })
      .andWhere('n.status = :status', { status: 'unread' })
      .getCount();
  }

  async markAsRead(id: number, userId: number, role: string): Promise<Notification> {
    const notification = await this.notificationRepo.findOne({ where: { id } });
    if (!notification) {
      throw new NotFoundException('Notification not found');
    }
    // Authorization: user can only read their own or role-broadcast notifications
    if (notification.userId !== userId && notification.roleTarget !== role) {
      throw new ForbiddenException('Not authorized to access this notification');
    }
    notification.status = 'read';
    return this.notificationRepo.save(notification);
  }

  async markAllAsRead(userId: number, role: string): Promise<void> {
    await this.notificationRepo
      .createQueryBuilder()
      .update(Notification)
      .set({ status: 'read' })
      .where('(user_id = :userId OR role_target = :role)', { userId, role })
      .andWhere('status = :status', { status: 'unread' })
      .execute();
  }

  async remove(id: number, userId: number, role: string): Promise<void> {
    const notification = await this.notificationRepo.findOne({ where: { id } });
    if (!notification) {
      throw new NotFoundException('Notification not found');
    }
    if (notification.userId !== userId && notification.roleTarget !== role) {
      throw new ForbiddenException('Not authorized to delete this notification');
    }
    await this.notificationRepo.remove(notification);
  }

  async create(dto: CreateNotificationDto): Promise<Notification> {
    const notification = this.notificationRepo.create({
      title: dto.title,
      type: dto.type,
      message: dto.message,
      userId: dto.userId || null,
      priority: dto.priority || 'medium',
      roleTarget: dto.roleTarget || null,
    });
    return this.notificationRepo.save(notification);
  }
}
