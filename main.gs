function doPost(e) {
  try {
    var payload = parseRequestPayload(e);

    if (!payload.action) {
      return jsonError("Action target missing");
    }

    // Dynamic routing based on the payload action
    switch (payload.action) {
      case ACTIONS.VERIFY_TOKEN:
        return handleVerifyFirebaseToken(payload);

      case ACTIONS.SEND_NOTIFICATION:
        return handleSendFcmNotification(payload);

      case ACTIONS.BROADCAST_NOTIFICATION:
        return handleBroadcastFcmNotification(payload);

      case ACTIONS.GET_NOTIFICATIONS:
        return handleGetNotifications(payload, e);
      // --- Device Sync Routing Engines ---
      case ACTIONS.SYNC_DEVICE:
        return handleSyncDevice(payload); // Extracted execution frame logic below

      case ACTIONS.LOGOUT_DEVICE:
        return handleLogoutDevice(payload);

      // Map Engine Actions Routed to MapsService.gs
      case ACTIONS.GET_PLACE_SUGGESTIONS:
        return handleGetPlaceSuggestions(payload);

      case ACTIONS.PROCESS_LOCATION_METRICS:
        return handleProcessLocationMetrics(payload);

      case ACTIONS.PROCESS_PIN_DROP_METRICS:
        return handleProcessPinDropMetrics(payload);

      case ACTIONS.VERIFY_LOGISTICS:
        return handleVerifyLogistics(payload);

      // --- 🛒 NEW ORDER MANAGEMENT ROUTING ---
      case ACTIONS.CREATE_ORDER:
        return handleCreateOrderAction(payload);

      case ACTIONS.CANCEL_ORDER:
        return handleCancelOrderAction(payload);

      // Added Payment Route
      case ACTIONS.RECORD_PAYMENT:
        return handleRecordPaymentAction(payload);

      default:
        return jsonError("Unknown action: " + payload.action);
    }
  } catch (err) {
    return jsonError(err.toString());
  }
}
