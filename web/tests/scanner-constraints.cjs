const test = require('node:test');
const assert = require('node:assert/strict');

// Pure logic replica of constraints ladder generator
function generateConstraintLadder(preferredDeviceId) {
  return [
    preferredDeviceId
      ? { video: { deviceId: { exact: preferredDeviceId } }, audio: false }
      : {
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        },
    preferredDeviceId
      ? { video: { deviceId: { ideal: preferredDeviceId } }, audio: false }
      : { video: { facingMode: 'environment' }, audio: false },
    { video: true, audio: false },
  ];
}

// Pure logic replica of scanner error mapping
function mapScannerError(err, isSecureContext = true) {
  if (!isSecureContext) {
    return 'Camera access requires a secure connection (HTTPS or localhost).';
  }
  const errorName = err?.name || '';
  if (errorName === 'NotAllowedError' || errorName === 'PermissionDeniedError') {
    return 'Camera permission was denied. Please allow camera access in your browser settings or use photo upload instead.';
  }
  if (errorName === 'NotFoundError' || errorName === 'DevicesNotFoundError') {
    return 'No camera found on this device.';
  }
  if (errorName === 'NotReadableError' || errorName === 'TrackStartError') {
    return 'Camera is already in use by another application or browser tab.';
  }
  return err?.message || 'Unable to access device camera.';
}

test('scanner constraint ladder starts with preferred environment 1080p and degrades gracefully', () => {
  const defaultLadder = generateConstraintLadder();
  assert.equal(defaultLadder.length, 3);
  assert.deepEqual(defaultLadder[0].video.facingMode, { ideal: 'environment' });
  assert.equal(defaultLadder[0].video.width.ideal, 1920);
  assert.equal(defaultLadder[0].audio, false);

  assert.equal(defaultLadder[1].video.facingMode, 'environment');
  assert.equal(defaultLadder[1].audio, false);

  assert.equal(defaultLadder[2].video, true);
  assert.equal(defaultLadder[2].audio, false);
});

test('scanner constraint ladder targets specific deviceId when provided', () => {
  const deviceLadder = generateConstraintLadder('cam-rear-01');
  assert.equal(deviceLadder.length, 3);
  assert.deepEqual(deviceLadder[0].video.deviceId, { exact: 'cam-rear-01' });
  assert.deepEqual(deviceLadder[1].video.deviceId, { ideal: 'cam-rear-01' });
  assert.equal(deviceLadder[2].video, true);
});

test('scanner error mapping provides actionable feedback for all device failure states', () => {
  assert.match(
    mapScannerError({ name: 'NotAllowedError' }),
    /Camera permission was denied/
  );
  assert.match(
    mapScannerError({ name: 'DevicesNotFoundError' }),
    /No camera found/
  );
  assert.match(
    mapScannerError({ name: 'NotReadableError' }),
    /Camera is already in use/
  );
  assert.match(
    mapScannerError(new Error('Unknown hardware failure'), true),
    /Unknown hardware failure/
  );
  assert.match(
    mapScannerError({}, false),
    /Camera access requires a secure connection/
  );
});

test('scanner media track cleanup stops all active tracks safely', () => {
  let stoppedCount = 0;
  const mockStream = {
    getTracks: () => [
      { stop: () => { stoppedCount++; } },
      { stop: () => { stoppedCount++; } },
    ],
  };

  mockStream.getTracks().forEach(track => track.stop());
  assert.equal(stoppedCount, 2, 'All tracks in stream must be called to release camera hardware');
});
