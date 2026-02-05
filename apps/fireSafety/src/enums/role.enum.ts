export enum Role {
  // Admin roles
  ADMIN = 'admin',

  // Firefighter hierarchy roles
  FIREFIGHTER_HQ = 'firefighter_hq',
  FIREFIGHTER_STATE = 'firefighter_state',
  FIREFIGHTER_DISTRICT = 'firefighter_district',
  FIREFIGHTER = 'firefighter', // Legacy/generic firefighter

  // Commander role (legacy)
  COMMANDER = 'commander',

  // Building management roles
  MANAGEMENT = 'management',
  BUILDING_AUTHORITY = 'building_authority',

  // Resident role
  RESIDENT = 'resident',
}

// Array of all roles for validation
export const ALL_ROLES = Object.values(Role);

// Role hierarchy - higher index = more permissions
export const ROLE_HIERARCHY: Role[] = [
  Role.RESIDENT,
  Role.FIREFIGHTER,
  Role.FIREFIGHTER_DISTRICT,
  Role.FIREFIGHTER_STATE,
  Role.FIREFIGHTER_HQ,
  Role.COMMANDER,
  Role.MANAGEMENT,
  Role.BUILDING_AUTHORITY,
  Role.ADMIN,
];

// Firefighter roles group (for permission checks)
export const FIREFIGHTER_ROLES = [
  Role.FIREFIGHTER,
  Role.FIREFIGHTER_DISTRICT,
  Role.FIREFIGHTER_STATE,
  Role.FIREFIGHTER_HQ,
];

// Management roles group
export const MANAGEMENT_ROLES = [
  Role.MANAGEMENT,
  Role.BUILDING_AUTHORITY,
  Role.COMMANDER,
  Role.ADMIN,
];

// Check if a role has at least the required role level
export function hasRoleLevel(userRole: Role, requiredRole: Role): boolean {
  const userLevel = ROLE_HIERARCHY.indexOf(userRole);
  const requiredLevel = ROLE_HIERARCHY.indexOf(requiredRole);
  return userLevel >= requiredLevel;
}

// Check if role is any firefighter role
export function isFirefighterRole(role: Role): boolean {
  return FIREFIGHTER_ROLES.includes(role);
}

// Check if role is any management role
export function isManagementRole(role: Role): boolean {
  return MANAGEMENT_ROLES.includes(role);
}
