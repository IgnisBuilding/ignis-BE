import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { EmployeeService } from '../services/employee.service';
import { Public } from '../decorators/public.decorator';

@Controller('employees')
export class EmployeeController {
  constructor(private readonly employeeService: EmployeeService) {}

  @Get('by-jurisdiction/:userId')
  @Public()
  async getEmployeesByJurisdiction(@Param('userId', ParseIntPipe) userId: number) {
    return this.employeeService.findByJurisdiction(userId);
  }
}
