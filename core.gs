/**
 * Global Namespace for the Application
 */
var App = App || {};

(function() {
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
      NOTIFICATIONS_ENABLED: (props.NOTIFICATIONS_ENABLED !== "false" && props.NOTIFICATIONS_ENABLED !== undefined) || "true"
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
    success: function(data) {
      return ContentService.createTextOutput(JSON.stringify({ success: true, data: data }))
        .setMimeType(ContentService.MimeType.JSON);
    },
    error: function(message) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: message }))
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
    }
  };

})();
