/**
 * Global Namespace for the Application
 */
var App = App || {};

(function() {
  /**
   * Custom Error Types
   */
  App.AppError = function(message, status) {
    this.message = message;
    this.status = status || 500;
    this.name = "AppError";
  };
  App.AppError.prototype = Object.create(Error.prototype);

  App.ValidationError = function(message) {
    App.AppError.call(this, message, 400);
    this.name = "ValidationError";
  };
  App.ValidationError.prototype = Object.create(App.AppError.prototype);

  App.AuthError = function(message) {
    App.AppError.call(this, message || "Unauthorized", 401);
    this.name = "AuthError";
  };
  App.AuthError.prototype = Object.create(App.AppError.prototype);

  /**
   * Middleware Implementation
   */
  App.Middleware = {
    Log: function(payload, next) {
      var startTime = Date.now();
      var status = "SUCCESS";
      var details = "";
      var result;

      try {
        result = next();
        return result;
      } catch (e) {
        status = "ERROR";
        details = e.message || e.toString();
        throw e;
      } finally {
        try {
          var uid = (payload.user && payload.user.uid) ? payload.user.uid : (payload.idToken === "guest_session" ? "guest" : "anonymous");
          App.Repositories.Logs.add([
            new Date().toISOString(),
            payload.action,
            uid,
            status,
            details || "Duration: " + (Date.now() - startTime) + "ms"
          ]);
        } catch (logErr) {
          Logger.log("Failed to persist log: " + logErr.toString());
        }
      }
    },

    Auth: function(payload, next) {
      // Auth service is needed, but we can't easily inject it into a global static function
      // without App.Services being initialized. Since this runs inside handleRequest
      // where App.Services is ready, we use it directly.
      var authResult = App.Services.Auth.verifyToken(payload.idToken);
      if (payload.idToken !== "guest_session" && !authResult.isValid) {
        throw new App.AuthError(authResult.error);
      }
      // Attach user info to payload
      payload.user = authResult;
      return next();
    }
  };

  /**
   * Event Dispatcher (Simple Pub/Sub)
   */
  App.EventDispatcher = (function() {
    var listeners = {};
    return {
      on: function(event, callback) {
        if (!listeners[event]) listeners[event] = [];
        listeners[event].push(callback);
      },
      dispatch: function(event, data) {
        if (!listeners[event]) return;
        listeners[event].forEach(function(callback) {
          try {
            callback(data);
          } catch (e) {
            Logger.log("Event Error [" + event + "]: " + e.toString());
          }
        });
      }
    };
  })();

  /**
   * Configuration Management
   */
  App.Config = (function() {
    var props = PropertiesService.getScriptProperties().getProperties();
    return {
      MERCHANT_ID: props.MERCHANT_ID || "IDBCR2DN5TVPLKL4KZ",
      SPREADSHEET_ID: props.SPREADSHEET_ID || "1MQD92fUET_gAD_c8l6Hl6Hn0UosG-PVjMcVDoQfFCSY",
      FIREBASE_PROJECT_ID: props.FIREBASE_PROJECT_ID || "antinnamain",
      FIREBASE_SERVICE_ACCOUNT: props.FIREBASE_SERVICE_ACCOUNT || null,
      HUB_LAT: parseFloat(props.HUB_LAT || "28.527867"),
      HUB_LNG: parseFloat(props.HUB_LNG || "76.083600"),
      MAX_SERVICE_RADIUS_KM: parseFloat(props.MAX_SERVICE_RADIUS_KM || "30"),
      TRAVEL_FEE_PER_KM: parseFloat(props.TRAVEL_FEE_PER_KM || "5"),
      TIMEZONE: props.TIMEZONE || Session.getScriptTimeZone(),
      NOTIFICATIONS_ENABLED: props.NOTIFICATIONS_ENABLED === "false" ? "false" : "true",
      LOW_STOCK_THRESHOLD: parseInt(props.LOW_STOCK_THRESHOLD || "5", 10)
    };
  })();

  // Backwards compatibility for getSettings()
  getSettings = function() { return App.Config; };

  /**
   * Application Constants
   */
  App.Constants = {
    ORDER_STATUS: ORDER_STATUS,
    ACTIONS: ACTIONS,
    SHEET_HEADERS: SHEET_HEADERS
  };

  /**
   * Response Helpers
   */
  App.Response = {
    success: function(data, action) {
      var envelope = { success: true, timestamp: new Date().toISOString(), data: data };
      if (action) envelope.action = action;
      return ContentService.createTextOutput(JSON.stringify(envelope))
        .setMimeType(ContentService.MimeType.JSON);
    },
    error: function(message, status, action) {
      var envelope = { success: false, timestamp: new Date().toISOString(), error: message, status: status || 500 };
      if (action) envelope.action = action;
      return ContentService.createTextOutput(JSON.stringify(envelope))
        .setMimeType(ContentService.MimeType.JSON);
    }
  };

  /**
   * Shared Utilities
   */
  App.Utils = {
    generateId: function(prefix) {
      var datePart = Utilities.formatDate(new Date(), App.Config.TIMEZONE, "yyyyMMdd");
      return prefix + "-" + datePart + "-" + Utilities.getUuid().split("-")[0];
    },

    parsePayload: function(e) {
      try {
        return e.postData && e.postData.contents ? JSON.parse(e.postData.contents) : (e.parameter || {});
      } catch (err) {
        throw new Error("Malformed payload structure");
      }
    },

    withLock: function(callback, timeoutMs) {
      var lock = LockService.getScriptLock();
      if (!lock.tryLock(timeoutMs || 30000)) throw new Error("Server busy. Retry shortly.");
      try {
        return callback();
      } finally {
        lock.releaseLock();
      }
    },

    paginate: function(data, page, limit) {
      page = parseInt(page || 1, 10);
      limit = parseInt(limit || 10, 10);
      var total = data.length;
      var totalPages = Math.ceil(total / limit);
      return {
        items: data.slice((page - 1) * limit, page * limit),
        pagination: {
          total_records: total,
          total_pages: totalPages,
          current_page: page,
          limit_per_page: limit,
          has_next: page < totalPages,
          has_prev: page > 1
        }
      };
    },

    validate: function(payload, schema) {
      var self = this;
      if (Array.isArray(schema)) {
        schema.forEach(function(field) {
          if (!payload[field]) throw new App.ValidationError("Missing required field: " + field);
        });
        return;
      }

      Object.keys(schema).forEach(function(field) {
        var rule = schema[field];
        var val = payload[field];
        var type = typeof rule === 'string' ? rule : rule.type;

        if (val === undefined || val === null || val === "") {
          throw new App.ValidationError("Missing required field: " + field);
        }

        // Type Check
        if (type === "array" && !Array.isArray(val)) throw new App.ValidationError("Field " + field + " must be an array");
        if (type !== "array" && typeof val !== type) throw new App.ValidationError("Field " + field + " must be a " + type);

        // Nested Validation for Arrays of Objects
        if (type === "array" && rule.items && Array.isArray(val)) {
          val.forEach(function(item, idx) {
            try {
              self.validate(item, rule.items);
            } catch (e) {
              throw new App.ValidationError("Invalid item at " + field + "[" + idx + "]: " + e.message);
            }
          });
        }

        // Complex Rules
        if (typeof rule === 'object') {
          if (rule.min !== undefined && val < rule.min) throw new App.ValidationError("Field " + field + " must be at least " + rule.min);
          if (rule.max !== undefined && val > rule.max) throw new App.ValidationError("Field " + field + " must be at most " + rule.max);
          if (rule.pattern && !new RegExp(rule.pattern).test(val)) throw new App.ValidationError("Field " + field + " format is invalid");
        }
      });
    }
  };

})();
