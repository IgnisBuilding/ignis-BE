import { Test, TestingModule } from '@nestjs/testing';
import { SocietyManagementController } from './society-management.controller';
import { SocietyManagementService } from './society-management.service';

describe('SocietyManagementController', () => {
  let societyManagementController: SocietyManagementController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [SocietyManagementController],
      providers: [SocietyManagementService],
    }).compile();

    societyManagementController = app.get<SocietyManagementController>(
      SocietyManagementController,
    );
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(societyManagementController.getHello()).toBe('Hello World!');
    });
  });
});
