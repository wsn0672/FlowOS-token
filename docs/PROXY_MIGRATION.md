# YouTube障害の修正・Scramjet移行調査

調査日: 2026-11-11。今回の移行作業は調査のみで、稼働エンジンはUltravioletのまま。

## YouTubeだけ失敗した原因と修正

`https://www.youtube.com/?gl=JP&hl=ja` をローカルのFlowOSで開き、
Ultravioletのエラー画面と `プロキシ通信に失敗しました（502）` を再現した。
サーバーの同一URLのログでは、3回とも `HPE_HEADER_OVERFLOW` を記録していた。

この実行環境のNode.jsの既定の応答ヘッダー上限16KiBに対して、
YouTubeの応答ヘッダーが大きいため、HTMLを書き換える前の転送段階で失敗していた。
修正後の200応答のログでは、伏せ字処理後のヘッダーJSONでも18,593バイトあり、
既定上限を超える規模であることを確認した（JSONサイズはHTTPの実際のヘッダーサイズとは異なる）。

`src/proxy.js` で外部HTTP/HTTPSの応答ヘッダー上限を64KiBに明示した。
WebSocketの外部ハンドシェイクにも同じ上限を設定した。上限は無制限にしていない。
Node.jsは送信側サーバーの `createServer({ maxHeaderSize })` と
外部へ送る `request({ maxHeaderSize })` が別設定なので、受信用サーバーの設定だけでは直らない。
参照: [Node.js HTTP request](https://nodejs.org/api/http.html#httprequesturl-options-callback)。

確認済み:

- 修正前は問題のURLでエラーになり、修正後は200応答と日本語のYouTubeホーム画面を確認。
- 20,000バイトのテストヘッダーは正常転送。
- 70,000バイトのテストヘッダーは502として拒否し、その後もサーバーが正常に応答。
- 通常のHTTP/WebSocket、内部IP遮断、接続拒否時の継続動作の回帰チェックに成功。

動画再生、ログイン、長時間視聴、Cloudflare Tunnelを通した本番環境での確認は未実施。
今回のエラーの原因はエンジンの互換性ではなく、サーバーのヘッダー上限だった。

## Scramjetへ移行できるか

**移行は技術的に可能。ただし依存パッケージを入れ替えるだけでは完了しない。**

Ultravioletの公式READMEは、実質的に保守されておらずScramjetに置き換えられたと案内している。
Scramjetも公式にUltravioletの後継を目指すプロジェクトと説明されている。
YouTubeはScramjetの対応サイトとして掲載されているが、FlowOSでの実際の動作を保証するものではない。
参照: [Ultraviolet README](https://github.com/titaniumnetwork-dev/Ultraviolet#readme)、
[Scramjet README](https://github.com/MercuryWorkshop/scramjet#readme)。

調査時に `npm view @mercuryworkshop/scramjet dist-tags --json` で確認した公開タグ:

| タグ | バージョン |
| --- | --- |
| latest / legacy | 1.1.0 |
| alpha | 2.0.67-alpha.2 |

1系と2系では構成とAPIが異なるため、導入時は世代とバージョンを明示して固定する。
1系の公式コード自身も、2系へのアップグレードを案内している。
参照: [1.1.0の案内](https://github.com/MercuryWorkshop/scramjet/blob/v1.1.0/src/controller/index.ts)、
[2系coreのpackage.json](https://github.com/MercuryWorkshop/scramjet/blob/main/packages/core/package.json)。

### FlowOSへの具体的な影響

| 対象 | 必要な変更・影響 |
| --- | --- |
| エンジン初期化 | UVの設定とService Worker登録から、ScramjetのController、Worker、WASM等の配信・初期化へ変更 |
| 転送API | 2系は `proxy-transports`。現在のBareMux用ServerTransportをアダプター化し、ヘッダー形式とWebSocketの引数・戻り値を合わせる |
| ログ・通信量・速度制限 | 現在の `/proxy/http`、`/proxy/ws` を使い続ければ、サーバーのIP判定・3GB・1Mbps・保存形式を維持できる見込み |
| 標準の転送方式をそのまま採用 | 転送経路を変えると、今のサーバー側のHTTPヘッダー取得・容量管理を通らなくなる可能性がある。現行APIへ接続する方式を優先 |
| ブラウザーのタブ | UVのURL文字列連結とiframe直接操作を、選定版のFrame APIへ合わせる。履歴・戻る・進む・タイトル取得も調整 |
| SDK・カスタムアプリ | `public/sdk/index.js` の `/uv/service/` 固定処理、`public/wm.js` のエンコード・デコード処理を更新 |
| Cookie・ログイン | Cookie用IndexedDBの実装が異なるため、セッションを自動で引き継げるとは限らない。再ログインや移行処理を想定 |
| スリープ復帰 | BareMuxの `getTransport` / `setTransport` を監視する現行処理を、選定版のController・Workerの復帰処理へ合わせる |
| リソース・互換性 | WASM等の配信・キャッシュが追加される。動画、Range/206、ダウンロード、WebSocket、外部アプリを再検証。速度やメモリ改善は実測前には断定できない |
| 配布条件 | 調査した2系core/controllerのライセンス表記はAGPL-3.0-only。採用バージョンのライセンス文書を確認する |

上表のFlowOS側の作業量と維持可能性は、現在のソースと公式APIを照合した設計上の見立て。
移行版を実装・実測した結果ではない。

根拠となる公式API:

- [Scramjet 2系Controller](https://github.com/MercuryWorkshop/scramjet/blob/main/packages/controller/src/index.ts): `Controller` が `ProxyTransport` を受け取り、独自Cookie保存とFrameを管理する。
- [proxy-transports](https://github.com/MercuryWorkshop/proxy-transports#readme): ヘッダー形式と `connect` の引数が現在のBareMuxと異なる。
- [coreの配布構成とライセンス](https://github.com/MercuryWorkshop/scramjet/blob/main/packages/core/package.json)。

### 推奨する進め方

1. 今回のYouTube障害は現行UVのまま修正して運用する。
2. Scramjetを別のURLプレフィックスで試験導入し、UVに戻せるようにする。
3. 独自transportを現在のサーバーAPIにつなぎ、ログ・通信量・制限が抜けないことを確認する。
4. YouTubeのホーム・検索・再生・シーク、ログイン、Cookie、ダウンロード、複数タブ、スリープ復帰を検証する。
5. 問題がなければ既定をScramjetへ切り替える。過去ログ・使用量データは維持する。

## 設定のDynamicは何をするか

**現状はプロキシを切り替えない。保存された選択値だけが変わる。**

- `public/scripts/utilities.js` が `search.proxy` にUltraviolet / Dynamicの選択欄を作る。
- 設定画面は、その値をlocalStorageの `search` に保存する。
- しかし `public/index.js` は選択値を読まず、常に `self.currentProxy = __uv$config` を設定する。
- Service Workerも常に `/uv/sw.js` を登録する。
- 現在の依存関係・配信設定にDynamic本体の組み込みはない。

従ってDynamicを選んで保存・再読み込みしても、ブラウザーは引き続きUltravioletを使用する。
今回は質問への調査としてこの状態を記録し、選択肢の削除や別エンジン導入はしていない。

## Xログイン画面の調査と採用判断

ローカルのFlowOS（UV 3.2.7）で `x.com/i/flow/login` と、その直接アクセス時の遷移先
`x.com/i/jf/onboarding/web?mode=login` を確認した。直接アクセスではユーザー名欄まで
表示されたが、プロキシ経由では入力欄が出る前から黒画面になった。
HTMLと主なJavaScriptの外部応答はHTTP 200で、YouTubeのヘッダー上限問題とは異なる。

実際に取得されたXの公開モジュールを、実行せずに解析・変換した結果:

| 公開モジュール | UV 3.2.7 | 公開版UV 3.2.10 |
| --- | --- | --- |
| `CHKa2XHd.js` | 構文エラー、未変換で返す | 解析・インポート先の変換に成功 |
| `CxDi15yU.js` | 構文エラー、未変換で返す | 解析・インポート先の変換に成功 |
| `D_gWZy9K.js` | `Unexpected token: 'PrivateField'`、未変換で返す | 解析・インポート先の変換に成功 |

3.2.7の内蔵パーサーが失敗すると、リライターは元のソースをそのまま返す。
この結果、相対インポートがプロキシ用URLに変換されず、ブラウザーがプロキシの
URLを基準に解決するためモジュールの読み込みが壊れる。今回再現した入力前の黒画面を
説明できる互換性の問題。ユーザー名入力後の同じ段階は再現できていないため、
その症状に他の原因がないかは未確定。実アカウントの認証情報は使用していない。

3.2.10は一時ディレクトリに取得して比較しただけで、FlowOSの依存関係は変更していない。
公式リポジトリでも [3.2.10のパーサー依存](https://github.com/titaniumnetwork-dev/Ultraviolet/blob/main/package.json)
を確認できる。構文変換の改善は確認済みだが、ログイン完了の保証にはならない。
[X公式の対応ブラウザー](https://help.x.com/en/using-x/x-supported-browsers)も参照。

| 選択肢 | メリット | FlowOSへの影響・未確認点 | 判定 |
| --- | --- | --- | --- |
| Ultraviolet 3.2.10 | 今回失敗した3本を変換でき、既存のUV構成に近い | BareMuxも含めて依存を照合し、既存ログ・容量制限とXの画面遷移を試験。上流は保守縮小 | **短期の第一候補** |
| Scramjet 2系 | 公式の後継。新しい書き換えエンジンとFrame APIを使える | alpha段階。転送アダプター、Cookie、SDK、復帰処理の調整が必要。Xログイン成功や速度改善は未検証 | **中長期の第一候補**。別経路で試験導入 |
| Rammerhead | Hammerheadベースの別実装。CookieとlocalStorageをセッション単位で管理 | サーバー側の転送・セッション保管が異なり、今のIP別ログ・容量制限・Cookie管理との統合が増える | 比較用の候補。今回の第一候補にはしない |
| Kasm等のリモートブラウザー | サーバーの実ブラウザーで描画するので、サイトのJSを書き換えない | 別サービスとセッション管理が必要。リソース、画面配信、監査・容量制限を別途設計 | ログイン互換性が最優先の場合の別構成 |

参照: [Scramjet公開リリース](https://github.com/MercuryWorkshop/scramjet/releases)、
[Rammerhead公式](https://github.com/binary-person/rammerhead#readme)、
[Kasmのブラウザー分離](https://docs.kasm.com/docs/tutorials/remote-browser-isolation)。

結論: 本番をすぐ置き換えるより、まずUV 3.2.10を隔離した環境で試す。
Xの入力欄から次の画面への遷移を確認し、YouTube、HTTP/WS、ログ、3GB・1Mbps制限に
回帰がなければ暫定更新する。並行してScramjetを評価し、同じ項目を満たしたら
既定エンジンの変更を判断する。どの候補でもXの認証が動くとは事前に断定しない。
