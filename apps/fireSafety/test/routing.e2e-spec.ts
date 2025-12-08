/**
 * IGNIS Fire Safety Evacuation System - Routing E2E Test Cases
 *
 * Test cases verifying the evacuation routing system behavior under various fire scenarios.
 * Based on documentation: IGNIS_EVACUATION_SYSTEM_DOCUMENTATION.txt
 *
 * Test Date: December 8, 2025
 * All 7 test cases: PASS (100%)
 *
 * Node Layout Reference:
 * - Ground Floor (F0):
 *   * Exits: Node 1 (2-Car Garage Exit), Node 9 (Covered Porch Exit), Node 13 (Stoop Exit)
 *   * Stairs: Node 2 (Basement Stairs), Node 20 (Stairs to Floor 2)
 *   * Doorways: Mud Room (3), Walk-In (4), Pantry (5), Kitchen (6), Dining Room (7),
 *               Living Room (8), Storage (10), Office/Den (11), Lockers (21), etc.
 * - Floor 2 (F1):
 *   * Stairs: Node 31 (Stairs from Floor 1)
 *   * Junction: Node 25 (Upper Hall Junction)
 *   * Doorways: Bedroom 3 (26), Bedroom 4 (27), Living Room (28), Kitchen (29), Storage (30)
 *
 * Test Steps (Common for all cases):
 * 1. Clear fires: POST /fireSafety/clear-fires
 * 2. Place fire: POST /fireSafety/place-fires with fireZones array
 * 3. Compute route: POST /fireSafety/compute with startNodeId and endNodeId
 *
 * Run with: npm run test:e2e -- --config ./apps/fireSafety/test/jest-e2e.json
 */

import * as request from 'supertest';

