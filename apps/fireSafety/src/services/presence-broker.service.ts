import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';

/**
 * Occupant presence data stored in broker
 */
export interface OccupantPresence {
  userId: number;
  buildingId: number;
  floorId: number;
  nodeId?: number;
  x: number;
  y: number;
  heading?: number;
  speed?: number;
  confidence?: number;
  role: 'firefighter' | 'admin' | 'building_authority' | 'evacuee';
  status: 'navigating' | 'active' | 'offline';
  lastUpdate: number; // timestamp
  currentInstruction?: string;
  progressPercent?: number;
}

/**
 * In-memory presence broker for real-time occupant tracking
 * Stores occupant positions and metadata for building monitoring dashboards
 * 
 * Features:
 * - In-memory storage with automatic eviction (10s no-update timeout)
 * - Role-based visibility filtering
 * - Lightweight alternative to polling database
 * - Fallback: if broker stale, frontend queries REST endpoint
 */
@Injectable()
export class PresenceBrokerService {
  private readonly logger = new Logger(PresenceBrokerService.name);

  // Map: buildingId -> Map<userId, OccupantPresence>
  private presenceStore = new Map<number, Map<number, OccupantPresence>>();

  // Track occupants by role for visibility filtering
  // Map: buildingId -> { firefighter: [...], evacuee: [...], etc }
  private roleIndex = new Map<number, Map<string, Set<number>>>();

  // Constants
  private readonly PRESENCE_TIMEOUT_MS = 10_000; // 10 seconds
  private readonly EVICTION_CHECK_INTERVAL_MS = 5_000; // Check every 5 seconds

  constructor() {
    this.logger.log('PresenceBrokerService initialized');
  }

  /**
   * Upsert occupant presence
   * Creates or updates occupant in the in-memory store
   */
  upsert(occupant: OccupantPresence): void {
    const buildingMap = this.presenceStore.get(occupant.buildingId) || new Map();
    
    // Store occupant
    buildingMap.set(occupant.userId, {
      ...occupant,
      lastUpdate: Date.now(),
    });
    this.presenceStore.set(occupant.buildingId, buildingMap);

    // Update role index
    this.updateRoleIndex(occupant.buildingId, occupant.userId, occupant.role);

    this.logger.debug(
      `Occupant upserted: User ${occupant.userId} in Building ${occupant.buildingId}`,
    );
  }

  /**
   * Get all occupants visible to a given user based on their role
   * 
   * Visibility rules:
   * - firefighter/admin/building_authority: see all occupants
   * - evacuee: see only firefighters, admins, building_authority, and other evacuees
   */
  getVisibleOccupants(
    buildingId: number,
    requestingUserId: number,
    requestingRole: 'firefighter' | 'admin' | 'building_authority' | 'evacuee',
  ): OccupantPresence[] {
    const buildingMap = this.presenceStore.get(buildingId);
    if (!buildingMap) {
      return [];
    }

    const allOccupants = Array.from(buildingMap.values());

    // Responders (firefighter, admin, building_authority) see all occupants
    if (requestingRole !== 'evacuee') {
      return allOccupants;
    }

    // Evacuees see responders and other evacuees (not hidden evacuees)
    return allOccupants.filter(
      (occupant) =>
        occupant.role !== 'evacuee' || // Responders visible to evacuees
        occupant.userId === requestingUserId, // User's own position always visible
    );
  }

  /**
   * Get occupants by floor (for floor-specific filtering)
   */
  getOccupantsByFloor(
    buildingId: number,
    floorId: number,
    requestingRole: 'firefighter' | 'admin' | 'building_authority' | 'evacuee',
  ): OccupantPresence[] {
    return this.getVisibleOccupants(buildingId, -1, requestingRole).filter(
      (occ) => occ.floorId === floorId,
    );
  }

  /**
   * Get single occupant by userId
   */
  getOccupant(buildingId: number, userId: number): OccupantPresence | undefined {
    return this.presenceStore.get(buildingId)?.get(userId);
  }

