function generateUniqueId(prefix) {
  var d = new Date();
  var timezone = getSettings().TIMEZONE;

  var datePart = Utilities.formatDate(d, timezone, "yyyyMMdd");

  var uuidPart = Utilities.getUuid().split("-")[0];

  return prefix + "-" + datePart + "-" + uuidPart;
}

function parseRequestPayload(e) {
  try {
    return e.postData && e.postData.contents
      ? JSON.parse(e.postData.contents)
      : e.parameter;
  } catch (err) {
    throw new Error("Malformed payload structure");
  }
}

function decodeJwtPart(part) {
  return Utilities.newBlob(
    Utilities.base64DecodeWebSafe(part),
  ).getDataAsString();
}

function getFirebasePublicCertificates(forceRefresh) {
  var CACHE_KEY = "firebase_public_certs";

  var CERTS_URL =
    "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";

  var cache = CacheService.getScriptCache();

  /**
   * FAST CACHE PATH
   */

  if (!forceRefresh) {
    var cached = cache.get(CACHE_KEY);

    if (cached) {
      return JSON.parse(cached);
    }
  }

  /**
   * PREVENT CACHE STAMPEDE
   */

  var lock = LockService.getScriptLock();

  lock.waitLock(5000);

  try {
    /**
     * Another request may
     * already have refreshed cache
     */

    if (!forceRefresh) {
      var retryCached = cache.get(CACHE_KEY);

      if (retryCached) {
        return JSON.parse(retryCached);
      }
    }

    /**
     * FETCH GOOGLE CERTS
     */

    var response = UrlFetchApp.fetch(CERTS_URL, {
      method: "get",
      muteHttpExceptions: true,
    });

    var status = response.getResponseCode();

    if (status !== 200) {
      throw new Error("Unable to fetch Firebase certificates");
    }

    var certs = JSON.parse(response.getContentText());

    /**
     * RESPECT GOOGLE CACHE TTL
     */

    var headers = response.getAllHeaders();

    var cacheControl =
      headers["Cache-Control"] || headers["cache-control"] || "";

    var maxAge = 3600;

    var match = cacheControl.match(/max-age=(\d+)/);

    if (match && match[1]) {
      maxAge = parseInt(match[1], 10);
    }

    /**
     * Safety bounds:
     * min 5 min
     * max 6 hours
     */

    maxAge = Math.min(Math.max(maxAge, 300), 21600);

    cache.put(CACHE_KEY, JSON.stringify(certs), maxAge);

    return certs;
  } finally {
    lock.releaseLock();
  }
}



/**
 * Generates or retrieves a cached OAuth2 access token for FCM V1 API
 */
function getFcmAccessToken(forceRefresh) {
  var CACHE_KEY = "fcm_oauth2_access_token";
  var cache = CacheService.getScriptCache();

  if (!forceRefresh) {
    var cachedToken = cache.get(CACHE_KEY);
    if (cachedToken) return cachedToken;
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(5000);

  try {
    if (!forceRefresh) {
      var retryCached = cache.get(CACHE_KEY);
      if (retryCached) return retryCached;
    }

    var settings = getSettings();
    if (!settings.FIREBASE_SERVICE_ACCOUNT) {
      throw new Error("Missing FIREBASE_SERVICE_ACCOUNT in script properties.");
    }

    // Handle both stringified JSON or object formats safely
    var serviceAccount = typeof settings.FIREBASE_SERVICE_ACCOUNT === 'string' 
      ? JSON.parse(settings.FIREBASE_SERVICE_ACCOUNT) 
      : settings.FIREBASE_SERVICE_ACCOUNT;

    var now = Math.floor(Date.now() / 1000);
    var expiry = now + 3600; // 1 hour

    var header = JSON.stringify({ alg: "RS256", typ: "JWT" });
    var payload = JSON.stringify({
      iss: serviceAccount.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      exp: expiry,
      iat: now
    });

    var base64Encode = function(str) {
      return Utilities.base64EncodeWebSafe(str).replace(/=+$/, '');
    };

    var signatureInput = base64Encode(header) + "." + base64Encode(payload);
    var signatureBytes = Utilities.computeRsaSha256Signature(signatureInput, serviceAccount.private_key);
    var jwt = signatureInput + "." + base64Encode(signatureBytes);

    var response = UrlFetchApp.fetch("https://oauth2.googleapis.com/token", {
      method: "post",
      payload: {
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt
      },
      muteHttpExceptions: true
    });

    if (response.getResponseCode() !== 200) {
      throw new Error("OAuth token generation failed: " + response.getContentText());
    }

    var tokenData = JSON.parse(response.getContentText());
    var accessToken = tokenData.access_token;

    // Cache token slightly shorter than 1 hour for a safety buffer
    cache.put(CACHE_KEY, accessToken, 3300); 

    return accessToken;
  } finally {
    lock.releaseLock();
  }
}