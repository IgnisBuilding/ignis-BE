import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { Roles } from '../decorators/roles.decorator';
import { Role } from '../enums/role.enum';
import { ChatInputDto } from './dto/chat-input.dto';
import { ChatService } from './chat.service';

@Controller('chat')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post()
  @Roles(
    Role.ADMIN,
    Role.MANAGEMENT,
    Role.BUILDING_AUTHORITY,
    Role.COMMANDER,
    Role.FIREFIGHTER,
    Role.FIREFIGHTER_DISTRICT,
    Role.FIREFIGHTER_STATE,
    Role.FIREFIGHTER_HQ,
    Role.RESIDENT,
  )
  async chat(@Body() body: ChatInputDto, @Req() req: Request) {
    const user = req.user as { userId?: number; role?: string } | undefined;
    return this.chatService.chat(body, user);
  }
}
