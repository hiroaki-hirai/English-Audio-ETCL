# English Audio ETCL

ETCL専用の独立アプリです。12 Lessons・68フレーズを、Lessonごとに1本の連結MP3で学習できます。日本語Cue→5秒想起→英語2回の固定順で、Lesson末尾に停止します。教材解説・Weak・保存済み進捗は維持し、従来のTraining / Recallも切り戻し用に残しています。

## ローカル実行

Node.js 24を使用します。

```text
npm ci
npm test
npm run typecheck
npm run build
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

52件の単体・実bundle接続テスト、型検査、build、68教材・104音声/metadata参照のHash照合がPASS。全12 Lessonsと全68件の両モードでCue→英語2回→次Round、Weak時3回、Stop/Pause/Resume、保存再開とMedia Sessionガードを確認しています。DOM/mediaは合成環境で、想起時間はテスト内だけ短縮しています。PC実ブラウザの実音声再生・iPhone Safari実機での修正版動作は未確認です。

推奨の「Lesson Recall（連結音声）」は開始タップで1本のMP3を再生し、途中のplay()・src切替・JSタイマーを使いません。再生位置から現在のフレーズとCue/想起/英語1・2回目を表示し、教材行を強調します。音声コントロールとMedia Sessionで一時停止・再開でき、StopやLesson切替で終了します。末尾では停止し、再度先頭から再生できます。既存の保存位置・Weak・キー・署名は読み書きしません。Weak3回・Shuffle・次Roundの新規対応は今回の範囲外です。

旧方式は「従来のTraining / Recall（切り戻し用）」から使えます。保存済みsessionはそのまま残ります。SafariのNotAllowedErrorは旧方式で引き続き発生し得るため、連結方式を優先してください。

生成済み連結音声は web/public/lessons/<lessonId>/recall-concatenated-v1.mp3、区間情報は web/src/concatenated-recall-manifest.json、元資産と生成検証の記録は assets/concatenated-recall-provenance.json です。FFmpegのPCM切出し・5秒無音・結合後MP3圧縮は、iPhone実機PASSしたLesson 1試作と同じ方法です。Lesson 1は試作とHash一致。各MP3の圧縮後の波形対応・全区間長と無音を検証しています。

通常のビルドではFFmpegを使わず生成済み音声をsize/SHA-256照合します。scripts/build-concatenated-recall.py は既存成果物があれば検証して終了し、音声を上書きしません。新規音声は既存ソースからのローカル変換で、有料TTSは使用しません。

Lesson 1の単独連結試作はユーザー実機PASS済みです。今回の全12 Lessonsのアプリ統合・背景・ロック画面再生はiPhone実機未確認です。52件のテストは合成DOM/mediaによる確認であり実機保証ではありません。

元音声の変更・TTS再生成・有料API呼出しは行っていません。公開用の由来manifestから不要なローカルパスを除去し、元manifestのSHA-256を記録しています。
