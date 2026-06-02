/**
 * AuthService for Firebase Token Verification
 */
var AuthService = function() {
  this.CERTS_URL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";
  this.CACHE_KEY = "firebase_public_certs";
};

AuthService.prototype.verifyToken = function(idToken) {
  try {
    if (!idToken || idToken === "guest_session") {
      return { isValid: false, uid: "guest", error: "Guest session" };
    }

    var settings = getSettings();
    var projectId = settings.FIREBASE_PROJECT_ID;
    if (!projectId) throw new Error("Missing Firebase project configuration");

    var parts = idToken.split(".");
    if (parts.length !== 3) return { isValid: false, error: "Invalid JWT format" };

    var header = JSON.parse(this._decodeJwtPart(parts[0]));
    var payload = JSON.parse(this._decodeJwtPart(parts[1]));

    if (header.alg !== "RS256") return { isValid: false, error: "Invalid JWT algorithm" };

    var expectedIssuer = "https://securetoken.google.com/" + projectId;
    if (payload.iss !== expectedIssuer) return { isValid: false, error: "Invalid issuer" };
    if (payload.aud !== projectId) return { isValid: false, error: "Invalid audience" };
    if (!payload.sub) return { isValid: false, error: "Invalid subject" };

    var now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) return { isValid: false, error: "Token expired" };

    var certs = this._getPublicCertificates(header.kid);
    var verified = Utilities.verifyRsaSha256Signature(
      Utilities.newBlob(parts[0] + "." + parts[1]).getBytes(),
      Utilities.base64DecodeWebSafe(parts[2]),
      certs[header.kid]
    );

    if (!verified) return { isValid: false, error: "Invalid signature" };

    var firebaseData = payload.firebase || {};
    var identities = firebaseData.identities || {};
    var linkedAccounts = {};
    Object.keys(identities).forEach(function(provider) {
      linkedAccounts[provider] = { accounts: identities[provider] || [] };
    });

    return {
      isValid: true,
      uid: payload.user_id || payload.sub,
      email: payload.email || null,
      displayName: payload.name || null,
      photoUrl: payload.picture || null,
      linkedAccounts: linkedAccounts,
      payload: payload
    };
  } catch (err) {
    return { isValid: false, error: err.toString() };
  }
};

AuthService.prototype._decodeJwtPart = function(part) {
  return Utilities.newBlob(Utilities.base64DecodeWebSafe(part)).getDataAsString();
};

AuthService.prototype._getPublicCertificates = function(kid) {
  var cache = CacheService.getScriptCache();
  var cached = cache.get(this.CACHE_KEY);
  if (cached) {
    var certs = JSON.parse(cached);
    if (certs[kid]) return certs;
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    var response = UrlFetchApp.fetch(this.CERTS_URL);
    var certs = JSON.parse(response.getContentText());
    cache.put(this.CACHE_KEY, JSON.stringify(certs), 3600);
    return certs;
  } finally {
    lock.releaseLock();
  }
};

/**
 * MessagingService for FCM Notifications
 */
var MessagingService = function() {
  this.CACHE_KEY = "fcm_oauth2_access_token";
};

MessagingService.prototype.sendMulticast = function(tokens, title, body, data) {
  var settings = getSettings();
  if (settings.NOTIFICATIONS_ENABLED === "false") return [];

  var accessToken = this._getAccessToken();
  var url = "https://fcm.googleapis.com/v1/projects/" + settings.FIREBASE_PROJECT_ID + "/messages:send";

  var requests = tokens.map(function(token) {
    var payload = { message: { token: token, notification: { title: title, body: body } } };
    if (data) payload.message.data = data;
    return {
      url: url,
      method: "post",
      contentType: "application/json",
      headers: { Authorization: "Bearer " + accessToken },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
  });

  var results = [];
  var batchSize = 40;
  for (var i = 0; i < requests.length; i += batchSize) {
    var responses = UrlFetchApp.fetchAll(requests.slice(i, i + batchSize));
    responses.forEach(function(res, idx) {
      results.push({
        token: tokens[i + idx],
        success: res.getResponseCode() === 200,
        response: res.getContentText()
      });
    });
  }
  return results;
};

MessagingService.prototype.broadcast = function(topic, title, body, data) {
  var settings = getSettings();
  if (settings.NOTIFICATIONS_ENABLED === "false") throw new Error("Notifications disabled");

  var accessToken = this._getAccessToken();
  var url = "https://fcm.googleapis.com/v1/projects/" + settings.FIREBASE_PROJECT_ID + "/messages:send";

  var payload = { message: { topic: topic || "all_users", notification: { title: title, body: body } } };
  if (data) payload.message.data = data;

  var res = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + accessToken },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  if (res.getResponseCode() !== 200) throw new Error("Broadcast failed: " + res.getContentText());
  return JSON.parse(res.getContentText()).name;
};

