import { Injectable } from '@nestjs/common';

@Injectable()
export class SocietyManagementService {
  getHello(): string {
    return 'Hello World!';
  }
}
