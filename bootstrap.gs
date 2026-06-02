/**
 * Application Bootstrapper
 * Orchestrates the instantiation and wiring of all architectural layers.
 */
var App = App || {};

(function() {

  function bootstrap() {
    // 1. Core Utilities & Config are already in App namespace via core.gs

    // 2. Initialize Repositories
    var r = App.Repositories;
    // (Actual Repository classes are defined in repositories.gs)

    // 3. Initialize Services
    var s = App.Services;
    // (Actual Service classes are defined in services.gs)

    // 4. Instantiate Use Cases with Dependencies (SOLID Dependency Inversion)
    // NOTE: Access global Use Case constructor functions directly to avoid recursion
    var utils = App.Utils;
    var config = App.Config;

    App.Registry = {
      verifyToken: new VerifyTokenUseCase(),
      syncDevice: new SyncDeviceUseCase(r.Sessions, utils),
      logoutDevice: new LogoutDeviceUseCase(r.Sessions, utils),
      getNotifications: new GetNotificationsUseCase(r.Notifications, utils),
      sendNotification: new SendNotificationUseCase(s.Messaging),
      broadcastNotification: new BroadcastNotificationUseCase(s.Messaging),
      verifyLogistics: new VerifyLogisticsUseCase(s.Location, config),
      getPlaceSuggestions: new GetPlaceSuggestionsUseCase(s.Location),
      processLocationMetrics: new ProcessLocationMetricsUseCase(s.Location),
      processPinDropMetrics: new ProcessPinDropMetricsUseCase(s.Location),
      createOrder: new CreateOrderUseCase(r.Products, r.Orders, utils),
      cancelOrder: new CancelOrderUseCase(r.Products, r.Orders, utils),
      getOrders: new GetOrdersUseCase(r.Orders, r.Products, utils),
      getOrderDetails: new GetOrderDetailsUseCase(r.Orders, r.Products),
      getProducts: new GetProductsUseCase(r.Products, r.Reviews, utils),
      getCategories: new GetCategoriesUseCase(r.Categories),
      addReview: new AddReviewUseCase(r.Reviews),
      getCartPreview: new GetCartPreviewUseCase(r.Products, utils),
      getReviews: new GetReviewsUseCase(r.Reviews, r.Orders, utils),
      searchProducts: new SearchProductsUseCase(r.Products, r.Reviews, utils),
      processPayment: new ProcessPaymentUseCase(r.Payments, utils),
      refundPayment: new RefundPaymentUseCase(r.Payments, utils),
      updateOrderStatus: new UpdateOrderStatusUseCase(r.Orders, utils)
    };

    // 5. Setup Event Listeners
    App.EventDispatcher.on("ORDER_CREATED", function(data) {
      var sessions = r.Sessions.getAll().filter(function(s) { return s.firebase_uid === data.uid && s.fcm_token; });
      var tokens = sessions.map(function(s) { return s.fcm_token; });
      if (tokens.length > 0) {
        s.Messaging.sendMulticast(tokens, "Order Placed!", "Your order " + data.orderId + " has been created.", { orderId: data.orderId });
      }
    });

    App.EventDispatcher.on("PAYMENT_COMPLETED", function(data) {
      var order = r.Orders.findByOrderId(data.orderId);
      if (order && order.status === App.Constants.ORDER_STATUS.PENDING) {
        r.Orders.updateRow(order._rowIndex, { status: App.Constants.ORDER_STATUS.PAID });
      }
    });

    App.EventDispatcher.on("LOW_STOCK_ALERT", function(data) {
      r.Logs.add({
        timestamp: new Date().toISOString(),
        action: "LOW_STOCK_ALERT",
        firebase_uid: "system",
        status: "WARNING",
        details: "Product " + data.title + " (" + data.productId + ") is low on stock: " + data.stock
      });
    });
  }

  // Trigger bootstrap on first access to App.Registry
  var originalRegistry = null;
  Object.defineProperty(App, "UseCases", {
    get: function() {
      if (!originalRegistry) {
        bootstrap();
        originalRegistry = App.Registry;
      }
      return originalRegistry;
    }
  });

})();