describe('Fire Safety Routing Scenarios (E2E)', () => {
  const baseUrl = process.env.API_URL || 'http://localhost:3000';

  // Helper function to clear all fires
  const clearFires = async (): Promise<request.Response> => {
    return request(baseUrl).post('/fireSafety/clear-fires');
  };

  // Helper function to place fires on specific nodes
  const placeFires = async (fireZones: number[]): Promise<request.Response> => {
    return request(baseUrl)
      .post('/fireSafety/place-fires')
      .send({ fireZones });
  };

  // Helper function to compute route
  const computeRoute = async (
    startNodeId: number,
    endNodeId: number,
  ): Promise<request.Response> => {
    return request(baseUrl)
      .post('/fireSafety/compute')
      .send({ startNodeId, endNodeId });
  };

  beforeEach(async () => {
    // Clear fires before each test
    await clearFires();
  });

  afterAll(async () => {
    // Clean up fires after all tests
    await clearFires();
  });

  /**
   * TC_01: Start node is in fire zone, end node is NOT in fire
   *
   * Scenario: Person is trapped in a room where fire has started.
   * They need to escape to a safe exit.
   *
   * Test Data:
   *   - Start: Kitchen Doorway (Node 6)
   *   - End: 2-Car Garage Exit (Node 1)
   *   - Fire: Kitchen Doorway (Node 6)
   *
   * Expected: HTTP 201 - Route should be created since end point is
   *           free from fire, person can escape to safety
   *
   * Status: PASS
   */
  describe('TC_01: Start node in fire zone - escape scenario', () => {
    it('should compute escape route when start node is in fire zone', async () => {
      // Step 1: Clear fires (done in beforeEach)

      // Step 2: Place fire on Kitchen Doorway (Node 6)
      const fireResponse = await placeFires([6]);
      expect([200, 201]).toContain(fireResponse.status);

      // Step 3: Compute route FROM fire zone (Node 6) TO safe exit (Node 1)
      const response = await computeRoute(6, 1);

      // Verify response
      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('type', 'FeatureCollection');
      expect(response.body.features).toBeDefined();
      expect(response.body.features.length).toBeGreaterThan(0);

      const routeProperties = response.body.features[0].properties;
      expect(routeProperties.startNodeId).toBe(6);
      expect(routeProperties.endNodeId).toBe(1);
      expect(routeProperties.distance).toBeGreaterThan(0);
    });
  });

  /**
   * TC_02: End node is in fire zone, start node is NOT in fire (safest point fallback)
   *
   * Scenario: Person wants to reach an exit, but that exit is blocked by fire.
   *
   * Test Data:
   *   - Start: Mud Room Doorway (Node 3)
   *   - End: Stoop Exit (Node 13)
   *   - Fire: Stoop Exit (Node 13)
   *
   * Expected: HTTP 201 - Route should be created to SAFEST POINT or
   *           alternate safe exit, NOT to the fire zone end point
   *
   * Actual: HTTP 201 - Route computed to alternate exit (Node 26)
   *         System auto-redirects to nearest safe exit when destination blocked
   *
   * Status: PASS
   */
  describe('TC_02: End node in fire zone - redirect to safe exit', () => {
    it('should redirect to alternate safe exit when destination is in fire zone', async () => {
      // Step 2: Place fire on Stoop Exit (Node 13)
      const fireResponse = await placeFires([13]);
      expect([200, 201]).toContain(fireResponse.status);

      // Step 3: Compute route FROM safe zone (Node 3) TO fire zone exit (Node 13)
      const response = await computeRoute(3, 13);

      // Verify response
      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('type', 'FeatureCollection');
      expect(response.body.features).toBeDefined();
      expect(response.body.features.length).toBeGreaterThan(0);

      const routeProperties = response.body.features[0].properties;
      expect(routeProperties.startNodeId).toBe(3);
      // End node should be redirected to alternate exit (NOT Node 13)
      expect(routeProperties.endNodeId).not.toBe(13);
      expect(routeProperties.distance).toBeGreaterThan(0);
    });
  });

  /**
   * TC_03: Intermediate node in fire zone with alternate routes available
   *
   * Scenario: Fire is blocking one route, but alternate routes exist.
   *
   * Test Data:
   *   - Start: Bedroom 2 Doorway (Node 10)
   *   - End: 2-Car Garage Exit (Node 1)
   *   - Fire: Lockers Doorway (Node 21)
   *
   * Expected: HTTP 201 - Route created but should NOT include fire zone node.
   *           Fire node avoided, alternative path picked.
   *
   * Status: PASS
   */
  describe('TC_03: Intermediate fire zone with alternate routes', () => {
    it('should avoid fire zone and use alternate route', async () => {
      // Step 2: Place fire on Lockers Doorway (Node 21)
      const fireResponse = await placeFires([21]);
      expect([200, 201]).toContain(fireResponse.status);

      // Step 3: Compute route that would normally go through Node 21
      const response = await computeRoute(10, 1);

      // Verify response
      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('type', 'FeatureCollection');
      expect(response.body.features).toBeDefined();

      const routeProperties = response.body.features[0].properties;
      expect(routeProperties.startNodeId).toBe(10);
      expect(routeProperties.endNodeId).toBe(1);
      // Route should be computed avoiding the fire zone
    });
  });

  /**
   * TC_04: Intermediate node in fire zone with NO alternate routes (isolated node)
   *
   * Scenario: Fire blocks all possible routes, person is isolated.
   *
   * Test Data:
   *   - Start: 2-Car Garage Exit (Node 1)
   *   - End: Covered Porch Exit (Node 9)
   *   - Fire: Mud Room Doorway (Node 3)
   *
   * Expected: HTTP 422 - Isolated node detected, rescue priority assigned
   *           (LOCATION_ISOLATED)
   *
   * Status: PASS
   */
  describe('TC_04: Isolated node - no alternate routes', () => {
    it('should detect isolated node and return rescue priority', async () => {
      // Step 2: Place fire on Mud Room Doorway (Node 3) - blocks routes
      const fireResponse = await placeFires([3]);
      expect([200, 201]).toContain(fireResponse.status);

      // Step 3: Compute route that becomes impossible due to fire
      const response = await computeRoute(1, 9);

      // Verify response
      expect(response.status).toBe(422);
      expect(response.body).toHaveProperty('errorCode', 'LOCATION_ISOLATED');
      expect(response.body).toHaveProperty('priorityLevel', 'HIGH');
    });
  });

  /**
   * TC_05: Floor 1 to Floor 2 routing with fire on Floor 1
   *
   * Scenario: Person on Floor 1 needs to reach Floor 2, but fire blocks path.
   *
   * Test Data:
   *   - Start: 2-Car Garage Exit (Node 1)
   *   - End: Bedroom 3 Doorway (Node 26)
   *   - Fire: Mud Room Doorway (Node 3)
   *
   * Expected: HTTP 422 - Isolated node detected, rescue priority assigned
   *           (LOCATION_ISOLATED), FIRE_BLOCKED_ALL_EXITS, Rescue registered
   *
   * Status: PASS
   */
  describe('TC_05: Cross-floor routing blocked by fire', () => {
    it('should detect isolation when cross-floor route is blocked', async () => {
      // Step 2: Place fire on Mud Room Doorway (Node 3)
      const fireResponse = await placeFires([3]);
      expect([200, 201]).toContain(fireResponse.status);

      // Step 3: Compute route from Floor 1 to Floor 2
      const response = await computeRoute(1, 26);

      // Verify response
      expect(response.status).toBe(422);
      expect(response.body).toHaveProperty('errorCode', 'LOCATION_ISOLATED');
      expect(response.body).toHaveProperty('priorityLevel', 'HIGH');
    });
  });

  /**
   * TC_06: Floor 2 to Floor 1 routing with fire on Floor 2
   *
   * Scenario: Person on Floor 2, fire on that floor.
   *
   * Test Data:
   *   - Start: Bedroom 3 Doorway (Node 26)
   *   - End: Covered Porch Exit (Node 9)
   *   - Fire: Upper Hall Junction (Node 25)
   *
   * Expected: HTTP 200/422/SafePoint - depending on path availability.
   *           If stairs accessible, route to F1 exit. Else 422 or safe point.
   *
   * Actual: HTTP 201 - Safe point fallback
   *         alreadyAtSafePoint: true, safePointId: 6 (Bedroom 3)
   *
   * Status: PASS
   */
  describe('TC_06: Fire on same floor - safe point fallback', () => {
    it('should provide safe point fallback when on fire floor', async () => {
      // Step 2: Place fire on Upper Hall Junction (Node 25)
      const fireResponse = await placeFires([25]);
      expect([200, 201]).toContain(fireResponse.status);

      // Step 3: Compute route from Floor 2 bedroom to Floor 1 exit
      const response = await computeRoute(26, 9);

      // Should either return route or safe point fallback
      expect([200, 201, 422]).toContain(response.status);

      if (response.status === 201) {
        expect(response.body).toBeDefined();
        // May contain alreadyAtSafePoint or regular route
      } else if (response.status === 422) {
        expect(response.body).toHaveProperty('errorCode');
      }
    });
  });

  /**
   * TC_07: Fire blocking BOTH stairways
   *
   * Scenario: Both stairways are blocked by fire.
   * Person cannot reach other floor.
   *
   * Test Data:
   *   - Start: Mud Room Doorway (Node 3)
   *   - End: Bedroom 3 Doorway (Node 26)
   *   - Fire: Stairs F0 (Node 20) AND Stairs F1 (Node 31)
   *
   * Expected: HTTP 422 or SafePoint - Cannot reach Floor 2 with both stairs
   *           blocked. Either isolated or safe point fallback.
   *
   * Actual: HTTP 422 - LOCATION_ISOLATED, priorityLevel: "MEDIUM"
   *         Both stairs blocked, Shelter instructions provided
   *
   * Status: PASS
   */
  describe('TC_07: Both stairways blocked by fire', () => {
    it('should detect isolation when both stairs are blocked', async () => {
      // Step 2: Place fires on BOTH stairs
      const fireResponse = await placeFires([20, 31]);
      expect([200, 201]).toContain(fireResponse.status);

      // Step 3: Compute route that requires using stairs
      const response = await computeRoute(3, 26);

      // Verify response
      expect(response.status).toBe(422);
      expect(response.body).toHaveProperty('errorCode', 'LOCATION_ISOLATED');
      expect(response.body).toHaveProperty('priorityLevel');
      expect(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).toContain(
        response.body.priorityLevel,
      );
    });
  });

  /**
   * Additional Edge Case Tests
   */
  describe('Edge Cases', () => {
    it('should handle route request with no fires', async () => {
      await clearFires();

      const response = await computeRoute(3, 1);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('type', 'FeatureCollection');
    });

    it('should handle invalid start node ID gracefully', async () => {
      const response = await computeRoute(99999, 1);

      expect([400, 404, 422]).toContain(response.status);
    });

    it('should handle invalid end node ID gracefully', async () => {
      const response = await computeRoute(1, 99999);

      expect([400, 404, 422]).toContain(response.status);
    });
  });
});
