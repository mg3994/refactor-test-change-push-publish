function getSettings() {
  var props = PropertiesService.getScriptProperties().getProperties();

  return {
    MERCHANT_ID: props.MERCHANT_ID || "IDBCR2DN5TVPLKL4KZ",

    SPREADSHEET_ID:
      props.SPREADSHEET_ID || "1MQD92fUET_gAD_c8l6Hl6Hn0UosG-PVjMcVDoQfFCSY",

    FIREBASE_API_KEY:
      props.FIREBASE_API_KEY || "AIzaSyDtRB-0S8VNgY-HoQYAAvkLX7iOAK-K-i0",

    FIREBASE_PROJECT_ID: props.FIREBASE_PROJECT_ID || "antinnamain",

    FIREBASE_SERVICE_ACCOUNT: props.FIREBASE_SERVICE_ACCOUNT || null,

    HUB_ADDRESS: props.HUB_ADDRESS || "Charkhi Dadri, Haryana, India",

    HUB_LAT: parseFloat(props.HUB_LAT || "28.527867"),

    HUB_LNG: parseFloat(props.HUB_LNG || "76.083600"),

    MAX_SERVICE_RADIUS_KM: parseFloat(props.MAX_SERVICE_RADIUS_KM || "30"),

    TRAVEL_FEE_PER_KM: parseFloat(props.TRAVEL_FEE_PER_KM || "5"),

    TIMEZONE: props.TIMEZONE || Session.getScriptTimeZone(),
    NOTIFICATIONS_ENABLED:
      (props.NOTIFICATIONS_ENABLED !== "false" &&
        props.NOTIFICATIONS_ENABLED !== undefined) ||
      "true",
  };
}
