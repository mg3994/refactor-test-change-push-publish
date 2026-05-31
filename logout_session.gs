/**
 * Handles clearing out device tokens completely upon explicit client logout execution
 */
function handleLogoutDevice(payload) {
  if (!payload.clientId) {
    return jsonError("Client instance context marker missing.");
  }

  return withLock(function () {
    var sheet = getOrCreateSheet("sessions");
    var rows = getSheetRowsAsJson("sessions");
    var exist = rows.find(function (r) {
      return r.client_id === payload.clientId;
    });

    if (exist) {
      // Clears the critical mapping fields (UID and Device Token tracking data values)
      sheet.getRange(exist._rowIndex, 2).setValue("guest");
      sheet.getRange(exist._rowIndex, 3).setValue(""); // Purges active notification token trace
      sheet.getRange(exist._rowIndex, 5).setValue(new Date().toISOString());
      SpreadsheetApp.flush();
    }
    return jsonSuccess({ loggedOut: true });
  });
}
