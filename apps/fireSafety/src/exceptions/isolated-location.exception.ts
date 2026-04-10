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
  /**
   * Unified shelter-in-place message shared across backend, web FE, and
   * Android mobile client. Kept in sync with
   * OfflineRoutingEngine.SHELTER_IN_PLACE_MESSAGE on the mobile side.
   */
  public static readonly SHELTER_IN_PLACE_MESSAGE =
    'STAY WHERE YOU ARE — fire has blocked all exits. Shelter in place.';

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
   * Returns the unified shelter-in-place message. Previously returned a
   * per-reason description (LOCATION_ON_FIRE, FIRE_BLOCKED_ALL_EXITS, etc.);
   * those reason codes are still logged internally via
   * isolationInfo.isolationReason so operators retain diagnostic context,
   * but the user-visible text is now uniform across backend, web FE, and
   * Android mobile client.
   */
  private static generateMessage(_isolationInfo: IsolationInfo): string {
    return IsolatedLocationException.SHELTER_IN_PLACE_MESSAGE;
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
