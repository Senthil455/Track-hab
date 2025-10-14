# 

Habitica × HubSpot ./OPS API  1 .

## 

- `SGC_TOKENS`  
   JSON .Render .
  ```json
  {"default":"sample-admin-token","*":"fallback-token"}
  ```
- `PUBLIC_BASE_URL`  
   URL.Render  URL .
-   
  `PORT` (: 10000),`DRY_RUN=1`  Habitica .HubSpot / Zoom  `HUBSPOT_USER_MAP_JSON` .

## 

1. : `npm install`
2. TypeScript : `npm run build`
3. : `npm start`  
   `PUBLIC_BASE_URL` , API .

 `npm run dev` .

## 

1. Habitica  `/admin/console/` .
2.  `Tenant`, `BaseURL`, `Token` ,"Ping".
3. 
   - **** / **HubSpot** / **approvalsales** / **CSV** / ****  
     CSV .
   - ****  
      XP ." -1"" +5". `GET /ops/logs`  50 .`userId` .
   - ****  
      (`name / priceXp / stock / badge`) ,"" `PUT /ops/catalog` . ID"" `POST /ops/purchase` , XP ..
   - ****  
     `GET /tenant/:id/audit` ..

 `Authorization: Bearer <token>` ."" LocalStorage ,.

## 

- `SGC_TOKENS` .`*`  () .
-  HTTPS ,.
- , API  `401 Unauthorized` ,.

## 

- **Ping **  
  `PUBLIC_BASE_URL` , CORS .
- ** 401 **  
  `Tenant`  `SGC_TOKENS` .Render  Secrets .
- ****  
   (`stock-shortage`)  (`item-disabled`) ..
- ****  
  `data/` ,JSONL .`GET /ops/logs` .

## curl 

`<BASE>`  `PUBLIC_BASE_URL`,`<TOKEN>`  `SGC_TOKENS` . `default` .

```bash
# health
curl -s <BASE>/healthz

#  / 
curl -s <BASE>/tenant/default/rules
curl -s -X PUT <BASE>/tenant/default/rules \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{}'

#  → 
curl -s -X PUT <BASE>/ops/catalog \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"tenant":"default","items":[{"id":"demo","name":"","priceXp":5}]}'
curl -s "<BASE>/ops/catalog?tenant=default"

# 
curl -s -X POST <BASE>/ops/adjust \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"tenant":"default","userId":"u001","delta":-1,"note":""}'
curl -s "<BASE>/ops/logs?tenant=default&userId=u001&limit=10"
```

## 

`tools/bookmarklets/hide-habitica-paid-ui.js` ,Habitica  UI .DOM ,.

---

 `npm run build` → .React , `dist/public-admin/`  HTML/JS .
