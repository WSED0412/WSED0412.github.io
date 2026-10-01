# WSED0412.github.io

個人簡歷頁（`/`）與賽事系統的固定重導頁（`/rift/`）。

- `index.html`：簡歷，中英切換
- `rift/index.html`：QR 指向這裡，會把人帶到當天的賽務主機
- `rift/current.json`：當天的主機網址，由 `python -m server run --tunnel --url-file ...` 寫出來
- `riftbound_DEMO/`：符文戰場賽事系統的線上示範（由 riftbound_system 的 `tools/sync_demo.py` 同步）
- `zanmen_DEMO/`：贊鬥盃賽務系統的線上示範（由 zanmen-tournament 的 `打包-示範站.py` 產生；假名單、靜態資料）
- `demo/`、`404.html`：舊網址 `/demo/…` 自動轉到 `/riftbound_DEMO/…`，已經分享出去的連結不會壞

這個 repo 是公開的；兩套賽事系統的原始碼都在各自的私人 repo，這裡只放示範用的頁面與假資料。
