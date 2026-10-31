/**
 * =========================================================================
 * 陳富國 博士 個人線上 CV - Google Apps Script (GAS) 後端程式碼
 * =========================================================================
 * 
 * 功能：
 * 1. doGet(e)  : 處理即時到訪人數讀取與累加 (Stats 試算表)
 * 2. doPost(e) : 處理 Modal 聯絡表單送出、防垃圾信蜜罐過濾、寫入 Inquiries 試算表，
 *                並自動發送 Gmail 即時通知信給陳教授。
 * 
 * 設定步驟：
 * 1. 請至 Google 雲端硬碟建立一個新的「Google 試算表」（例如命名為：CV_Data）。
 * 2. 點擊頂部選單「擴充功能」->「Apps Script」。
 * 3. 清空原本的程式碼，將本檔案 (Code.gs) 內容完整複製貼上。
 * 4. 將下方 NOTIFY_EMAIL 變更為您的接收信箱（預設為 fgchen@gmail.com）。
 * 5. 點擊右上角「部署」->「新部署」：
 *    - 種類選擇：「網頁應用程式 (Web App)」
 *    - 說明：CV Backend API
 *    - 執行身分：「我 (您的 Google 帳號)」
 *    - 誰可以存取：「任何人 (Anyone)」 (請務必選 Anyone，訪客才能提交表單)
 * 6. 點擊「部署」並授權權限，取得「網頁應用程式網址 (Web App URL)」。
 * 7. 將取得的網址貼回 index.html 中的 const GAS_WEB_APP_URL = "您的網址"; 即可！
 * =========================================================================
 */

var NOTIFY_EMAIL = "fgchen@gmail.com"; // 接收洽詢通知的信箱
var PROFESSOR_NAME = "陳富國 博士";

/**
 * 處理 GET 請求：訪客計數器
 * 參數：action = "increment" (累加人數) 或 "get_only" (僅查詢不累加)
 */
function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || "increment";
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var statsSheet = ss.getSheetByName("Stats");
  
  // 若工作表不存在則自動初始化
  if (!statsSheet) {
    statsSheet = ss.insertSheet("Stats");
    statsSheet.getRange("A1").setValue("統計項目");
    statsSheet.getRange("B1").setValue("數值");
    statsSheet.getRange("A2").setValue("累計造訪人次");
    statsSheet.getRange("B2").setValue(1280); // 起始造訪基準值
    statsSheet.getRange("A3").setValue("最後更新時間");
    statsSheet.getRange("B3").setValue(new Date());
    statsSheet.setFrozenRows(1);
  }
  
  var currentVisits = Number(statsSheet.getRange("B2").getValue()) || 0;
  
  if (action === "increment") {
    currentVisits += 1;
    statsSheet.getRange("B2").setValue(currentVisits);
    statsSheet.getRange("B3").setValue(new Date());
  }
  
  var response = {
    result: "success",
    visits: currentVisits,
    action: action,
    timestamp: new Date().toISOString()
  };
  
  return ContentService.createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * 處理 POST 請求：接收 Modal 聯絡表單
 */
function doPost(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("Inquiries");
    
    // 初始化 Inquiries 表單
    if (!sheet) {
      sheet = ss.insertSheet("Inquiries");
      sheet.appendRow(["提交時間", "姓名", "單位/學校/公司", "Email", "電話/LINE", "洽詢類型", "需求說明"]);
      sheet.setFrozenRows(1);
      // 美化標題列背景顏色
      sheet.getRange(1, 1, 1, 7).setBackground("#005689").setFontColor("#ffffff").setFontWeight("bold");
    }
    
    var data = {};
    if (e.postData && e.postData.contents) {
      data = JSON.parse(e.postData.contents);
    } else if (e.parameter) {
      data = e.parameter;
    }
    
    // 1. 【蜜罐防護】檢查隱藏欄位是否被機器人填入
    if (data.hp_website && String(data.hp_website).trim() !== "") {
      Logger.log("Spam detected and ignored: " + JSON.stringify(data));
      return ContentService.createTextOutput(JSON.stringify({
        result: "success",
        message: "Ignored spam"
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    var nowStr = Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy-MM-dd HH:mm:ss");
    
    // 2. 寫入試算表新列
    sheet.appendRow([
      nowStr,
      data.name || "",
      data.organization || "",
      data.email || "",
      data.phone || "",
      data.type || "",
      data.message || ""
    ]);
    
    // 3. 【即時 Email 通知】發送通知信給老師
    try {
      var subject = "【CV網站新邀約】" + (data.name || "訪客") + " - " + (data.type || "合作洽詢");
      var body = "您好，" + PROFESSOR_NAME + "：\n\n"
        + "您的個人線上 CV 網站收到了一筆新的洽詢邀約！\n\n"
        + "────────────────────────\n"
        + "■ 提交時間：" + nowStr + "\n"
        + "■ 訪客姓名：" + (data.name || "未提供") + "\n"
        + "■ 所屬單位：" + (data.organization || "未提供") + "\n"
        + "■ 電子郵件：" + (data.email || "未提供") + "\n"
        + "■ 聯絡電話/LINE：" + (data.phone || "未填寫") + "\n"
        + "■ 洽詢類型：" + (data.type || "未指定") + "\n"
        + "■ 需求與留言內容：\n" + (data.message || "無內容") + "\n"
        + "────────────────────────\n\n"
        + "您可以直接回覆此信件或依上述聯絡方式與對方接洽。\n\n"
        + "祝 研安\n個人 CV 自動通知系統";
      
      MailApp.sendEmail(NOTIFY_EMAIL, subject, body);
    } catch (mailErr) {
      Logger.log("Email notification failed: " + mailErr);
    }
    
    // 4. 【訪客確認信】自動回覆確認信給填表者
    if (data.email && data.email.indexOf("@") !== -1) {
      try {
        var replySubject = "【已收到您的洽詢邀約】" + PROFESSOR_NAME + " 的個人網站";
        var replyBody = data.name + " 先生/女士 您好：\n\n"
          + "感謝您造訪 " + PROFESSOR_NAME + " 的個人線上履歷並留下洽詢訊息。\n"
          + "我們已收到您的「" + (data.type || "合作") + "」需求，將於 1-2 個工作天內由本人儘速與您聯繫。\n\n"
          + "您填寫的洽詢摘要如下：\n"
          + "────────────────────────\n"
          + "洽詢類型：" + (data.type || "") + "\n"
          + "洽詢內容：" + (data.message || "") + "\n"
          + "────────────────────────\n\n"
          + "祝 順心\n"
          + PROFESSOR_NAME + " 敬上\n"
          + "弘光科技大學 智慧科技應用系\n"
          + "個人網站：https://fgchen.com/";
          
        MailApp.sendEmail(data.email, replySubject, replyBody);
      } catch (clientMailErr) {
        Logger.log("Client auto-reply failed: " + clientMailErr);
      }
    }
    
    return ContentService.createTextOutput(JSON.stringify({
      result: "success",
      message: "Data recorded and emails sent successfully"
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    Logger.log("doPost Error: " + error);
    return ContentService.createTextOutput(JSON.stringify({
      result: "error",
      message: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}
