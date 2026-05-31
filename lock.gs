function withLock(callback, timeoutMs) {
  var lock = LockService.getScriptLock();

  var timeout = timeoutMs || 30000;

  if (!lock.tryLock(timeout)) {
    throw new Error("Server busy. Retry shortly.");
  }

  try {
    return callback();
  } finally {
    lock.releaseLock();
  }
}
/**
 * Executes a callback block safely under an exclusive script lock.
 * If the database is locked, it automatically enters a retry queue with exponential backoff.
 *
 * @param {Function} callback - The database write operation to run.
 * @param {number} [maxAttempts=5] - Maximum number of retry attempts before failing.
 */
function withLockDelayedRetry(callback, maxAttempts) {
  var lock = LockService.getScriptLock();
  var attempts = maxAttempts || 5; // Default to 5 retry cycles
  var baseDelayMs = 100; // Start with a 100ms delay

  for (var i = 0; i < attempts; i++) {
    // Attempt to acquire the lock with a short 1-second wait window per cycle
    if (lock.tryLock(1000)) {
      try {
        return callback(); // Success! Run the code and return its result.
      } finally {
        lock.releaseLock(); // Always release the lock when finished.
      }
    }

    // Calculate backoff delay with localized randomness (jitter) to break synchronization loops
    if (i < attempts - 1) {
      var jitter = Math.floor(Math.random() * 50);
      var sleepTime = baseDelayMs * Math.pow(2, i) + jitter;

      Logger.log(
        "Database locked. Queueing request... Retrying via withLockDelayedRetry in " +
          sleepTime +
          "ms (Attempt " +
          (i + 1) +
          " of " +
          attempts +
          ")",
      );
      Utilities.sleep(sleepTime);
    }
  }

  // Exhausted all retries without getting a lock
  throw new Error(
    "Server database queue timed out. High traffic density. Please try again shortly.",
  );
}
