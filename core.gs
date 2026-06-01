/**
 * Global Namespace for the Application
 */
var App = App || {};

(function() {
  App.Config = getSettings();

  App.Constants = {
    ORDER_STATUS: ORDER_STATUS,
    ACTIONS: ACTIONS,
    SHEET_HEADERS: SHEET_HEADERS
  };

  App.Response = {
    success: jsonSuccess,
    error: jsonError
  };

  App.Utils = {
    generateId: generateUniqueId,
    parsePayload: parseRequestPayload,
    withLock: withLock,
    withLockRetry: withLockDelayedRetry
  };

})();
