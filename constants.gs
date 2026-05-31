var ORDER_STATUS = {
  PENDING: "PENDING",
  CANCELLED: "CANCELLED",
  DELIVERED: "DELIVERED",
};

var ACTIONS = {
  // Authentication & Notification Actions
  VERIFY_TOKEN: "verifyFirebaseToken",
  SEND_NOTIFICATION: "sendFcmNotification",
  BROADCAST_NOTIFICATION: "broadcastFcmNotification",

  // ... your other actions
  GET_NOTIFICATIONS: "get_notifications",

  // Device Synchronization State Actions
  SYNC_DEVICE: "SYNC_DEVICE",
  LOGOUT_DEVICE: "LOGOUT_DEVICE", // Added missing action key

  // Added Map Engine API Actions
  GET_PLACE_SUGGESTIONS: "getPlaceSuggestions",
  PROCESS_LOCATION_METRICS: "processLocationMetrics",
  PROCESS_PIN_DROP_METRICS: "processPinDropMetrics",

  // New Logistics Radius Action
  VERIFY_LOGISTICS: "verifyLogistics",

  // Order Management Actions

  CREATE_ORDER: "CREATE_ORDER",
  CANCEL_ORDER: "CANCEL_ORDER",
};
