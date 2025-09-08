import { Injectable } from '@nestjs/common';

@Injectable()
export class FireSafetyService {
  getHello(): string {
    return 'Hello World!';
  }
}
