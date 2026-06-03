function getOrCreateSheet(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet(); // comment me and tht if not the scope of the function is global and not bound to a container

  // If not bound to a container, fall back to the standalone spreadsheet ID
  if (!ss) {
    var settings = getSettings();
    if (!settings.SPREADSHEET_ID) {
      throw new Error("SPREADSHEET_ID is not configured");
    }
    ss = SpreadsheetApp.openById(settings.SPREADSHEET_ID);
  }

  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);

    // Dynamically look up the headers using the sheet name
    var headers = SHEET_HEADERS[name] || [];

    // Check if matching headers were actually defined in your configuration
    if (headers && headers.length > 0) {
      sheet.appendRow(headers);
      sheet
        .getRange(1, 1, 1, headers.length)
        .setFontWeight("bold")
        .setBackground("#E0E0E0");
    }
  }
  return sheet;
}

function getSheetRowsAsJson(sheetName) {
  var sheet = getOrCreateSheet(sheetName);
  var values = sheet.getDataRange().getValues();
  if (values.length <= 1) return [];

  var headers = values[0];
  var list = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var obj = {};
    for (var j = 0; j < headers.length; j++) {
      obj[headers[j]] = row[j];
    }
    obj._rowIndex = i + 1;
    list.push(obj);
  }
  return list;
}
