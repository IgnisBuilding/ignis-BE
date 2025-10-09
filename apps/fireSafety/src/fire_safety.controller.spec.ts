import { Test, TestingModule } from '@nestjs/testing';
import { FireSafetyController } from './fire_safety.controller';
import { FireSafetyService } from './fire_safety.service';
import { CreateRouteDto } from './dto/CreateRoute.dto';

describe('FireSafetyController', () => {
  let controller: FireSafetyController;
  let service: FireSafetyService;

  // Create a mock service with jest.fn() for each method
  const mockFireSafetyService = {
    findAll: jest.fn(),
    // Add other methods you want to mock here
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FireSafetyController],
      // Provide the mock service instead of the real one
      providers: [
        {
          provide: FireSafetyService,
          useValue: mockFireSafetyService,
        },
      ],
    }).compile();

    controller = module.get<FireSafetyController>(FireSafetyController);
    service = module.get<FireSafetyService>(FireSafetyService);
  });

  describe('findAll', () => {
    it('should call the service to find all routes', () => {
      controller.findAll();
      expect(service.findAll).toHaveBeenCalled();
    });
  });
});
