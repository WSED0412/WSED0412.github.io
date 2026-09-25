# WSED0412.github.io

個人簡歷頁（`/`）與賽事系統的固定重導頁（`/rift/`）。

- `index.html`：簡歷，中英切換
- `rift/index.html`：QR 指向這裡，會把人帶到當天的賽務主機
- `rift/current.json`：當天的主機網址，由 `python -m server run --tunnel --url-file ...` 寫出來

這個 repo 是公開的，**只放這兩張頁面**；賽務系統的原始碼在另一個私人 repo。
