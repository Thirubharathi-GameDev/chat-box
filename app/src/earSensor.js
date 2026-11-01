import { Accelerometer, LightSensor } from 'expo-sensors';

const NEAR_LUX = 5;
const FAR_LUX = 20;

export function watchEar(onNear) {
  let cancelled = false;
  let lightSub;
  let motionSub;
  let upright = false;
  let near = false;
  let nearStreak = 0;
  let farStreak = 0;

  (async () => {
    try {
      const available = await LightSensor.isAvailableAsync();
      if (!available || cancelled) return;
      LightSensor.setUpdateInterval(200);
      Accelerometer.setUpdateInterval(200);
      motionSub = Accelerometer.addListener(({ y, z }) => {
        if (cancelled) return;
        upright = Math.abs(y) > 0.55 && Math.abs(z) < 0.72;
        if (!upright && near) {
          near = false;
          nearStreak = 0;
          farStreak = 0;
          onNear(false);
        }
      });
      lightSub = LightSensor.addListener(({ illuminance }) => {
        if (cancelled || !Number.isFinite(illuminance)) return;
        const covered = illuminance <= NEAR_LUX && upright;
        if (covered) {
          nearStreak += 1;
          farStreak = 0;
          if (!near && nearStreak >= 2) {
            near = true;
            onNear(true);
          }
          return;
        }
        if (illuminance >= FAR_LUX) {
          farStreak += 1;
          nearStreak = 0;
          if (near && farStreak >= 2) {
            near = false;
            onNear(false);
          }
        }
      });
    } catch {
      // This phone has no light sensor. The speaker button still changes the route.
    }
  })();

  return () => {
    cancelled = true;
    lightSub?.remove();
    motionSub?.remove();
  };
}
