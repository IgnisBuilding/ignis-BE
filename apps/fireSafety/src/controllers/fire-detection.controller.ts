import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
  Headers,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { FireDetectionService } from '../services/fire-detection.service';
import {
  FireDetectionAlertDto,
  SensorAlertForwardDto,
  FireConfirmedDto,
  CreateFireAlertConfigDto,
  UpdateFireAlertConfigDto,
} from '../dto/fire-detection.dto';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { Public } from '../decorators/public.decorator';
import { ConfigService } from '@nestjs/config';

@Controller('fire-detection')
@UseGuards(JwtAuthGuard)
export class FireDetectionController {
  private readonly logger = new Logger(FireDetectionController.name);

  constructor(
    private fireDetectionService: FireDetectionService,
    private configService: ConfigService,
  ) {}

  /**
   * Receive fire detection alert from fire-detect pipeline
   * POST /fire-detection/alert
   */
  @Post('alert')
  @Public() // Public but protected by API key
  async processAlert(
    @Body() alertDto: FireDetectionAlertDto,
    @Headers('x-api-key') apiKey?: string,
  ) {
    // Validate API key if configured
    const configuredApiKey = this.configService.get('FIRE_DETECT_API_KEY');
    if (configuredApiKey && apiKey !== configuredApiKey) {
      this.logger.warn('Invalid API key for fire detection alert');
      throw new UnauthorizedException('Invalid API key');
    }

    this.logger.log(`Received fire detection alert from camera: ${alertDto.camera_id}`);
    return this.fireDetectionService.processAlert(alertDto);
  }

  /**
   * Receive forwarded sensor alert from a local ignis-BE instance.
   * Runs DB-based AND logic on the deployed backend so it can create a hazard
   * if a camera detection has also fired in the same location within the window.
   * POST /fire-detection/sensor-alert
   */
  @Post('sensor-alert')
  @Public()
  async receiveSensorAlert(
    @Body() dto: SensorAlertForwardDto,
    @Headers('x-api-key') apiKey?: string,
  ) {
    const configuredApiKey = this.configService.get('FIRE_DETECT_API_KEY');
    if (configuredApiKey && apiKey !== configuredApiKey) {
      throw new UnauthorizedException('Invalid API key');
    }

    const hazardId = await this.fireDetectionService.checkAndLogic(dto.room_id, dto.building_id);

    return { received: true, hazard_id: hazardId ?? undefined };
  }

  /**
   * Receive a fire-confirmed event forwarded from a local ignis-BE instance.
   * Emits fire.detected on this WS server so mobile clients receive the alarm.
   * POST /fire-detection/fire-confirmed
   */
  @Post('fire-confirmed')
  @Public()
  receiveFireConfirmed(
    @Body() dto: FireConfirmedDto,
    @Headers('x-api-key') apiKey?: string,
  ) {
    const configuredApiKey = this.configService.get('FIRE_DETECT_API_KEY');
    if (configuredApiKey && apiKey !== configuredApiKey) {
      throw new UnauthorizedException('Invalid API key');
    }

    this.fireDetectionService.receiveFireConfirmed(dto);
    return { received: true };
  }

  /**
   * Get detection stats
   * GET /fire-detection/stats
   */
  @Get('stats')
  @Public()
  getStats(@Query('building_id') buildingId?: string) {
    return this.fireDetectionService.getDetectionStats(
      buildingId ? parseInt(buildingId) : undefined,
    );
  }

  /**
   * Get detection logs for a camera
   * GET /fire-detection/logs/camera/:cameraId
   */
  @Get('logs/camera/:cameraId')
  @Public()
  getCameraLogs(
    @Param('cameraId', ParseIntPipe) cameraId: number,
    @Query('limit') limit?: string,
  ) {
    return this.fireDetectionService.getDetectionLogs(
      cameraId,
      limit ? parseInt(limit) : 100,
    );
  }

  /**
   * Get recent detections for a building
   * GET /fire-detection/logs/building/:buildingId
   */
  @Get('logs/building/:buildingId')
  @Public()
  getBuildingLogs(
    @Param('buildingId', ParseIntPipe) buildingId: number,
    @Query('hours') hours?: string,
  ) {
    return this.fireDetectionService.getRecentDetections(
      buildingId,
      hours ? parseInt(hours) : 24,
    );
  }

  /**
   * Get fire alert config for a building
   * GET /fire-detection/config/:buildingId
   */
  @Get('config/:buildingId')
  @Public()
  getConfig(@Param('buildingId', ParseIntPipe) buildingId: number) {
    return this.fireDetectionService.getOrCreateConfig(buildingId);
  }

  /**
   * Create fire alert config
   * POST /fire-detection/config
   */
  @Post('config')
  createConfig(@Body() dto: CreateFireAlertConfigDto) {
    return this.fireDetectionService.createConfig(dto);
  }

  /**
   * Update fire alert config
   * PATCH /fire-detection/config/:buildingId
   */
  @Patch('config/:buildingId')
  updateConfig(
    @Param('buildingId', ParseIntPipe) buildingId: number,
    @Body() dto: UpdateFireAlertConfigDto,
  ) {
    return this.fireDetectionService.updateConfig(buildingId, dto);
  }
}
