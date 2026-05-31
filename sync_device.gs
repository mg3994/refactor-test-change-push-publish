/**
 * Handles device session state registration synchronization
 */
function handleSyncDevice(payload) {
  var authResult = verifyFirebaseToken(payload.idToken);
  var uid = authResult.uid || "guest";

  return withLock(function () {
    var sheet = getOrCreateSheet("sessions");
    var rows = getSheetRowsAsJson("sessions");
    var exist = rows.find(function (r) {
      return r.client_id === payload.clientId;
    });
    var nowStr = new Date().toISOString();

    if (exist) {
      sheet.getRange(exist._rowIndex, 2).setValue(uid);
      sheet.getRange(exist._rowIndex, 3).setValue(payload.deviceToken || "");
      sheet.getRange(exist._rowIndex, 5).setValue(nowStr);
    } else {
      sheet.appendRow([
        payload.clientId,
        uid,
        payload.deviceToken || "",
        payload.clientName || "Browser",
        nowStr,
      ]);
    }
    SpreadsheetApp.flush();
    return jsonSuccess({ synced: true });
  });
}
