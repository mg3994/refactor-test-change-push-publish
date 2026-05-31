function getHaversineDistance(lat1, lon1, lat2, lon2) {
  var R = 6371;

  var dLat = ((lat2 - lat1) * Math.PI) / 180;

  var dLon = ((lon2 - lon1) * Math.PI) / 180;

  var a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Action Handler: VERIFY_LOGISTICS
 * Expects payload: { userAddress: "...", pinLat: 28.52, pinLng: 76.08 }
 */
function handleVerifyLogistics(payload) {
  var result = verifyAndCalculateLogistics(
    payload.userAddress,
    payload.pinLat,
    payload.pinLng,
  );

  // Routes to standard web app responses based on computation result
  return result.success ? jsonSuccess(result.data) : jsonError(result.message);
}

/**
 * Validates address and exact pin coordinates to calculate road distance, service constraints, and fees.
 * Evaluates whether location pin sits inside operational constraints from getSettings()
 */
function verifyAndCalculateLogistics(userAddress, pinLat, pinLng) {
  try {
    var SETTINGS = getSettings();
    var lat = parseFloat(pinLat);
    var lng = parseFloat(pinLng);
    var formattedAddress = userAddress || "";

    // 1. Fall back to geocoding only if pin-drop coordinates were not passed
    if (isNaN(lat) || isNaN(lng)) {
      if (!userAddress) {
        return {
          success: false,
          message:
            "Provide either a structured text address or direct pin coordinates.",
        };
      }
      var geocoder = Maps.newGeocoder().geocode(userAddress);
      if (!geocoder.results || geocoder.results.length === 0) {
        return {
          success: false,
          message:
            "Address not recognized by mapping services. Please clarify.",
        };
      }
      var result = geocoder.results[0];
      lat = result.geometry.location.lat;
      lng = result.geometry.location.lng;
      formattedAddress = result.formatted_address;
    }

    // 2. Compute driving directions directly from Hub coordinates to Pin coordinates
    var originPoint = SETTINGS.HUB_LAT + "," + SETTINGS.HUB_LNG;
    var destinationPoint = lat + "," + lng;

    var directions = Maps.newDirectionFinder()
      .setOrigin(originPoint)
      .setDestination(destinationPoint)
      .setMode(Maps.DirectionFinder.Mode.DRIVING)
      .getDirections();

    if (!directions.routes || directions.routes.length === 0) {
      return {
        success: false,
        message:
          "We cannot map a functional driving route to your precise location pin.",
      };
    }

    var route = directions.routes[0].legs[0];
    var distanceKm = route.distance.value / 1000;
    var durationText = route.duration.text;

    // 3. Evaluate operational guardrails
    var isServicable = distanceKm <= SETTINGS.MAX_SERVICE_RADIUS_KM;
    var travelFee = Math.ceil(distanceKm * SETTINGS.TRAVEL_FEE_PER_KM);

    return {
      success: true,
      data: {
        normalizedAddress: formattedAddress,
        lat: lat,
        lng: lng,
        distanceKm: distanceKm.toFixed(2),
        estimatedTravelTime: durationText,
        isServicable: isServicable, // True if inside max radius, otherwise False
        travelFee: travelFee,
        mapUrl:
          "https://www.google.com/maps/search/?api=1&query=" + lat + "," + lng,
      },
    };
  } catch (e) {
    return {
      success: false,
      message: "Logistics Engine Failure: " + e.toString(),
    };
  }
}
