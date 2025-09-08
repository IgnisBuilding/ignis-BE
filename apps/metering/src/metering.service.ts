import { Injectable } from '@nestjs/common';

@Injectable()
export class MeteringService {
  getHello(): string {
    return 'Hello World!';
  }
}
