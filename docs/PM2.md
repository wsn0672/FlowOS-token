# FlowOS: Ubuntu / PM2 常駐設定

利用者用は **3743**、パスワード不要の管理ページは **3744**。
`ecosystem.config.cjs` は両方を1つのNode.jsプロセスで起動する。
サイトのパスワード認証・IPロックはない。

## 1. sda1 と保存ディレクトリ

提示された構成では `/dev/sda1` は `/mnt/timemachine` にマウント済み。
ディスクのフォーマットは不要。以下はサーバー上で実行する。

```sh
mountpoint /mnt/timemachine
findmnt /mnt/timemachine
sudo install -d -o wsn0672 -g "$(id -gn wsn0672)" -m 700 /mnt/timemachine/flowos-logs
```

`findmnt` のソースが想定の `/dev/sda1` になっていることを確認する。
デフォルトではLinux起動時にマウントを検査し、未マウントなら起動を拒否する。
実行中にマウント先のデバイスが変わった場合も書き込みを止める。
ログの書き込みに失敗した通信は失敗として扱い、記録せずに転送を続けない。
`PROXY_LOG_DIR` を指定すると保存先を変更できるが、このマウント検査は外れる。
本番では指定せず、既定値 `/mnt/timemachine/flowos-logs` を使う。

## 2. インストールと起動

Node.js 22以降を使用する。以下の `cd` は実際のチェックアウト先に置き換える。
PM2は `wsn0672` ユーザーで実行する。

```sh
cd /path/to/FlowOS-token
npm ci --omit=dev
npm install -g pm2
cp .env.example .env
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

`pm2 startup` が表示する `sudo ...` コマンドを実行し、その後 `pm2 save` を実行する。
参照: [PM2 起動設定](https://pm2.keymetrics.io/docs/usage/startup/)、
[PM2 ecosystem設定](https://pm2.keymetrics.io/docs/usage/application-declaration/)。

設定の既定値:

| 項目 | 値 |
| --- | --- |
| 利用者向け待受 | `0.0.0.0:3743` |
| 管理ページ待受 | `127.0.0.1:3744` |
| プロセス数 | 1 / fork |
| ログ保存 | `/mnt/timemachine/flowos-logs` |
| アプリ監視 | 自動再起動、watch無効 |

外部の端末から利用する場合は、3743を転送するHTTPSリバースプロキシを使用する。
Service Workerは `localhost` を除きHTTPSが必要。HTTPでサーバーIPの3743に直接接続するだけでは
FlowOSのプロキシ機能は動作しない。
リバースプロキシの接続先は `http://127.0.0.1:3743` とし、`/proxy/ws` のWebSocket Upgrade、
`/proxy/http` のストリーム転送、64KB以上のリクエストヘッダーを許可する。
接続先URLや元サイトのHTTPヘッダーは `x-flowos-request` に格納されるため、
このヘッダーの値やWebSocketのクエリー文字列をリバースプロキシのアクセスログに出力しない。

IPを正確に記録するには、`.env` の `TRUST_PROXY` に実際のリバースプロキシのIP/CIDRのみを設定し、
リバースプロキシ側で `X-Forwarded-For` を正しく設定する。
無指定ならソケットの接続元IPを使用する。利用者が共有するNATの外側では、同じIPは同一利用者として表示される。

## 3. 再起動時にディスクのマウントを待つ

`/etc/fstab` 等でsda1の永続マウントが設定済みであることを確認する。
PM2が作成したsystemdサービス名が `pm2-wsn0672` の場合:

```sh
sudo mkdir -p /etc/systemd/system/pm2-wsn0672.service.d
sudo cp deploy/flowos-mount.conf /etc/systemd/system/pm2-wsn0672.service.d/flowos-mount.conf
sudo systemctl daemon-reload
```

この設定はPM2のサービス起動時に `/mnt/timemachine` のマウントを要求する。
サービス名が異なる場合は、`pm2 startup` の出力に合わせて置き換える。

## 4. 管理ページを見る

サーバー上では `http://127.0.0.1:3744/`。パスワードは不要。
手元のPCから確認する場合:

```sh
ssh -N -L 3744:127.0.0.1:3744 wsn0672@feaber-server
```

その状態で手元のブラウザーから `http://127.0.0.1:3744/` を開く。
日付（UTC）とIPを選び、サイト名やメソッドで絞り込み、行を開くとヘッダーを確認できる。
「以前のログを読み込む」で過去のページを追加する。

LANから直接管理ページを使う必要がある場合は `ecosystem.config.cjs` の `ADMIN_HOST` を
サーバーのLAN IPに変更し、`.env` の `ADMIN_ALLOWED_HOSTS` にそのIP/ホスト名を追加する。
管理ページに接続できる人は全利用者のログを閲覧できる。

## 5. 保存する情報と対象範囲

外部通信は従来のEpoxy/Wisp転送から、サーバーでHTTP/HTTPS/WS/WSSを終端・転送する
専用BareMux transportに変更した。HTTPSの宛先証明書はNode.jsの標準検証を使用する。
ブラウザーからの自己申告ログではなく、サーバーが転送する際のメタデータを記録する。

- 保存: UTC時刻、接続元IP、リクエストID、URL、HTTPメソッド、送信ヘッダー、応答ステータス・ヘッダー、接続エラー。
- 非保存: HTTPのリクエスト本文・レスポンス本文、WebSocketメッセージ。
- Cookie / Set-Cookie / Authorization、名前にtoken・API key・secretを含むヘッダーは伏せ字。
- URLのパス・クエリーとその他のヘッダーは保存するため、その部分に含まれる値は閲覧可能。
- WebSocketはハンドシェイクを記録し、接続後のメッセージは記録しない。
- 旧Wisp転送は受け付けない。内部IP・localhostへの転送も拒否するため、利用者向けプロキシから管理ページにはアクセスできない。
- 対象はこのサーバーのプロキシを経由した通信。端末の直接通信、ブラウザー内キャッシュなど、サーバーに届かない処理は記録できない。

ログは `YYYY-MM-DD/<IPのbase64url>.jsonl` の日付別・IP別ファイル。
管理画面は一度に最大512KiBを読み、カーソルで以前のログを読む。
自動削除は行わない。ディスク残量と必要な保存期間は運用側で管理する。
並列プロセスやPM2 clusterは使用しない。

## 6. 運用コマンド

```sh
pm2 status
pm2 logs flowos --lines 50
pm2 restart ecosystem.config.cjs --update-env
pm2 save
pm2 stop flowos
```

PM2の標準出力・エラーログは通常のPM2保存先に置かれる。
閲覧・通信メタデータのJSONLログはsda1側に保存される。
ローカル開発時だけ別ディレクトリを使う場合:

```sh
PROXY_LOG_DIR=/tmp/flowos-logs npm start
```
