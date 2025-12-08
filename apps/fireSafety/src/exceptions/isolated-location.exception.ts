import { HttpException, HttpStatus } from '@nestjs/common';
import {
  IsolationInfo,
  PriorityLevel,
} from '../isolation-detection.service';

/**
 * Custom exception for isolated/trapped occupant scenarios
 *
 * This exception is thrown when no evacuation route can be computed
 * because the occupant's location is isolated from all exits.
 *
 * The exception carries detailed information about the isolation
 * and shelter-in-place instructions for the frontend to display.
 */
export class IsolatedLocationException extends HttpException {
  public readonly isolationInfo: IsolationInfo;
  public readonly trappedOccupantId: number | null;

  constructor(isolationInfo: IsolationInfo, trappedOccupantId?: number) {
    const response = {
      statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
      error: 'LOCATION_ISOLATED',
      message: IsolatedLocationException.generateMessage(isolationInfo),
      timestamp: new Date().toISOString(),
      isolated: true,
      trappedOccupantId: trappedOccupantId || null,
      isolationDetails: {
        nodeId: isolationInfo.nodeId,
        nodeName: isolationInfo.nodeName,
        floorId: isolationInfo.floorId,
        floorName: isolationInfo.floorName,
        isolationReason: isolationInfo.isolationReason,
        priorityLevel: isolationInfo.priorityLevel,
        priorityScore: isolationInfo.priorityScore,
        nearestFireDistance: isolationInfo.nearestFireDistance,
        hasWindow: isolationInfo.hasWindow,
        hasExternalAccess: isolationInfo.hasExternalAccess,
        coordinates: isolationInfo.coordinates,
      },
      shelterInstructions: isolationInfo.shelterInstructions,
      rescueStatus: {
        registered: !!trappedOccupantId,
        message: trappedOccupantId
          ? 'Your location has been registered for rescue. Teams are being dispatched based on priority.'
          : 'Unable to register location. Please call emergency services immediately.',
        priorityExplanation: IsolatedLocationException.getPriorityExplanation(
          isolationInfo.priorityLevel,
        ),
      },
    };

    super(response, HttpStatus.UNPROCESSABLE_ENTITY);
    this.isolationInfo = isolationInfo;
    this.trappedOccupantId = trappedOccupantId || null;
  }

  /**
   * Generates a user-friendly message based on isolation reason
   */
  private static generateMessage(isolationInfo: IsolationInfo): string {
    switch (isolationInfo.isolationReason) {
      case 'LOCATION_ON_FIRE':
        return `CRITICAL: Your current location (${isolationInfo.nodeName}) is in the fire zone. Move to the safest corner of the room away from flames. Rescue team has been notified with CRITICAL priority.`;

      case 'FIRE_BLOCKED_ALL_EXITS':
        return `No evacuation path available from ${isolationInfo.nodeName}. All exits are blocked by fire. Shelter in place - rescue team has been notified and your location is ${isolationInfo.priorityLevel} priority.`;

      case 'FIRE_BLOCKED_EXITS_HAS_SAFE_POINT':
        return `Cannot reach exits from ${isolationInfo.nodeName}. A safe shelter point exists nearby but all exit routes are blocked. Shelter in place and wait for rescue team.`;

      case 'STRUCTURAL_COLLAPSE':
        return `Path blocked due to structural damage near ${isolationInfo.nodeName}. Stay away from unstable structures. Rescue team notified.`;

      case 'SMOKE_FILLED_CORRIDORS':
        return `Corridors from ${isolationInfo.nodeName} are filled with smoke. Do not attempt to traverse. Stay low, seal doors, and wait for rescue.`;

      case 'NO_GRAPH_CONNECTIVITY':
      default:
        return `No evacuation route found from ${isolationInfo.nodeName}. This location appears to be isolated. Shelter in place and await rescue.`;
    }
  }

  /**
   * Provides explanation of what the priority level means for the user
   */
  private static getPriorityExplanation(priorityLevel: PriorityLevel): string {
    switch (priorityLevel) {
      case PriorityLevel.CRITICAL:
        return 'CRITICAL PRIORITY: You are in immediate danger. Rescue teams will reach your location first.';

      case PriorityLevel.HIGH:
        return 'HIGH PRIORITY: Your location has significant risk. Rescue teams will reach you as soon as critical cases are handled.';

      case PriorityLevel.MEDIUM:
        return 'MEDIUM PRIORITY: You are in a relatively safer position but still require rescue. Help is on the way.';

      case PriorityLevel.LOW:
        return 'LOWER PRIORITY: Your location is relatively safe compared to others. Continue sheltering in place - rescue will reach you.';

      default:
        return 'Your location has been registered for rescue.';
    }
  }
}
