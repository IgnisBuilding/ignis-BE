# Plan: Auto-Collect WiFi Fingerprints with PDR

## Context

WiFi fingerprint collection for Building 46 is currently manual and tedious — user must enter x,y coordinates, label, and click save for each point. Only 3 fingerprints exist, all with identical signals, making indoor positioning useless (GPS fallback = 30m accuracy).

**Goal**: Add an "Auto-Collect" mode where the user starts at a known point (e.g., entrance), walks through the building, and fingerprints are automatically collected every ~2 meters using PDR (step counter + compass) for position estimation. User only needs to label rooms as they enter them.

## What Already Exists (Reuse)

| Component | File | What it does |
|-----------|------|-------------|
| PdrTracker | `sensors/PdrTracker.kt` | `setOrigin(x,y,heading)` → `onStep(heading, pitch)` → `currentX/Y`, confidence decay |
| SensorFusion | `sensors/SensorFusion.kt` | Provides stepCount, heading, pitchAmplitude via `ImuData` callback |
| WifiScanner | `sensors/WifiScanner.kt` | Auto-scans every 2s, `getLatestResults()` returns cached `List<WifiSignal>` |
| FingerprintDatabase | `positioning/FingerprintDatabase.kt` | `addFingerprint(name, x, y, floor, signals, source, pdrData, magField, buildingId, floorId)` |
| FingerprintCollectionFragment | `fragments/FingerprintCollectionFragment.kt` | Manual collection UI with PDR display and WiFi scanning |
| SyncManager | `network/SyncManager.kt` | `uploadFingerprints()` → `POST /api/fingerprints/batch` |
| Layout | `res/layout/fragment_fingerprint_collection.xml` | inputCard → pdrCard → statsCard → fingerprint list |

## Implementation Plan

### File 1: NEW — `positioning/AutoCollectionManager.kt`

Orchestrator class with state machine:

**States**: `IDLE → CALIBRATING → COLLECTING → PAUSED → STOPPED`

**Key logic**:
- `initialize(pdrTracker, sensorFusion, wifiScanner, fingerprintDatabase)` — inject dependencies
- `beginCalibration(startX, startY, floor, label)` — enter setup phase
- `calibrateAndStart()` — set PDR origin at current heading, collect first fingerprint at origin, enter COLLECTING
- `onImuUpdate(imuData)` — called on every sensor update during COLLECTING:
  - Process new steps via `pdrTracker.onStep(heading, pitchAmplitude)`
  - Track distance since last collection point
  - When distance ≥ 2m AND steps ≥ 3 since last collection → auto-save fingerprint
- `collectFingerprintNow()` — grab `wifiScanner.getLatestResults()`, save via `fingerprintDatabase.addFingerprint()` with label `"{roomName}_{sequenceNum}"`, position from PDR, source = `AUTO_COLLECT`
- `updateLabel(name)` / `updateFloor(floor)` — user changes room/floor mid-walk
- `recalibrateAt(x, y)` — reset PDR drift at known point
- `forceCollect()` — manual trigger at current position
- `stop()` → returns `AutoCollectionSummary` (total collected, distance, labels used)

**Callbacks**: `onFingerprintCollected`, `onStatsUpdated`, `onStateChanged`, `onError`

### File 2: MODIFY — `fragments/FingerprintCollectionFragment.kt`

1. Add `autoCollectionManager` member, initialize in `onViewCreated`
2. Add "Start Auto-Collect" button handler → hides manual cards, shows auto-collect card
3. Modify `setupPdrTracking()` — when auto-collecting, route `imuData` to `autoCollectionManager.onImuUpdate()` instead of manual PDR display (prevents double-counting steps)
4. Wire callbacks:
   - `onFingerprintCollected` → haptic feedback, update counter, sync to server, reload KNN
   - `onStatsUpdated` → update live stats display (steps, distance, position, confidence, WiFi count)
   - `onStateChanged` → toggle UI visibility between setup/active/summary views
5. Add dialog handlers: "Change Room" (text input), "Change Floor" (number input), "Recalibrate" (x,y input)
6. Add `showAutoCollectMode()` / `showManualMode()` to toggle card visibility
7. "Stop" → show summary, "Sync All" → bulk upload, "New Session" → reset

### File 3: MODIFY — `res/layout/fragment_fingerprint_collection.xml`

Add below existing `pdrCard`:

**"Start Auto-Collect" button** — prominent tonal button, visible in manual mode

**Auto-Collect Card** (`autoCollectCard`, `visibility="gone"`) containing 3 groups:

1. **Setup group** (visible in IDLE/CALIBRATING):
   - Start X, Y inputs + "Use Entrance (0,0)" shortcut button
   - Floor input, Room label input
   - Instruction text: "Face +X direction, then tap Calibrate"
   - "Calibrate Direction & Start" button
   - "Cancel" button

2. **Active group** (visible in COLLECTING):
   - Live stats: Steps, Distance, Collected count, Position X/Y, PDR Confidence, WiFi APs, Current Room
   - Action buttons: Change Room, Change Floor, Recalibrate, Collect Now, Stop

3. **Summary group** (visible in STOPPED):
   - Session totals: fingerprints, distance, steps, rooms visited
   - "Sync All to Server" button, "New Session" button, "Back to Manual" button

### File 4: MODIFY — `data/Models.kt`

Add `AUTO_COLLECT` to `PositionSource` enum (line ~621) to distinguish auto-collected fingerprints from manual ones.

## User Flow

```
1. Open Collect tab → see normal manual UI + "Start Auto-Collect" button
2. Tap "Start Auto-Collect" → manual cards hidden, setup form shown
3. Enter start position (0,0 for entrance), floor, room name "Entrance"
4. Face +X direction → tap "Calibrate Direction & Start"
5. First fingerprint auto-saved at origin
6. Walk through building → fingerprint auto-saved every ~2m walked
   - Haptic buzz on each save, counter increments
7. Enter new room → tap "Change Room" → type "Kitchen" → OK
8. Continue walking → fingerprints labeled "Kitchen_1", "Kitchen_2", etc.
9. Tap "Stop" → summary shown (e.g., "23 fingerprints, 42m walked")
10. Tap "Sync All" → uploaded to server
11. Position tracking now works with collected fingerprints
```

## Edge Cases

- **< 3 WiFi signals**: Skip collection at that point, retry at next distance threshold
- **PDR confidence < 20%**: Show warning banner, suggest recalibration
- **Floor change**: User taps "Change Floor", subsequent fingerprints use new floor
- **App backgrounded**: WiFi scans throttled by Android; keep app in foreground
- **Fragment destroyed**: Fingerprints already saved individually, no data loss
- **Revisiting same area**: Multiple fingerprints at same spot = more KNN redundancy (good)

## Verification

1. Start auto-collect at (0,0), walk 10 steps (~7m) → expect ~3 fingerprints saved
2. Change room label mid-walk → verify new fingerprints have updated label
3. Check `FingerprintDatabase.getCount()` increases during walk
4. "Sync All" → verify `GET /api/buildings/46/fingerprints` returns new fingerprints
5. After collection, go to Emergency tab → green position marker should now appear inside building (WiFi KNN working instead of GPS fallback)
