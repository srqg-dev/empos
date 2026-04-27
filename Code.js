// ID ของ Google Sheet ที่เก็บข้อมูลออเดอร์
const SPREADSHEET_ID = '1d7kgPx9Dbk9r0lKeK6RAzj5qW9GyqtxiAyEKryRmzCc';
const SHEET_NAME = 'Orderinformation';
const CACHE_KEY = 'orders_data';

// ID ของ Google Sheet ที่จะใช้เก็บข้อมูลใบสำคัญจ่าย
const VOUCHER_SPREADSHEET_ID = '1BGLtCLTFvsskK2EEz8sYAHLgwIIALYb_KYeeudJ0E-c';
const VOUCHER_SHEET_NAME = 'Customerinformation';

/**
 * ฟังก์ชันหลักในการแสดงผลหน้าเว็บ
 */
function doGet(e) {
  return HtmlService.createTemplateFromFile('index')
    .evaluate()
    .setTitle('Iftar Order Checklist')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
}

/**
 * ฟังก์ชันสำหรับดึงข้อมูลออเดอร์
 */
function getOrders() {
  const cache = CacheService.getScriptCache();
  const cachedData = cache.get(CACHE_KEY);
  if (cachedData != null) {
    return JSON.parse(cachedData);
  }
  return fetchAndCacheOrders();
}

/**
 * ฟังก์ชันสำหรับดึงข้อมูลล่าสุดจาก Sheet โดยตรง (สำหรับปุ่มรีเฟรช)
 */
function getFreshOrders() {
    return fetchAndCacheOrders();
}

/**
 * ดึงข้อมูลจาก Google Sheets, ตรวจสอบออเดอร์ซ้ำ และเก็บใน Cache
 */
function fetchAndCacheOrders() {
  try {
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
    const range = sheet.getRange(2, 1, sheet.getLastRow() - 1, 21);
    const values = range.getValues();

    // เปลี่ยนจาก Set เป็น Object เพื่อนับจำนวนออเดอร์ของแต่ละคน
    const orderCounts = {}; 

    let orders = values.map((row, index) => {
      if (!row[9] || !row[11]) return null;
      
      const customerName = row[9].toString().trim();
      
      // --- แก้ไขข้อ 1: จัดการรูปแบบเบอร์โทรศัพท์ ---
      let phone = row[11].toString().trim();
      // ลบตัวอักษรที่ไม่ใช่ตัวเลขออก (เช่น - หรือ วรรค)
      phone = phone.replace(/\D/g, ''); 
      // ถ้ามี 9 หลัก ให้เติม 0 ข้างหน้า
      if (phone.length === 9) {
          phone = '0' + phone;
      }
      // ----------------------------------------

      const duplicateKey = `${customerName}|${phone}`;

      // นับจำนวนออเดอร์ของคนนี้
      orderCounts[duplicateKey] = (orderCounts[duplicateKey] || 0) + 1;

      // จัดการสถานะเริ่มต้น หรือแปลงสถานะเก่า 'ออเดอร์ใหม่' เป็น 'รอดำเนินการ'
      let currentStatus = row[19] || 'รอดำเนินการ';
      if (currentStatus === 'ออเดอร์ใหม่') {
          currentStatus = 'รอดำเนินการ';
      }

      return {
        rowNumber: index + 2,                
        orderId: row[0],                     
        date: formatDate(row[1]),            
        time: formatTime(row[2]),
        orderItems: row[7],                  
        quantity: row[8],
        customerName: customerName,          
        facebook: row[10],
        phone: phone, // ใช้เบอร์ที่จัดรูปแบบแล้ว
        deliveryMethod: row[12],
        address: row[13],
        notes: row[14],
        paymentMethod: row[15],              
        paymentStatus: row[16],
        totalAmount: row[17],                
        slipUrl: row[18],
        packingStatus: currentStatus,
        documentNumber: row[20],             
        duplicateKey: duplicateKey,
        isDuplicate: false // จะมาอัปเดตทีหลัง
      };
    }).filter(order => order !== null);

    // --- แก้ไขข้อ 3: ตรวจสอบออเดอร์ซ้ำแบบระบุทุกรายการ ---
    // วนลูปอีกครั้งเพื่อระบุสถานะ duplicate ให้กับทุกออเดอร์ที่มียอดซ้ำ > 1
    orders.forEach(order => {
        if (orderCounts[order.duplicateKey] > 1) {
            order.isDuplicate = true;
        }
    });
    // --------------------------------------------------

    orders.reverse();
    // ลบ Logic เก่าที่ใช้ seenOrders ออก

    const cache = CacheService.getScriptCache();
    cache.put(CACHE_KEY, JSON.stringify(orders), 300);

    return orders;
  } catch (error) {
    Logger.log('Error in fetchAndCacheOrders: ' + error.toString());
    return [];
  }
}

/**
 * อัปเดตสถานะการจัดของ และเคลียร์ Cache
 */
function updatePackingStatus(rowNumber, status) {
  try {
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
    sheet.getRange(rowNumber, 20).setValue(status);
    
    const cache = CacheService.getScriptCache();
    cache.remove(CACHE_KEY);
    
    return `Order in row ${rowNumber} status updated to ${status}`;
  } catch (error) {
    Logger.log('Error in updatePackingStatus: ' + error.toString());
    return 'Error updating status.';
  }
}

// --- Helper Functions ---
function formatDate(dateObject) {
  if (dateObject instanceof Date && !isNaN(dateObject)) {
    let day = ('0' + dateObject.getDate()).slice(-2);
    let month = ('0' + (dateObject.getMonth() + 1)).slice(-2);
    let year = dateObject.getFullYear() + 543; // Convert to Buddhist Era
    return `${day}/${month}/${year}`;
  }
  return dateObject;
}

function formatTime(dateObject) {
    if (dateObject instanceof Date && !isNaN(dateObject)) {
        let hours = ('0' + dateObject.getHours()).slice(-2);
        let minutes = ('0' + dateObject.getMinutes()).slice(-2);
        return `${hours}:${minutes}`;
    }
    return '';
}
