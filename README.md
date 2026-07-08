# 台灣產業供應鏈網站

給散戶投資人使用的台灣產業供應鏈網站。首頁以卡片呈現產業分類,點進去是該產業的上中下游供應鏈圖,點進廠商可看公司介紹、近期財報與股價走勢。

MVP 先涵蓋**半導體**產業,資料涵蓋 TWSE 上市與 TPEx 上櫃公司。

## 資料來源與限制

- 公司基本資料、財報、月營收:[TWSE OpenAPI](https://openapi.twse.com.tw/) / [TPEx OpenAPI](https://www.tpex.org.tw/openapi/)。這些端點只回傳**最新一期快照**,3 年趨勢靠 `refresh-data.yml` 排程逐季/逐月累積,新公司上線初期只會看到近期資料,之後隨時間自動補齊。
- TWSE 個股股價歷史:舊版端點(`www.twse.com.tw/rwd/...`),可一次取得 3 年月線,已在 `scripts/fetch-data.ts` 做過一次性回填。
- TPEx 個股股價歷史:目前沒有對應的公開端點(已實測 TPEx OpenAPI 全部 225 個端點,均為全市場單日快照),同樣靠排程累積。
- 所有數字皆附 `sourceEndpoint` / `fetchedAt` 欄位,可回溯查證來源。

## 開發

```sh
npm install
npm run dev              # 本機開發伺服器
npm run fetch-data       # 抓取最新快照(預設只抓 1 個月股價)
npm run fetch-data -- --price-months=36   # 抓 3 年 TWSE 股價歷史(僅需執行一次)
npm run build            # 建置靜態網站
```

## 部署

推上 `main` 分支會觸發 `.github/workflows/deploy.yml` 自動建置並部署到 GitHub Pages。`.github/workflows/refresh-data.yml` 每個交易日排程重新抓取最新快照並自動 commit。
