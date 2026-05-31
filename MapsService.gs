/**
 * ============================================================================
 * MAPS & GEOLOCATION SERVICE WRAPPER
 * ============================================================================
 */

/**
 * Action Handler: GET_PLACE_SUGGESTIONS
 * Expects payload: { inputToken: "..." }
 */
function handleGetPlaceSuggestions(payload) {
  if (!payload.inputToken) {
    return jsonError("Missing required parameter: inputToken");
  }
  var suggestions = getPlaceSuggestions(payload.inputToken);
  return jsonSuccess({ suggestions: suggestions });
}

/**
 * Action Handler: PROCESS_LOCATION_METRICS
 * Expects payload: { originLat: 1.23, originLng: 4.56, destinationQuery: "..." }
 */
function handleProcessLocationMetrics(payload) {
  if (
    payload.originLat === undefined ||
    payload.originLng === undefined ||
    !payload.destinationQuery
  ) {
    return jsonError(
      "Missing routing parameters (originLat, originLng, or destinationQuery).",
    );
  }
  var metrics = processLocationAndMetrics(
    payload.originLat,
    payload.originLng,
    payload.destinationQuery,
  );

  return metrics.status === "success"
    ? jsonSuccess(metrics)
    : jsonError(metrics.message);
}

/**
 * Action Handler: PROCESS_PIN_DROP_METRICS
 * Expects payload: { originLat: 1.23, originLng: 4.56, pinLat: 7.89, pinLng: 10.11 }
 */
function handleProcessPinDropMetrics(payload) {
  if (
    payload.originLat === undefined ||
    payload.originLng === undefined ||
    payload.pinLat === undefined ||
    payload.pinLng === undefined
  ) {
    return jsonError("Missing explicit pin coordinates or origin properties.");
  }
  var metrics = processPinDropMetrics(
    payload.originLat,
    payload.originLng,
    payload.pinLat,
    payload.pinLng,
  );

  return metrics.status === "success"
    ? jsonSuccess(metrics)
    : jsonError(metrics.message);
}

/**
 * 1. Fetches autocompletion/geocoding string references based on an address input fragment
 */
function getPlaceSuggestions(inputToken) {
  if (!inputToken || inputToken.length < 3) return [];

  try {
    var response = Maps.newGeocoder().geocode(inputToken);
    if (response.results && response.results.length > 0) {
      return response.results.map(function (result) {
        return result.formatted_address;
      });
    }
    return [];
  } catch (e) {
    console.error("Suggestions processing error: " + e.toString());
    return [];
  }
}

/**
 * 2. Processes a textual address to extract coordinates and compute routing metrics
 */
function processLocationAndMetrics(originLat, originLng, destinationQuery) {
  try {
    var geocode = Maps.newGeocoder().geocode(destinationQuery);
    if (!geocode.results || geocode.results.length === 0) {
      throw new Error("Target destination coordinates could not be resolved.");
    }

    var result = geocode.results[0];
    var targetAddress = result.formatted_address;
    var targetLat = result.geometry.location.lat;
    var targetLng = result.geometry.location.lng;

    return calculateMatrixMetrics(
      originLat,
      originLng,
      targetLat,
      targetLng,
      targetAddress,
    );
  } catch (e) {
    return { status: "error", message: e.toString() };
  }
}

/**
 * 3. Processes raw latitude/longitude from a manual map Pin Drop
 */
function processPinDropMetrics(originLat, originLng, pinLat, pinLng) {
  try {
    var response = Maps.newGeocoder().reverseGeocode(pinLat, pinLng);
    var targetAddress =
      "Pinned Location (" + pinLat.toFixed(4) + ", " + pinLng.toFixed(4) + ")";

    if (response.results && response.results.length > 0) {
      targetAddress = response.results[0].formatted_address;
    }

    return calculateMatrixMetrics(
      originLat,
      originLng,
      pinLat,
      pinLng,
      targetAddress,
    );
  } catch (e) {
    return { status: "error", message: e.toString() };
  }
}

/**
 * Helper to calculate Driving Distance and Duration Matrix metrics via the Native Service Wrapper
 */
function calculateMatrixMetrics(
  originLat,
  originLng,
  targetLat,
  targetLng,
  targetAddress,
) {
  var directions = Maps.newDirectionFinder()
    .setOrigin(originLat, originLng)
    .setDestination(targetLat + "," + targetLng)
    .setMode(Maps.DirectionFinder.Mode.DRIVING)
    .getDirections();

  var distance = "N/A";
  var duration = "N/A";

  if (directions.routes && directions.routes.length > 0) {
    var route = directions.routes[0].legs[0];
    distance = route.distance.text;
    duration = route.duration.text;
  }

  return {
    status: "success",
    address: targetAddress,
    lat: targetLat,
    lng: targetLng,
    distance: distance,
    duration: duration,
  };
}
