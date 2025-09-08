import { Test, TestingModule } from '@nestjs/testing';
import { MeteringController } from './metering.controller';
import { MeteringService } from './metering.service';

describe('MeteringController', () => {
  let meteringController: MeteringController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [MeteringController],
      providers: [MeteringService],
    }).compile();

    meteringController = app.get<MeteringController>(MeteringController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(meteringController.getHello()).toBe('Hello World!');
    });
  });
});
