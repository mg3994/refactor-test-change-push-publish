/**
 * Use Cases for the Application
 */
var UseCases = {

  verifyToken: function(payload) {
    var authResult = App.Services.Auth.verifyToken(payload.idToken);
    if (!authResult.isValid) {
      throw new Error(authResult.error);
    }
    return authResult;
  },

  syncDevice: function(payload) {
    var authResult = App.Services.Auth.verifyToken(payload.idToken);
    var uid = authResult.uid || "guest";
    var clientId = payload.clientId;
    var deviceToken = payload.deviceToken || "";
    var clientName = payload.clientName || "Browser";

    return App.Utils.withLock(function() {
      var exist = App.Repositories.Sessions.findByClientId(clientId);
      var nowStr = new Date().toISOString();

      if (exist) {
        App.Repositories.Sessions.updateRow(exist._rowIndex, {
          firebase_uid: uid,
          fcm_token: deviceToken,
          last_synced: nowStr
        });
      } else {
        App.Repositories.Sessions.add([clientId, uid, deviceToken, clientName, nowStr]);
      }
      return { synced: true };
    });
  },

  logoutDevice: function(payload) {
    var clientId = payload.clientId;
    if (!clientId) throw new Error("Client instance context marker missing.");

    return App.Utils.withLock(function() {
      var exist = App.Repositories.Sessions.findByClientId(clientId);
      if (exist) {
        App.Repositories.Sessions.updateRow(exist._rowIndex, {
          firebase_uid: "guest",
          fcm_token: "",
          last_synced: new Date().toISOString()
        });
      }
      return { loggedOut: true };
    });
  },

  getNotifications: function(payload) {
    var authResult = App.Services.Auth.verifyToken(payload.idToken);
    if (!authResult.isValid) throw new Error("Unauthorized session.");

    var targetUid = authResult.uid;
    var statusFilter = payload.status;
    var page = parseInt(payload.page || 1, 10);
    var limit = parseInt(payload.limit || 10, 10);

    var allNotifications = App.Repositories.Notifications.findByUid(targetUid);

    if (statusFilter) {
      allNotifications = allNotifications.filter(function(r) {
        return String(r.status).trim().toLowerCase() === String(statusFilter).trim().toLowerCase();
      });
    }

    allNotifications.sort(function(a, b) {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    var totalRecords = allNotifications.length;
    var totalPages = Math.ceil(totalRecords / limit);
    var startIndex = (page - 1) * limit;
    var paginated = allNotifications.slice(startIndex, startIndex + limit);

    return {
      notifications: paginated,
      pagination: {
        total_records: totalRecords,
        total_pages: totalPages,
        current_page: page,
        limit_per_page: limit,
        has_next_page: page < totalPages,
        has_previous_page: page > 1
      }
    };
  },

  sendNotification: function(payload) {
    if (!payload.tokens || !Array.isArray(payload.tokens) || payload.tokens.length === 0) {
      throw new Error("Missing target device tokens array.");
    }
    var executionMap = App.Services.Messaging.sendMulticast(
      payload.tokens,
      payload.title,
      payload.body,
      payload.data || null
    );
    var successes = executionMap.filter(function(r) { return r.success; }).length;
    return {
      totalProcessed: executionMap.length,
      successCount: successes,
      failureCount: executionMap.length - successes,
      details: executionMap
    };
  },

  broadcastNotification: function(payload) {
    var messageId = App.Services.Messaging.broadcast(
      payload.topic,
      payload.title,
      payload.body,
      payload.data
    );
    return { topic: payload.topic || "all_users", messageId: messageId };
  },

  verifyLogistics: function(payload) {
    var settings = App.Config;
    var lat = parseFloat(payload.pinLat);
    var lng = parseFloat(payload.pinLng);
    var address = payload.userAddress || "";

    if (isNaN(lat) || isNaN(lng)) {
      if (!address) throw new Error("Provide either a structured text address or direct pin coordinates.");
      var geocode = App.Services.Location.geocode(address);
      lat = geocode.geometry.location.lat;
      lng = geocode.geometry.location.lng;
      address = geocode.formatted_address;
    }

    var origin = settings.HUB_LAT + "," + settings.HUB_LNG;
    var destination = lat + "," + lng;
    var route = App.Services.Location.getDistanceAndDuration(origin, destination);

    var distanceKm = route.distance.value / 1000;
    var isServicable = distanceKm <= settings.MAX_SERVICE_RADIUS_KM;
    var travelFee = Math.ceil(distanceKm * settings.TRAVEL_FEE_PER_KM);

    return {
      normalizedAddress: address,
      lat: lat,
      lng: lng,
      distanceKm: distanceKm.toFixed(2),
      estimatedTravelTime: route.duration.text,
      isServicable: isServicable,
      travelFee: travelFee,
      mapUrl: "https://www.google.com/maps/search/?api=1&query=" + lat + "," + lng
    };
  },

  getPlaceSuggestions: function(payload) {
    return { suggestions: App.Services.Location.getSuggestions(payload.inputToken) };
  },

  processLocationMetrics: function(payload) {
    var origin = payload.originLat + "," + payload.originLng;
    var geocode = App.Services.Location.geocode(payload.destinationQuery);
    var destination = geocode.geometry.location.lat + "," + geocode.geometry.location.lng;

    var route = App.Services.Location.getDistanceAndDuration(origin, destination);
    return {
      status: "success",
      address: geocode.formatted_address,
      lat: geocode.geometry.location.lat,
      lng: geocode.geometry.location.lng,
      distance: route.distance.text,
      duration: route.duration.text
    };
  },

  processPinDropMetrics: function(payload) {
    var origin = payload.originLat + "," + payload.originLng;
    var destination = payload.pinLat + "," + payload.pinLng;
    var reverse = App.Services.Location.reverseGeocode(payload.pinLat, payload.pinLng);

    var route = App.Services.Location.getDistanceAndDuration(origin, destination);
    return {
      status: "success",
      address: reverse.formatted_address,
      lat: payload.pinLat,
      lng: payload.pinLng,
      distance: route.distance.text,
      duration: route.duration.text
    };
  },

  createOrder: function(payload) {
    var authResult = App.Services.Auth.verifyToken(payload.idToken);
    if (!authResult.isValid) throw new Error("Unauthorized.");

    return App.Utils.withLock(function() {
      // Inventory Validation
      var productsToOrder = payload.products || [];
      var productUpdates = [];

      productsToOrder.forEach(function(item) {
        var product = App.Repositories.Products.findByProductId(item.product_id);
        if (!product) throw new Error("Product not found: " + item.product_id);
        var currentStock = parseInt(product.stock || 0, 10);
        if (currentStock < item.quantity) throw new Error("Insufficient stock for: " + product.title);
        productUpdates.push({ rowIndex: product._rowIndex, newStock: currentStock - item.quantity });
      });

      // Commit Inventory Changes
      productUpdates.forEach(function(update) {
        App.Repositories.Products.updateRow(update.rowIndex, { stock: update.newStock });
      });

      var orderId = App.Utils.generateId("ORD");
      var nowStr = new Date().toISOString();

      var orderData = [
        orderId,
        authResult.uid,
        JSON.stringify(productsToOrder),
        payload.totalAmount,
        payload.travelFee || 0,
        App.Constants.ORDER_STATUS.PENDING,
        payload.shippingPhone,
        payload.fullAddress,
        payload.latitude,
        payload.longitude,
        payload.customerNote || "",
        nowStr,
        nowStr
      ];

      App.Repositories.Orders.add(orderData);
      return { orderId: orderId, status: App.Constants.ORDER_STATUS.PENDING };
    });
  },

  cancelOrder: function(payload) {
    var authResult = App.Services.Auth.verifyToken(payload.idToken);
    if (!authResult.isValid) throw new Error("Unauthorized.");

    return App.Utils.withLock(function() {
      var order = App.Repositories.Orders.findByOrderId(payload.orderId);
      if (!order) throw new Error("Order not found.");
      if (order.firebase_uid !== authResult.uid) throw new Error("Permission denied.");
      if (order.status === App.Constants.ORDER_STATUS.CANCELLED) throw new Error("Order already cancelled.");

      // Restore Inventory
      var orderedProducts = JSON.parse(order.product_details || "[]");
      orderedProducts.forEach(function(item) {
        var product = App.Repositories.Products.findByProductId(item.product_id);
        if (product) {
          var currentStock = parseInt(product.stock || 0, 10);
          App.Repositories.Products.updateRow(product._rowIndex, { stock: currentStock + item.quantity });
        }
      });

      App.Repositories.Orders.updateRow(order._rowIndex, {
        status: App.Constants.ORDER_STATUS.CANCELLED,
        updated_at: new Date().toISOString()
      });
      return { cancelled: true };
    });
  }
};

/**
 * eCommerce specific Use Cases
 */
UseCases.getProducts = function(payload) {
  var products = App.Repositories.Products.getAll();
  if (payload.categoryId) {
    products = products.filter(function(p) {
      return p.category_ids && p.category_ids.split(",").indexOf(payload.categoryId) !== -1;
    });
  }
  return { products: products };
};

UseCases.getCategories = function() {
  return { categories: App.Repositories.Categories.getAll() };
};

UseCases.addReview = function(payload) {
  var authResult = App.Services.Auth.verifyToken(payload.idToken);
  if (!authResult.isValid) throw new Error("Unauthorized.");

  var reviewData = [
    payload.productId,
    payload.orderId || "",
    payload.reviewText,
    payload.starRating,
    new Date().toISOString()
  ];
  App.Repositories.Reviews.add(reviewData);
  return { reviewed: true };
};

UseCases.getReviews = function(payload) {
  if (!payload.productId) throw new Error("Product ID missing.");
  return { reviews: App.Repositories.Reviews.findByProductId(payload.productId) };
};

UseCases.searchProducts = function(payload) {
  var query = (payload.query || "").toLowerCase();
  var products = App.Repositories.Products.getAll();
  if (query) {
    products = products.filter(function(p) {
      return (p.title || "").toLowerCase().indexOf(query) !== -1 ||
             (p.description || "").toLowerCase().indexOf(query) !== -1;
    });
  }
  return { products: products };
};

UseCases.processPayment = function(payload) {
  var authResult = App.Services.Auth.verifyToken(payload.idToken);
  if (!authResult.isValid) throw new Error("Unauthorized.");

  var paymentId = App.Utils.generateId("PAY");
  var nowStr = new Date().toISOString();

  // Handle Google Pay Payload specifically
  var paymentMethod = "UPI";
  var paymentDescription = "Standard Transaction";
  var transactionRef = payload.transactionRef || "";

  if (payload.googlePayResponse) {
    var gpay = payload.googlePayResponse;
    paymentMethod = gpay.details && gpay.details.paymentMethodData ? gpay.details.paymentMethodData.type : "GOOGLE_PAY";
    paymentDescription = gpay.details && gpay.details.paymentMethodData ? gpay.details.paymentMethodData.description : "Google Pay Transaction";

    // Extract token or transaction ref from GPay response if available
    if (gpay.details && gpay.details.paymentMethodData && gpay.details.paymentMethodData.tokenizationData) {
      transactionRef = gpay.details.paymentMethodData.tokenizationData.token;
    }
  }

  var paymentData = [
    paymentId,
    transactionRef,
    "", // refund_ref
    authResult.uid,
    payload.orderId,
    payload.amount,
    "SUCCESS",
    paymentMethod,
    paymentDescription,
    JSON.stringify(payload.googlePayResponse || payload.metadata || {}),
    nowStr
  ];

  App.Repositories.Payments.add(paymentData);
  return { paymentId: paymentId, status: "SUCCESS", method: paymentMethod };
};

(function() {
  App.UseCases = UseCases;
})();
