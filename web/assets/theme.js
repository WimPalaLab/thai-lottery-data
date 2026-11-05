// โหมดสี: สว่างเป็นค่าเริ่มต้นเสมอ (ไม่ตามการตั้งค่าของระบบ) เปลี่ยนเป็นมืดเมื่อผู้ใช้กดเลือกเอง
// ไฟล์นี้โหลดแบบปกติ (ไม่ใช่ module) ใน <head> เพื่อใส่ data-theme ก่อนหน้าเว็บแสดง จะได้ไม่กะพริบ
"use strict";
(function () {
  var t = null;
  try { t = window.localStorage.getItem("li-theme"); } catch (e) { t = null; }
  document.documentElement.setAttribute("data-theme", t === "dark" ? "dark" : "light");
})();
