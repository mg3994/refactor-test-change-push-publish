/**
 * AppController to handle routing and execution flow
 */
var AppController = {
  handleRequest: function(e) {
    try {
      var payload = App.Utils.parsePayload(e);
      if (!payload.action) return App.Response.error("Action target missing");

      var useCase = App.UseCases[payload.action] || this._findUseCaseByAction(payload.action);
      if (!useCase) return App.Response.error("Unknown action: " + payload.action);

      var result = useCase.execute(payload);
      return App.Response.success(result);
    } catch (err) {
      return App.Response.error(err.toString());
    }
  },

  _findUseCaseByAction: function(action) {
    // Map action names to use case keys if they don't match exactly
    var map = {};
    map[App.Constants.ACTIONS.VERIFY_TOKEN] = App.UseCases.verifyToken;
    map[App.Constants.ACTIONS.SYNC_DEVICE] = App.UseCases.syncDevice;
    map[App.Constants.ACTIONS.LOGOUT_DEVICE] = App.UseCases.logoutDevice;
    map[App.Constants.ACTIONS.GET_NOTIFICATIONS] = App.UseCases.getNotifications;
    map[App.Constants.ACTIONS.SEND_NOTIFICATION] = App.UseCases.sendNotification;
    map[App.Constants.ACTIONS.BROADCAST_NOTIFICATION] = App.UseCases.broadcastNotification;
    map[App.Constants.ACTIONS.VERIFY_LOGISTICS] = App.UseCases.verifyLogistics;
    map[App.Constants.ACTIONS.GET_PLACE_SUGGESTIONS] = App.UseCases.getPlaceSuggestions;
    map[App.Constants.ACTIONS.PROCESS_LOCATION_METRICS] = App.UseCases.processLocationMetrics;
    map[App.Constants.ACTIONS.PROCESS_PIN_DROP_METRICS] = App.UseCases.processPinDropMetrics;
    map[App.Constants.ACTIONS.CREATE_ORDER] = App.UseCases.createOrder;
    map[App.Constants.ACTIONS.CANCEL_ORDER] = App.UseCases.cancelOrder;
    map[App.Constants.ACTIONS.GET_PRODUCTS] = App.UseCases.getProducts;
    map[App.Constants.ACTIONS.GET_CATEGORIES] = App.UseCases.getCategories;
    map[App.Constants.ACTIONS.ADD_REVIEW] = App.UseCases.addReview;
    map[App.Constants.ACTIONS.GET_REVIEWS] = App.UseCases.getReviews;
    map[App.Constants.ACTIONS.PROCESS_PAYMENT] = App.UseCases.processPayment;
    map[App.Constants.ACTIONS.SEARCH_PRODUCTS] = App.UseCases.searchProducts;

    return map[action];
  }
};

/**
 * Main entry point for POST requests
 */
function doPost(e) {
  return AppController.handleRequest(e);
}
