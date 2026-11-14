# English Audio ETCL

ETCL専用の独立アプリです。12 Lessons・68フレーズ、英語音声、日本語Cue、解説、Weak、Lesson Recall、Global Shuffle、Sequential Category Order、進捗保存、停止・再開に対応しています。

## ローカル実行

Node.js 24を使用します。

```text
npm ci
npm test
npm run typecheck
npm run build
npm run package
npm run preview
```

PC: http://localhost:5190/English-Audio-ETCL/
iPhone: PCと同じWi-Fiで http://<PCのLAN-IP>:5190/English-Audio-ETCL/ を開きます。PC側の配信と接続許可が必要です。

## GitHub Pages

公開URL: https://hiroaki-hirai.github.io/English-Audio-ETCL/

新規repository名は English-Audio-ETCL。作成・commit・push・Pages設定・公開はユーザー承認後に実施します。

1. 新規repositoryへ本プロジェクトをcommit/pushします。
2. Settings → Pages → SourceでGitHub Actionsを選択します。
3. Actionsの「Publish ETCL Pages manually」を、確認文字列 PUBLISH English-Audio-ETCL で実行します。
4. 公開URLをiPhone Safariで開きます。必要ならホーム画面に追加します。

push/PRのCIは検証だけを行い、自動公開しません。公開対象はdistまたはrelease/pagesです。既存EAGは公開対象に含めません。

## 保存・オフライン

保存は etcl.app.v1.* のみ。Lesson別session/Roundとlibrary68は独立し、WeakはETCL内で共有します。EAG・隔離プレビューの保存値を移行・初期化しません。

専用SWのscopeは /English-Audio-ETCL/。本アプリの全資産をsize/SHA-256照合してcacheします。既存EAGを含む他cacheの削除やclients.claimは行いません。オンラインで一度読み込み、アプリを閉じて再起動した後にオフライン動作を確認してください。更新も旧タブ終了後の通常のSW移行を使います。サイトデータ削除は更新手順ではありません。

ブラウザ保存領域が無効・容量不足・自動消去された場合、保存やオフライン利用ができないことがあります。Phase 5Cの再生エンジン・Cueプレイヤー・transport・Media Session方針を再利用しています。独立した公開URLでのiPhone背景・ロック画面・長時間再生は公開後に確認してください。

## 検証結果

41件の単体・実bundle接続テスト、型検査、build、68教材・104音声/metadata参照のHash照合がPASS。全12 Lessonsと全68件の両モードでCue→英語2回→次Round、Weak時3回、Stop/Pause/Resume、保存再開とMedia Sessionガードを確認しています。DOM/mediaは合成環境で、想起時間はテスト内だけ短縮しています。PC実ブラウザの実音声再生・iPhone Safari実機での修正版動作は未確認です。

Lesson Recallの修正では、クリック時に同じ英語audio要素を無音で準備し、再生開始・区間終了を確認してから次へ進めます。再生拒否や音声読込エラーは原因と再生段階を画面に表示します。Round切替では保存位置を削除せず次のcheckpointで更新します。保存キーと署名は変更していません。

音声再生成・有料API呼出しは行っていません。公開用の由来manifestから不要なローカルパスを除去し、元manifestのSHA-256を記録しています。
