/**
 * AppController to handle routing and execution flow
 */
var AppController = {
  handleRequest: function(e) {
    try {
      var payload = App.Utils.parsePayload(e);
      if (!payload.action) {
        return App.Response.error("Action target missing");
      }

      var result;
      switch (payload.action) {
        case App.Constants.ACTIONS.VERIFY_TOKEN:
          result = App.UseCases.verifyToken(payload);
          break;
        case App.Constants.ACTIONS.SYNC_DEVICE:
          result = App.UseCases.syncDevice(payload);
          break;
        case App.Constants.ACTIONS.LOGOUT_DEVICE:
          result = App.UseCases.logoutDevice(payload);
          break;
        case App.Constants.ACTIONS.GET_NOTIFICATIONS:
          result = App.UseCases.getNotifications(payload);
          break;
        case App.Constants.ACTIONS.SEND_NOTIFICATION:
          result = App.UseCases.sendNotification(payload);
          break;
        case App.Constants.ACTIONS.BROADCAST_NOTIFICATION:
          result = App.UseCases.broadcastNotification(payload);
          break;
        case App.Constants.ACTIONS.VERIFY_LOGISTICS:
          result = App.UseCases.verifyLogistics(payload);
          break;
        case App.Constants.ACTIONS.GET_PLACE_SUGGESTIONS:
          result = App.UseCases.getPlaceSuggestions(payload);
          break;
        case App.Constants.ACTIONS.PROCESS_LOCATION_METRICS:
          result = App.UseCases.processLocationMetrics(payload);
          break;
        case App.Constants.ACTIONS.PROCESS_PIN_DROP_METRICS:
          result = App.UseCases.processPinDropMetrics(payload);
          break;
        case App.Constants.ACTIONS.CREATE_ORDER:
          result = App.UseCases.createOrder(payload);
          break;
        case App.Constants.ACTIONS.CANCEL_ORDER:
          result = App.UseCases.cancelOrder(payload);
          break;
        default:
          return App.Response.error("Unknown action: " + payload.action);
      }
      return App.Response.success(result);

    } catch (err) {
      return App.Response.error(err.toString());
    }
  }
};

/**
 * Main entry point for POST requests
 */
function doPost(e) {
  return AppController.handleRequest(e);
}
