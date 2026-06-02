/**
 * AppController to handle routing and execution flow with Middleware support
 */
var AppController = (function() {
  var registry = {};
  var globalMiddlewares = [];

  function init() {
    var u = App.UseCases, a = App.Constants.ACTIONS;

    // Global Middlewares
    globalMiddlewares = [App.Middleware.Log];

    // Registry: [UseCaseInstance, LocalMiddlewares, ValidationSchema]
    var auth = App.Middleware.Auth;

    registry[a.VERIFY_TOKEN] = [u.verifyToken, [auth], { idToken: "string" }];
    registry[a.SYNC_DEVICE] = [u.syncDevice, [auth], { idToken: "string", clientId: "string" }];
    registry[a.LOGOUT_DEVICE] = [u.logoutDevice, [], { clientId: "string" }];
    registry[a.GET_NOTIFICATIONS] = [u.getNotifications, [auth], { idToken: "string" }];
    registry[a.SEND_NOTIFICATION] = [u.sendNotification, [], { tokens: "array", title: "string", body: "string" }];
    registry[a.BROADCAST_NOTIFICATION] = [u.broadcastNotification, [], { title: "string", body: "string" }];
    registry[a.VERIFY_LOGISTICS] = [u.verifyLogistics, [], {}];
    registry[a.GET_PLACE_SUGGESTIONS] = [u.getPlaceSuggestions, [], { inputToken: "string" }];
    registry[a.PROCESS_LOCATION_METRICS] = [u.processLocationMetrics, [], { originLat: "number", originLng: "number", destinationQuery: "string" }];
    registry[a.PROCESS_PIN_DROP_METRICS] = [u.processPinDropMetrics, [], { originLat: "number", originLng: "number", pinLat: "number", pinLng: "number" }];
    registry[a.CREATE_ORDER] = [u.createOrder, [auth], { idToken: "string", products: "array" }];
    registry[a.CANCEL_ORDER] = [u.cancelOrder, [auth], { idToken: "string", orderId: "string" }];
    registry[a.GET_PRODUCTS] = [u.getProducts, [], {}];
    registry[a.GET_CATEGORIES] = [u.getCategories, [], {}];
    registry[a.ADD_REVIEW] = [u.addReview, [auth], { idToken: "string", productId: "string", reviewText: "string", starRating: "number" }];
    registry[a.GET_REVIEWS] = [u.getReviews, [], { productId: "string" }];
    registry[a.PROCESS_PAYMENT] = [u.processPayment, [auth], { idToken: "string", orderId: "string", amount: "number" }];
    registry[a.SEARCH_PRODUCTS] = [u.searchProducts, [], {}];
    registry[a.GET_ORDERS] = [u.getOrders, [auth], { idToken: "string" }];
    registry[a.GET_ORDER_DETAILS] = [u.getOrderDetails, [auth], { idToken: "string", orderId: "string" }];
    registry[a.REFUND_PAYMENT] = [u.refundPayment, [auth], { idToken: "string", paymentId: "string" }];
    registry[a.UPDATE_ORDER_STATUS] = [u.updateOrderStatus, [auth], { idToken: "string", orderId: "string", status: "string" }];
  }

  function runPipeline(middlewares, payload, finalTask) {
    var index = 0;
    function next() {
      if (index < middlewares.length) {
        var mw = middlewares[index++];
        return mw(payload, next);
      } else {
        return finalTask(payload);
      }
    }
    return next();
  }

  return {
    handleRequest: function(e) {
      try {
        if (Object.keys(registry).length === 0) init();

        var payload = App.Utils.parsePayload(e);
        if (!payload.action) return App.Response.error("Action target missing", 400);

        var config = registry[payload.action];
        if (!config) return App.Response.error("Unknown action: " + payload.action, 404);

        var useCase = config[0];
        var localMiddlewares = config[1];
        var schema = config[2];

        // Combine Middlewares
        var pipeline = globalMiddlewares.concat(localMiddlewares);

        // Add implicit Validation Middleware if schema exists
        var hasSchema = schema && (Array.isArray(schema) ? schema.length > 0 : Object.keys(schema).length > 0);
        if (hasSchema) {
          pipeline.push(function(p, next) {
            App.Utils.validate(p, schema);
            return next();
          });
        }

        var result = runPipeline(pipeline, payload, function(p) {
          return useCase.execute(p);
        });

        return App.Response.success(result, payload.action);
      } catch (err) {
        var status = err.status || 500;
        var message = err.message || err.toString();
        var action = (typeof payload !== 'undefined' && payload) ? payload.action : undefined;
        if (status === 500) Logger.log("Critical Error: " + (err.stack || err));
        return App.Response.error(message, status, action);
      }
    }
  };
})();

function doPost(e) {
  return AppController.handleRequest(e);
}
