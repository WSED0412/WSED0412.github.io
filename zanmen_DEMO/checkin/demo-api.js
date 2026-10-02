/*
  贊鬥盃示範站 —— 在瀏覽器裡扮演大腦（只給報到／檢錄那四頁用）

  示範站是靜態網頁，沒有大腦可以收「送出」。這支把頁面打給大腦的請求
  （/reg/*、/checkin*、/whoami、/status）在瀏覽器裡接住，照 brain.py 的規則回應：
  reg_claim / reg_card / reg_search / reg_confirm / reg_pin_code / reg_add_walkin /
  checkin_submit / checkin_bind / checkin_decide / roster_match / near_names。
  回應的欄位跟真的大腦一樣，所以頁面本身一行都不用改。

  資料只存在看的人自己的瀏覽器（localStorage），四個頁面共用同一份，
  才能「選手登錄 → 櫃台確認 → 選手檢錄 → 審核通過」一路接著做。
  報名名單是固定種子產生的假名單，每個人看到的都一樣。

  brain.py 的規則改了，這裡要跟著改 —— 這支只在示範站用，不會影響正式系統。
*/
(function () {
  "use strict";
  var KEY = "zanmen_demo_state_v1";
  var DIVS = ["A", "B", "C", "D"];
  var NICK_MAX = 8, CHECKIN_MAX_NO = 128;
  var CODE_CHARS = "23456789ACDEFGHJKLMNPQRSTUVWXYZ";
  var STAFF = "示範工作人員";

  /* ---------- 固定的假名單（跟手冊截圖同一套姓氏與名字） ---------- */
  var SUR = "陳林黃張李王吳劉蔡楊許鄭謝郭洪曾邱廖賴徐周葉蘇莊呂江何蕭羅高".split("");
  var GIV = ["彥廷","品睿","柏翔","家瑋","承恩","宗翰","柏睿","哲瑋","尚儒","凱文",
             "家豪","宇軒","柏翰","紹群","奕安","廷威","子齊","冠廷","昱翔","詩涵",
             "宥辰","侑霖","泓叡","秉諭","禹丞","翊安","浩宇","睿騏","立翔","采潔",
             "宸睿","楷崴","宥霖","子恩","羽辰","昀熙","品妍","若晴","梓睿","柏丞"];
  function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  var R = rng(20261001), pool = [];
  SUR.forEach(function (s) { GIV.forEach(function (g) { pool.push(s + g); }); });
  for (var i = pool.length - 1; i > 0; i--) { var j = Math.floor(R() * (i + 1)); var t = pool[i]; pool[i] = pool[j]; pool[j] = t; }
  var BASE_ROSTER = [];
  for (var n = 0; n < 512; n++) {
    var ph = "09" + String(10000000 + Math.floor(R() * 89999999)).slice(0, 8);
    BASE_ROSTER.push({ name: pool[n], div: DIVS[Math.floor(n / 128)], phone: ph,
                       id4: String(1000 + Math.floor(R() * 8999)) });
  }
  // 名單上故意留一組同名的人：檢錄審核頁才看得到「同名多人」的標籤
  BASE_ROSTER.push({ name: BASE_ROSTER[5].name, div: "B", phone: "0955123456", id4: "7788" });
  window.ZANMEN_DEMO_SAMPLES = BASE_ROSTER.slice(0, 3);

  /* ---------- 報到梯次（batch.py 的 batches.csv） ----------
     跟報到名單同一批人：同一位假選手可以先查梯次、再走報到檢錄。
     16 梯、每梯 32 人，13:00 起每 15 分鐘一梯。 */
  function batchOf(i) {
    var b = Math.floor(i / 32), m = 13 * 60 + b * 15;
    return { batch: "第 " + (b + 1) + " 梯", time: ("0" + Math.floor(m / 60)).slice(-2) + ":" + ("0" + m % 60).slice(-2),
             place: "一樓宴會廳 報到台", note: "" };
  }
  var BATCH_FAIL = { n: 0, until: 0 };     // batch.py：連續查錯 20 次鎖 10 分鐘

  /* ---------- 正規化（brain.py norm_name / norm_phone / digits_only） ---------- */
  var VARIANT = {"臺":"台","峯":"峰","珏":"玨","裇":"恤","叶":"葉","託":"托","黄":"黃","呉":"吳","吴":"吳",
    "曽":"曾","张":"張","陈":"陳","刘":"劉","杨":"楊","郑":"鄭","谢":"謝","罗":"羅","苏":"蘇","卢":"盧",
    "萧":"蕭","锺":"鍾","钟":"鍾","冯":"馮","邓":"鄧","许":"許","赵":"趙","韩":"韓","龙":"龍",
    "徳":"德","恒":"恆","裡":"裏","鉅":"巨","眞":"真","靑":"青"};
  function half(s) { return String(s == null ? "" : s).replace(/[！-～]/g,
    function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); }); }
  function normName(s) { return half(String(s == null ? "" : s).trim()).replace(/　/g, "")
    .replace(/[\s\S]/g, function (c) { return VARIANT[c] || c; }).replace(/\s+/g, "").toLowerCase(); }
  function digitsOnly(s) { return half(s).replace(/[^0-9]/g, ""); }
  function normPhone(s) { var d = digitsOnly(s); if (d.indexOf("886") === 0) d = "0" + d.slice(3); return d; }

  /* ---------- 狀態（localStorage；讀不到就從空的開始） ---------- */
  function load() {
    try { var s = JSON.parse(localStorage.getItem(KEY) || "null"); if (s && s.v === 1) return s; } catch (e) {}
    return { v: 1, done: {}, claims: {}, checkin: {}, added: [] };
  }
  function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} }
  window.zanmenDemoReset = function () { try { localStorage.removeItem(KEY); } catch (e) {} };

  function build(s) {   // REG（rid -> 一列）與 ROSTER（正規化姓名 -> 列）
    var REG = {}, ROSTER = {};
    BASE_ROSTER.concat(s.added).forEach(function (p) {
      var k = normName(p.name), rid = k + "|" + p.phone, m = 1;
      while (REG[rid]) { m++; rid = k + "|" + p.phone + "#" + m; }
      var d = s.done[rid];
      REG[rid] = { rid: rid, name: p.name, phone: p.phone, id4: p.id4, div: p.div,
                   done: !!d, ts: d ? d.ts : 0, by: d ? d.by : "" };
      (ROSTER[k] = ROSTER[k] || []).push(REG[rid]);
    });
    return { REG: REG, ROSTER: ROSTER };
  }
  function now() { return Math.floor(Date.now() / 1000); }
  function vals(o) { return Object.keys(o).map(function (k) { return o[k]; }); }

  function regRow(r) { return { rid: r.rid, name: r.name, id4: r.id4, div: r.div, done: r.done, ts: r.ts, by: r.by }; }
  function regStats(s, D) {
    var ck = vals(s.checkin), regs = vals(D.REG), done = regs.filter(function (r) { return r.done; }).length;
    return { total: regs.length, done: done, left: regs.length - done,
             checkin_done: ck.filter(function (c) { return c.state === "approved"; }).length,
             checkin_pending: ck.filter(function (c) { return c.state === "pending"; }).length, intake: "open" };
  }
  function checkinStats(s, D) {
    var v = vals(s.checkin), regs = vals(D.REG);
    var dupes = Object.keys(D.ROSTER).filter(function (k) { return D.ROSTER[k].length > 1; })
                      .map(function (k) { return D.ROSTER[k][0].name; });
    return { pending: v.filter(function (c) { return c.state === "pending"; }).length,
             approved: v.filter(function (c) { return c.state === "approved"; }).length,
             rejected: v.filter(function (c) { return c.state === "rejected"; }).length,
             roster: regs.length, dupes: dupes,
             reg_done: regs.filter(function (r) { return r.done; }).length, reg_total: regs.length, intake: "open" };
  }
  function regCard(s, D, code) {
    code = String(code || "").trim().toUpperCase(); var c = s.claims[code]; if (!c) return null;
    return { code: code, match: c.match || "none", typed: { name: c.name || "", phone: c.phone || "" },
             rows: (c.rids || []).filter(function (r) { return D.REG[r]; }).map(function (r) { return regRow(D.REG[r]); }) };
  }
  function regStatus(D, name) {
    var hits = vals(D.REG).filter(function (r) { return normName(r.name) === normName(name); });
    if (!hits.length) return "unknown";
    if (hits.length > 1 && hits.some(function (h) { return h.done; }) && hits.some(function (h) { return !h.done; })) return "dupe";
    return hits[0].done ? "done" : "none";
  }
  // brain.py _edit1：編輯距離，相鄰兩字對調算一次
  function edit1(a, b, cap) {
    var la = a.length, lb = b.length; if (Math.abs(la - lb) > cap) return cap + 1;
    var prev2 = null, prev = []; for (var j = 0; j <= lb; j++) prev.push(j);
    for (var i = 1; i <= la; i++) {
      var cur = [i]; for (j = 1; j <= lb; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] !== b[j - 1] ? 1 : 0));
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) cur[j] = Math.min(cur[j], prev2[j - 2] + 1);
      }
      if (Math.min.apply(null, cur) > cap) return cap + 1; prev2 = prev; prev = cur;
    }
    return prev[lb];
  }
  function nearNames(D, k) {
    if (!k) return []; var out = [];
    Object.keys(D.ROSTER).forEach(function (kk) {
      if (!kk || kk === k) return; var cap = Math.max(k.length, kk.length) <= 3 ? 1 : 2;
      var d = edit1(kk, k, cap); if (d <= cap) out.push([d, kk.length, D.ROSTER[kk][0].name]);
    });
    out.sort(function (x, y) { return x[0] - y[0] || x[1] - y[1]; });
    return out.slice(0, 5).map(function (x) { return x[2]; });
  }
  function rosterMatch(D, name, div) {
    var hits = D.ROSTER[normName(name)] || [];
    if (!hits.length) return ["none", nearNames(D, normName(name))];
    if (hits.length > 1) return ["dupe", hits.map(function (h) { return h.name; })];
    var h = hits[0]; if (h.div && div && h.div.toUpperCase() !== div.toUpperCase()) return ["wrongdiv", [h.div]];
    return ["ok", [h.name]];
  }
  function regByCode(s, D, code) {
    var c = s.claims[String(code || "").trim().toUpperCase()]; if (!c) return [null, "none"];
    var rids = c.rid ? [c.rid] : (c.rids || []);
    var rows = rids.filter(function (r) { return D.REG[r]; }).map(function (r) { return D.REG[r]; });
    if (!rows.length) return [null, "none"]; if (rows.length > 1) return [null, "dupe"];
    return rows[0].done ? [rows[0], "ok"] : [rows[0], "notreg"];
  }

  /* ---------- 各端點 ---------- */
  function newCode(s) { for (;;) { var c = ""; for (var i = 0; i < 6; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]; if (!s.claims[c]) return c; } }

  function regClaim(s, D, name, phone) {
    var k = normName(name), p = normPhone(phone), regs = vals(D.REG);
    var byPhone = regs.filter(function (r) { return p && r.phone === p; });
    var byName = regs.filter(function (r) { return r.name && normName(r.name) === k; });
    var both = byPhone.filter(function (r) { return normName(r.name) === k; });
    var rids, m;
    if (both.length) { rids = both; m = "ok"; } else if (byPhone.length) { rids = byPhone; m = "phone"; }
    else if (byName.length) { rids = byName; m = "name"; } else { rids = []; m = "none"; }
    var code = newCode(s);
    s.claims[code] = { rids: rids.map(function (r) { return r.rid; }), name: String(name || "").trim().slice(0, 20),
                       phone: p, match: m, ts: now() };
    return code;
  }

  function checkinSubmit(s, D, div, code, name, nick, reg) {
    div = String(div || "").toUpperCase().trim(); code = String(code || "").toUpperCase().trim();
    name = String(name || "").trim(); nick = String(nick || "").trim().slice(0, NICK_MAX);
    var rid = null, regDiv = "";
    if (reg) {
      var rr = regByCode(s, D, reg), row = rr[0], why = rr[1];
      if (why === "none") return [false, "查不到這組報到代碼。請確認是報到時拿到的那一組，或找檢錄台的工作人員"];
      if (why === "dupe") return [false, "這組代碼還沒在報到台確認是哪一位，請先完成報到"];
      if (why === "notreg") return [false, "你還沒完成報到。請先到報到台完成報到，再回來檢錄"];
      name = row.name; rid = row.rid; regDiv = String(row.div || "").toUpperCase().trim();
    }
    if (DIVS.indexOf(div) < 0) return [false, "賽區不正確"];
    if (!/^[A-D]-?\d{1,3}$/.test(code)) return [false, "編號格式應為 A-001"];
    var no = parseInt(code.slice(1).replace(/^-/, ""), 10);
    if (!(no >= 1 && no <= CHECKIN_MAX_NO))
      return [false, "編號只到 " + CHECKIN_MAX_NO + " 號，你輸入的是 " + no + " 號。請再看一次號碼牌，還是不對就找檢錄台的工作人員"];
    code = code[0] + "-" + ("00" + no).slice(-3);
    if (code[0] !== div) return [false, "這個編號屬於 " + code[0] + " 區，請掃 " + code[0] + " 區的 QR"];
    if (!name) return [false, "請填姓名"];
    if (!nick) return [false, "請填顯示名稱（想公開本名也可以直接填本名）"];
    var ex = s.checkin[code];
    if (ex && ex.state === "approved") return [false, code + " 已經完成檢錄"];
    var st, cand;
    if (rid) { if (regDiv && DIVS.indexOf(regDiv) >= 0 && regDiv !== div) { st = "wrongdiv"; cand = [regDiv]; } else { st = "ok"; cand = [name]; } }
    else { var m = rosterMatch(D, name, div); st = m[0]; cand = m[1]; }
    var newCred = !!rid || st === "ok";
    var exCred = !!(ex && ex.state === "pending" && (ex.match === "ok" || ex.rid));
    if (ex && ex.state === "pending" && normName(ex.name || "") !== normName(name) && !(newCred && !exCred))
      return [false, code + " 已經有人送出檢錄、正在等審核。如果你確定這是你的號碼，請到檢錄台請工作人員處理"];
    if (!rid && ex && ex.state === "pending" && ex.rid) { rid = ex.rid; name = ex.name; st = "ok"; cand = ex.cand || [ex.name]; }
    s.checkin[code] = { code: code, div: div, name: name, nick: nick, state: "pending", ts: now(), by: "",
                        match: st, cand: cand, rid: rid };
    return [true, "已送出，請到檢錄台等裁判審核"];
  }

  function walkin(s, D, body) {
    var name = String(body.name || "").trim().slice(0, 20), phone = normPhone(body.phone),
        div = String(body.div || "").trim().toUpperCase(), id4 = String(body.id4 || "").replace(/[^0-9A-Za-z]/g, "").slice(-4);
    if (!name) return { ok: false, error: "請填姓名" };
    if (div && DIVS.indexOf(div) < 0) return { ok: false, error: "賽區只能是 " + DIVS.join("／") };
    var hits = D.ROSTER[normName(name)] || [];
    if (hits.length && !body.force)
      return { ok: false, dupe: true, error: "名單上已經有同名的人",
               same: hits.map(function (h) { return { name: h.name, phone: h.phone, id4: h.id4, div: h.div }; }) };
    if (phone && hits.some(function (h) { return h.phone === phone; }))
      return { ok: false, error: "這個人已經在名單上了（姓名和電話都一樣），不需要再補一次" };
    s.added.push({ name: name, div: div, phone: phone, id4: id4 });
    return { ok: true, msg: "已補進名單（目前 " + (BASE_ROSTER.length + s.added.length) + " 人）。請他到檢錄台領號碼。" };
  }

  // batch.py find()：姓名＋電話兩個都對才算，對到了才把同一支電話的其他人一起列出來
  function findBatch(body) {
    if (BATCH_FAIL.until > Date.now())
      return { locked: true, retry_min: Math.max(1, Math.floor((BATCH_FAIL.until - Date.now()) / 60000) + 1) };
    var n = normName(body.name), p = normPhone(body.phone), rows = [];
    if (n && p && BASE_ROSTER.some(function (r) { return normName(r.name) === n && r.phone === p; })) {
      BASE_ROSTER.forEach(function (r, i) { if (r.phone === p) {
        var b = batchOf(i); rows.push({ name: r.name, batch: b.batch, time: b.time, place: b.place, note: b.note, self: normName(r.name) === n });
      } });
      rows.sort(function (a, b) { return (b.self - a.self) || (a.name < b.name ? -1 : 1); });
      rows.forEach(function (r) { delete r.self; });
      BATCH_FAIL.n = 0;
    } else if (String(body.name || "").trim() && String(body.phone || "").trim()) {
      if (++BATCH_FAIL.n >= 20) { BATCH_FAIL.until = Date.now() + 600000; BATCH_FAIL.n = 0; }
    }
    return { rows: rows };
  }

  function route(method, path, q, body, pin) {
    if (path === "/find") return [200, findBatch(body)];
    var s = load(), D = build(s), staff = !!String(pin || "").trim();
    var needPin = { ok: false, relogin: true, error: "這台裝置的登入已失效（PIN 可能被改過），請重新輸入 PIN" };
    if (path === "/status")
      return [200, { boot: "demo", ver: "demo", now: now(), mode: "checkin", label: "檢錄中", msg: "",
                     paused_at: 0, intake: "open", report: "open", nickMax: NICK_MAX, n: 1 }];
    // 帳號登入（裁判自己申請的帳號）示範站沒有：各頁的「改用帳號密碼登入」按下去照實說
    if (path === "/account/login" || path === "/account/register")
      return [200, { ok: false, error: "示範站不能用帳號登入，請用畫面角落寫的示範 PIN" }];
    if (path === "/whoami") {
      if (!staff) return [200, { required: true, nickMax: NICK_MAX, codeMax: CHECKIN_MAX_NO }];
      return [200, { required: true, ok: true, name: STAFF, admin: false,
                     desk: "reg-desk.html", review: "checkin-review.html", multi: "", single: "" }];
    }
    if (method === "GET") {
      if (/^\/reg\//.test(path) || path === "/checkin/list") { if (!staff) return [401, needPin]; }
      if (path === "/reg/stats") return [200, { ok: true, stats: regStats(s, D) }];
      if (path === "/reg/search") {
        var qq = String(q.get("q") || "").trim(), nk = normName(qq), dg = digitsOnly(qq), out = [];
        if (qq) vals(D.REG).some(function (r) {
          if ((nk && normName(r.name).indexOf(nk) >= 0) || (dg && (r.phone.indexOf(dg) >= 0 || dg === r.id4))) out.push(regRow(r));
          return out.length >= 40; });
        out.sort(function (a, b) { return (a.done - b.done) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0); });
        return [200, { ok: true, rows: out, stats: regStats(s, D) }];
      }
      if (path === "/reg/card") return [200, { ok: true, card: regCard(s, D, q.get("code")), stats: regStats(s, D) }];
      if (path === "/checkin/list") {
        var rows = vals(s.checkin).sort(function (a, b) { return ((a.state !== "pending") - (b.state !== "pending")) || (b.ts - a.ts); })
          .map(function (c) { var o = JSON.parse(JSON.stringify(c)); o.reg = regStatus(D, c.name || ""); return o; });
        return [200, { ok: true, rows: rows, stats: checkinStats(s, D), reg: regStats(s, D) }];
      }
      return [404, { ok: false, error: "示範站沒有這個功能" }];
    }
    // POST
    if (path === "/reg/claim") {
      var nm = String(body.name || "").trim(), ph = String(body.phone || "").trim();
      if (!nm || !normPhone(ph)) return [200, { ok: false, error: "請填姓名和電話" }];
      var code = regClaim(s, D, nm, ph); save(s); return [200, { ok: true, code: code }];
    }
    if (path === "/checkin") {
      var r = checkinSubmit(s, D, body.div, body.code, body.name, body.nick, body.reg);
      if (r[0]) save(s); return [200, { ok: r[0], error: r[0] ? null : r[1], msg: r[1] }];
    }
    if (path === "/checkin/mine") {
      var c = s.checkin[String(body.code || "").trim().toUpperCase()];
      return [200, c ? { ok: true, state: c.state || "pending", nick: c.nick || "", div: c.div || "" } : { ok: true, state: "none" }];
    }
    staff = !!String(body.pin || "").trim();
    if (!staff) return [path.indexOf("/checkin/") === 0 ? 200 : 401, path.indexOf("/checkin/") === 0 ? { ok: false, error: "PIN 不正確" } : needPin];
    if (path === "/reg/confirm") {
      var rids = body.rids || (body.rid ? [body.rid] : []), on = body.on === undefined ? true : !!body.on, changed = 0;
      (Array.isArray(rids) ? rids : [rids]).forEach(function (rid) {
        var x = D.REG[String(rid)]; if (!x || x.done === on) return;
        if (on) s.done[x.rid] = { ts: now(), by: STAFF }; else delete s.done[x.rid]; changed++; });
      // 確認的當下把「這組代碼＝這一位」釘死（brain.py reg_pin_code）
      var cl = s.claims[String(body.code || "").trim().toUpperCase()];
      if (cl && on && rids.length === 1 && (cl.rids || []).indexOf(rids[0]) >= 0) { cl.rid = rids[0]; cl.ts = now(); }
      save(s); D = build(s);
      return [200, { ok: true, changed: changed, stats: regStats(s, D), card: body.code ? regCard(s, D, body.code) : null }];
    }
    if (path === "/reg/add") {
      var w = walkin(s, D, body); if (w.ok) save(s); D = build(s); w.stats = regStats(s, D);
      return [w.ok || w.dupe ? 200 : 400, w];
    }
    if (path === "/checkin/bind") {
      var ck = s.checkin[String(body.code || "").trim().toUpperCase()];
      if (!ck) return [200, { ok: false, error: "查無這筆檢錄" }];
      var rr2 = D.REG[String(body.rid || "")];
      if (!rr2) return [200, { ok: false, error: "名單上找不到這一位（名單可能重讀過，請再搜尋一次）" }];
      if (rr2.div && ck.div && rr2.div.toUpperCase() !== ck.div.toUpperCase())
        return [200, { ok: false, error: "這一位在名單上登記的是 " + rr2.div + " 區，和這張號碼牌（" + ck.div + " 區）不同" }];
      ck.name = rr2.name; ck.rid = rr2.rid; ck.match = "ok"; ck.cand = [rr2.name]; save(s);
      return [200, { ok: true, error: null, msg: "已綁定 " + rr2.name, row: ck }];
    }
    if (path === "/checkin/decide") {
      var c2 = s.checkin[String(body.code || "").toUpperCase()];
      if (!c2) return [200, { ok: false, error: "查無這筆檢錄", stats: checkinStats(s, D) }];
      if (body.nick_only) { c2.nick = String(body.nick || "").trim().slice(0, NICK_MAX); save(s); return [200, { ok: true, stats: checkinStats(s, D) }]; }
      if (body.nick !== undefined && body.nick !== null) c2.nick = String(body.nick).trim().slice(0, NICK_MAX);
      c2.state = body.ok ? "approved" : "rejected"; c2.by = STAFF; c2.ts = now(); save(s);
      return [200, { ok: true, error: null, stats: checkinStats(s, D) }];
    }
    return [404, { ok: false, error: "示範站沒有這個功能" }];
  }

  /* ---------- 接住 fetch ---------- */
  var API = /^\/(find|status|whoami|account\/(login|register)|reg\/(claim|stats|search|card|confirm|add)|checkin(\/(mine|list|bind|decide))?)$/;
  var realFetch = window.fetch ? window.fetch.bind(window) : null;
  window.fetch = function (input, init) {
    var url;
    try { url = new URL(typeof input === "string" ? input : input.url, location.href); } catch (e) { url = null; }
    if (!url || url.origin !== location.origin || !API.test(url.pathname)) return realFetch(input, init);
    init = init || {};
    var method = String(init.method || "GET").toUpperCase(), body = {};
    try { if (init.body) body = JSON.parse(init.body); } catch (e) {}
    var pin = "";
    try { var h = new Headers(init.headers || {}); pin = decodeURIComponent(h.get("X-Pin") || ""); } catch (e) {}
    var res = route(method, url.pathname, url.searchParams, body, pin);
    return new Promise(function (ok) {
      setTimeout(function () {   // 跟真的網路一樣晚一點才回，送出鈕的「處理中」看得到
        ok(new Response(JSON.stringify(res[1]), { status: res[0], headers: { "Content-Type": "application/json" } }));
      }, 120);
    });
  };

  /* ---------- 角落的提示：這是示範、資料在哪、怎麼重來 ---------- */
  document.addEventListener("DOMContentLoaded", function () {
    var b = document.createElement("div");
    b.id = "zanmen-demo-ribbon";
    // 頁面自己的彈出視窗（梯次查詢的「當天注意事項」）打開時先藏起來，
    // 不然會蓋住視窗底部的「我知道了」。登入畫面那種整頁的遮罩不藏 ——
    // 「PIN 輸入任何數字都可以」正是在那裡最需要看到。
    var st = document.createElement("style");
    st.textContent = "body:has(.ntcmask.on) #zanmen-demo-ribbon{display:none}";
    document.head.appendChild(st);
    b.setAttribute("style", "position:fixed;left:8px;bottom:calc(8px + env(safe-area-inset-bottom,0px));z-index:99999;" +
      "background:#2ee6a8;color:#04120e;font:600 12px/1.4 'Noto Sans TC','Microsoft JhengHei',sans-serif;" +
      "padding:6px 10px;border-radius:8px;box-shadow:0 4px 14px rgba(0,0,0,.35);max-width:calc(100% - 16px)");
    var staffPage = /reg-desk|checkin-review/.test(location.pathname);
    b.innerHTML = '示範站：名單是假的，資料只存在你的瀏覽器' +
      (staffPage ? '，工作人員 PIN 輸入任何數字都可以' : '') + '。 ' +
      '<a href="./" style="color:inherit">回流程說明</a>';
    document.body.appendChild(b);
    // 頁面底部留出提示條的高度：捲到最下面時，最後一顆按鈕不能被它蓋住
    var pad = function () {
      var cur = parseFloat(getComputedStyle(document.body).paddingBottom) || 0;
      var need = b.offsetHeight + 16;
      if (cur < need) document.body.style.paddingBottom = need + "px";
    };
    pad(); window.addEventListener("resize", pad);
  });
})();
