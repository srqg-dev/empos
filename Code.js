function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
         .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL); 
}