  /**
   * Remove occupant from broker (e.g., on logout)
   */
  remove(buildingId: number, userId: number): void {
    const buildingMap = this.presenceStore.get(buildingId);
    if (buildingMap) {
      const occupant = buildingMap.get(userId);
      buildingMap.delete(userId);

      // Clean up role index
      if (occupant) {
        this.removeFromRoleIndex(buildingId, userId, occupant.role);
      }
    }

    this.logger.debug(
      `Occupant removed: User ${userId} from Building ${buildingId}`,
    );
  }

  /**
   * Get occupant count for a building
   */
  getOccupantCount(buildingId: number): number {
    return this.presenceStore.get(buildingId)?.size || 0;
  }

  /**
   * Clear all occupants for a building (e.g., evacuation complete)
   */
  clearBuilding(buildingId: number): void {
    this.presenceStore.delete(buildingId);
    this.roleIndex.delete(buildingId);
    this.logger.log(`Building ${buildingId} presence cleared`);
  }

  /**
   * Periodic eviction task: remove stale occupants
   * Runs every 5 seconds to check for occupants not updated in 10 seconds
   */
  @Interval(5_000)
  private evictStaleOccupants(): void {
    const now = Date.now();
    const staleThreshold = now - this.PRESENCE_TIMEOUT_MS;

    for (const [buildingId, buildingMap] of this.presenceStore.entries()) {
      const usersToEvict: number[] = [];

      for (const [userId, occupant] of buildingMap.entries()) {
        if (occupant.lastUpdate < staleThreshold) {
          usersToEvict.push(userId);
        }
      }

      if (usersToEvict.length > 0) {
        for (const userId of usersToEvict) {
          const occupant = buildingMap.get(userId);
          if (occupant) {
            this.removeFromRoleIndex(buildingId, userId, occupant.role);
          }
          buildingMap.delete(userId);
        }

        this.logger.debug(
          `Evicted ${usersToEvict.length} stale occupants from Building ${buildingId}`,
        );
      }
    }
  }

  /**
   * Get statistics for debugging
   */
  getStats(): {
    buildings: number;
    totalOccupants: number;
    buildingStats: Array<{
      buildingId: number;
      occupantCount: number;
      byRole: Record<string, number>;
    }>;
  } {
    const stats = {
      buildings: this.presenceStore.size,
      totalOccupants: 0,
      buildingStats: [] as Array<{
        buildingId: number;
        occupantCount: number;
        byRole: Record<string, number>;
      }>,
    };

    for (const [buildingId, buildingMap] of this.presenceStore.entries()) {
      const byRole: Record<string, number> = {
        firefighter: 0,
        admin: 0,
        building_authority: 0,
        evacuee: 0,
      };

      for (const occupant of buildingMap.values()) {
        byRole[occupant.role]++;
      }

      stats.totalOccupants += buildingMap.size;
      stats.buildingStats.push({
        buildingId,
        occupantCount: buildingMap.size,
        byRole,
      });
    }

    return stats;
  }

  // ═══════════════════════════════════════════════════════════════
  // Private helpers
  // ═══════════════════════════════════════════════════════════════

  private updateRoleIndex(
    buildingId: number,
    userId: number,
    role: string,
  ): void {
    const buildingRoleIndex = this.roleIndex.get(buildingId) || new Map();
    
    // Remove from all roles first
    for (const roleSet of buildingRoleIndex.values()) {
      roleSet.delete(userId);
    }

    // Add to correct role
    if (!buildingRoleIndex.has(role)) {
      buildingRoleIndex.set(role, new Set());
    }
    buildingRoleIndex.get(role)!.add(userId);

    this.roleIndex.set(buildingId, buildingRoleIndex);
  }

  private removeFromRoleIndex(
    buildingId: number,
    userId: number,
    role: string,
  ): void {
    const buildingRoleIndex = this.roleIndex.get(buildingId);
    if (buildingRoleIndex) {
      buildingRoleIndex.get(role)?.delete(userId);
    }
  }
}
