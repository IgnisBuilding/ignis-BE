import { Test, TestingModule } from '@nestjs/testing';
import { FireSafetyController } from './fire_safety.controller';
import { FireSafetyService } from './fire_safety.service';

describe('FireSafetyController', () => {
  let fireSafetyController: FireSafetyController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [FireSafetyController],
      providers: [FireSafetyService],
    }).compile();

    fireSafetyController = app.get<FireSafetyController>(FireSafetyController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(fireSafetyController.getHello()).toBe('Hello World!');
    });
  });
});
