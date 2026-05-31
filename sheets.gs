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