MessagingService.prototype._getAccessToken = function() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get(this.CACHE_KEY);
  if (cached) return cached;

  var settings = getSettings();
  var serviceAccount = typeof settings.FIREBASE_SERVICE_ACCOUNT === 'string'
    ? JSON.parse(settings.FIREBASE_SERVICE_ACCOUNT) : settings.FIREBASE_SERVICE_ACCOUNT;
  if (!serviceAccount) throw new Error("Service account missing");

  var now = Math.floor(Date.now() / 1000);
  var header = JSON.stringify({ alg: "RS256", typ: "JWT" });
  var payload = JSON.stringify({
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now
  });

  var encode = function(s) { return Utilities.base64EncodeWebSafe(s).replace(/=+$/, ''); };
  var input = encode(header) + "." + encode(payload);
  var signature = Utilities.computeRsaSha256Signature(input, serviceAccount.private_key);
  var jwt = input + "." + encode(signature);

  var res = UrlFetchApp.fetch("https://oauth2.googleapis.com/token", {
    method: "post",
    payload: { grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }
  });

  var token = JSON.parse(res.getContentText()).access_token;
  cache.put(this.CACHE_KEY, token, 3300);
  return token;
};

/**
 * LocationService for Maps and Geocoding
 */
var LocationService = function() {};

LocationService.prototype.getSuggestions = function(input) {
  if (!input || input.length < 3) return [];
  try {
    var res = Maps.newGeocoder().geocode(input);
    return (res.results || []).map(function(r) { return r.formatted_address; });
  } catch (e) { return []; }
};

LocationService.prototype.geocode = function(address) {
  var res = Maps.newGeocoder().geocode(address);
  if (!res.results || res.results.length === 0) throw new Error("Address not found");
  return res.results[0];
};

LocationService.prototype.reverseGeocode = function(lat, lng) {
  var res = Maps.newGeocoder().reverseGeocode(lat, lng);
  if (!res.results || res.results.length === 0) throw new Error("Coordinates not found");
  return res.results[0];
};

LocationService.prototype.getDistanceAndDuration = function(origin, destination) {
  var res = Maps.newDirectionFinder()
    .setOrigin(origin).setDestination(destination)
    .setMode(Maps.DirectionFinder.Mode.DRIVING).getDirections();
  if (!res.routes || res.routes.length === 0) throw new Error("No route found");
  return res.routes[0].legs[0];
};

/**
 * ProductQueryService for shared filtering/sorting/aggregation logic
 */
var ProductQueryService = function(reviewRepo) {
  this.reviewRepo = reviewRepo;
};

ProductQueryService.prototype.query = function(products, options) {
  var self = this;
  var all = products.slice();

  // 1. Category Filter
  if (options.categoryId) {
    all = all.filter(function(p) { return p.category_ids && String(p.category_ids).split(",").indexOf(String(options.categoryId)) !== -1; });
  }

  // 2. Search Query Filter
  if (options.query) {
    var q = options.query.toLowerCase();
    all = all.filter(function(p) {
      return (p.title || "").toLowerCase().indexOf(q) !== -1 ||
             (p.description || "").toLowerCase().indexOf(q) !== -1;
    });
  }

  // 3. Stock Filter
  if (options.inStockOnly === "true" || options.inStockOnly === true) {
    all = all.filter(function(p) { return parseInt(p.stock || 0, 10) > 0; });
  }

  // 4. Price Filters
  if (options.minPrice !== undefined) all = all.filter(function(p) { return parseFloat(p.price || 0) >= parseFloat(options.minPrice); });
  if (options.maxPrice !== undefined) all = all.filter(function(p) { return parseFloat(p.price || 0) <= parseFloat(options.maxPrice); });

  // 5. Initial Sorting (Price/Newest)
  if (options.sortBy === "price_asc") {
    all.sort(function(a, b) { return parseFloat(a.price || 0) - parseFloat(b.price || 0); });
  } else if (options.sortBy === "price_desc") {
    all.sort(function(a, b) { return parseFloat(b.price || 0) - parseFloat(a.price || 0); });
  } else if (options.sortBy === "newest") {
    all.sort(function(a, b) { return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime(); });
  }

  // 6. Aggregate Ratings
  all.forEach(function(p) {
    var reviews = self.reviewRepo.findByProductId(p.product_id);
    var count = reviews.length;
    var avg = count > 0 ? (reviews.reduce(function(acc, r) { return acc + parseFloat(r.star_rating || 0); }, 0) / count) : 0;
    p.averageRating = parseFloat(avg.toFixed(1));
    p.reviewCount = count;
  });

  // 7. Rating Sort (After aggregation)
  if (options.sortBy === "rating_desc") {
    all.sort(function(a, b) { return b.averageRating - a.averageRating; });
  }

  return all;
};

// Initialize services
(function() {
  App.Services = {
    Auth: new AuthService(),
    Messaging: new MessagingService(),
    Location: new LocationService(),
    ProductQuery: new ProductQueryService(App.Repositories.Reviews)
  };
})();
