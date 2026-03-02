import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class EmployeeService {
  constructor(private dataSource: DataSource) {}

  async findByJurisdiction(userId: number) {
    // Get the requesting user's employee record to determine jurisdiction
    const employee = await this.dataSource.query(`
      SELECT e.id, e.user_id, e.brigade_id, e.state_id, e.hq_id,
             fb.name as brigade_name, fb.state_id as brigade_state_id,
             fbs.name as state_name, fbs.hq_id as state_hq_id,
             fbh.name as hq_name
      FROM employee e
      LEFT JOIN fire_brigade fb ON e.brigade_id = fb.id
      LEFT JOIN fire_brigade_state fbs ON e.state_id = fbs.id OR fb.state_id = fbs.id
      LEFT JOIN fire_brigade_hq fbh ON e.hq_id = fbh.id OR fbs.hq_id = fbh.id
      WHERE e.user_id = $1
    `, [userId]);

    if (!employee || employee.length === 0) {
      return { employees: [], jurisdiction: null, message: 'No employee record found for this user' };
    }

    const emp = employee[0];
    let employees: any[] = [];
    let jurisdiction: { level: string; name: string; id: number } | null = null;

    if (emp.hq_id) {
      // HQ level — all employees whose brigade's state's HQ matches
      jurisdiction = { level: 'hq', name: emp.hq_name || 'HQ', id: emp.hq_id };
      employees = await this.dataSource.query(`
        SELECT e.id, e.user_id, e.position, e.rank, e.badge_number, e.status, e.hire_date,
               e.brigade_id, e.state_id, e.hq_id,
               u.name, u.email, u.role,
               fb.name as brigade_name,
               fbs.name as state_name
        FROM employee e
        JOIN users u ON e.user_id = u.id
        LEFT JOIN fire_brigade fb ON e.brigade_id = fb.id
        LEFT JOIN fire_brigade_state fbs ON e.state_id = fbs.id OR fb.state_id = fbs.id
        LEFT JOIN fire_brigade_hq fbh ON e.hq_id = fbh.id OR fbs.hq_id = fbh.id
        WHERE fbh.id = $1
        ORDER BY e.rank, u.name
      `, [emp.hq_id]);
    } else if (emp.state_id) {
      // State level — all employees whose brigade's state matches
      jurisdiction = { level: 'state', name: emp.state_name || 'State', id: emp.state_id };
      employees = await this.dataSource.query(`
        SELECT e.id, e.user_id, e.position, e.rank, e.badge_number, e.status, e.hire_date,
               e.brigade_id, e.state_id, e.hq_id,
               u.name, u.email, u.role,
               fb.name as brigade_name
        FROM employee e
        JOIN users u ON e.user_id = u.id
        LEFT JOIN fire_brigade fb ON e.brigade_id = fb.id
        LEFT JOIN fire_brigade_state fbs ON e.state_id = fbs.id OR fb.state_id = fbs.id
        WHERE fbs.id = $1
        ORDER BY e.rank, u.name
      `, [emp.state_id]);
    } else if (emp.brigade_id) {
      // District level — all employees in the same brigade
      jurisdiction = { level: 'district', name: emp.brigade_name || 'District', id: emp.brigade_id };
      employees = await this.dataSource.query(`
        SELECT e.id, e.user_id, e.position, e.rank, e.badge_number, e.status, e.hire_date,
               e.brigade_id, e.state_id, e.hq_id,
               u.name, u.email, u.role
        FROM employee e
        JOIN users u ON e.user_id = u.id
        WHERE e.brigade_id = $1
        ORDER BY e.rank, u.name
      `, [emp.brigade_id]);
    }

    return {
      employees: employees.map(e => ({
        id: e.id,
        userId: e.user_id,
        name: e.name,
        email: e.email,
        role: e.role,
        position: e.position,
        rank: e.rank,
        badgeNumber: e.badge_number,
        status: e.status,
        hireDate: e.hire_date,
        brigadeName: e.brigade_name || null,
        stateName: e.state_name || null,
      })),
      jurisdiction,
      count: employees.length,
    };
  }
}
