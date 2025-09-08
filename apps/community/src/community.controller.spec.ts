import { Test, TestingModule } from '@nestjs/testing';
import { CommunityController } from './community.controller';
import { CommunityService } from './community.service';

describe('CommunityController', () => {
  let communityController: CommunityController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [CommunityController],
      providers: [CommunityService],
    }).compile();

    communityController = app.get<CommunityController>(CommunityController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(communityController.getHello()).toBe('Hello World!');
    });
  });
});
