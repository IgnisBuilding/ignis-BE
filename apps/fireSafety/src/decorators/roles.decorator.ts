import { SetMetadata } from '@nestjs/common';
import { Role } from '../enums/role.enum';

export const ROLES_KEY = 'roles';

// Decorator to specify which roles can access a route
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
