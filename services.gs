/**
 * AuthService for Firebase Token Verification
 */
var AuthService = function() {};

AuthService.prototype.verifyToken = function(idToken) {
  return verifyFirebaseToken(idToken);
};

/**
 * MessagingService for FCM Notifications
 */
var MessagingService = function() {};

MessagingService.prototype.sendMulticast = function(tokens, title, body, data) {
  return sendFcmMulticast(tokens, title, body, data);
};

MessagingService.prototype.broadcast = function(topic, title, body, data) {
  var settings = getSettings();
  if (settings.NOTIFICATIONS_ENABLED === "false") {
    throw new Error("Notifications globally disabled.");
  }

  var accessToken = getFcmAccessToken();
  var url = "https://fcm.googleapis.com/v1/projects/" + settings.FIREBASE_PROJECT_ID + "/messages:send";

  var messagePayload = {
    message: {
      topic: topic || "all_users",
      notification: { title: title, body: body }
    }
  };

  if (data) messagePayload.message.data = data;

  var res = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + accessToken },
    payload: JSON.stringify(messagePayload),
    muteHttpExceptions: true
  });

  if (res.getResponseCode() !== 200) {
    throw new Error("Topic broadcast failed: " + res.getContentText());
  }

  return JSON.parse(res.getContentText()).name;
};

/**
 * LocationService for Maps and Geocoding
 */
var LocationService = function() {};

LocationService.prototype.getSuggestions = function(inputToken) {
  return getPlaceSuggestions(inputToken);
};

LocationService.prototype.getDistanceAndDuration = function(origin, destination) {
  var directions = Maps.newDirectionFinder()
    .setOrigin(origin)
    .setDestination(destination)
    .setMode(Maps.DirectionFinder.Mode.DRIVING)
    .getDirections();

  if (!directions.routes || directions.routes.length === 0) {
    throw new Error("No route found.");
  }

  return directions.routes[0].legs[0];
};

LocationService.prototype.geocode = function(address) {
  var response = Maps.newGeocoder().geocode(address);
  if (!response.results || response.results.length === 0) {
    throw new Error("Address not found.");
  }
  return response.results[0];
};

LocationService.prototype.reverseGeocode = function(lat, lng) {
  var response = Maps.newGeocoder().reverseGeocode(lat, lng);
  if (!response.results || response.results.length === 0) {
    throw new Error("Location not found.");
  }
  return response.results[0];
};

// Initialize services in App namespace
(function() {
  App.Services = {
    Auth: new AuthService(),
    Messaging: new MessagingService(),
    Location: new LocationService()
  };
})();
