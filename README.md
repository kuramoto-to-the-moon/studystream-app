# StudyStream

勉強配信者向けのローカルファーストな配信コントロールと、OBS Browser Source用オーバーレイです。

## 現在動くもの

- 学習、休憩、待機のフェーズ管理
- 学習フェーズを維持したまま、実勉強時間だけを一時停止・再開
- ポモドーロの自動フェーズ切り替え
- 今回、今日、累計の学習時間
- 状態別メッセージ
- 横長／縦長のOBS表示
- 表示項目の選択、サイズ変更、ドラッグ並べ替え
- 背景色、文字色、背景透過度
- 日本語／英語の視聴者表示
- 継続項目の名称と開始日
- ローカルサーバーによるコントロール画面とOBS画面の同期
- JSONへのアトミックなローカル保存

## 起動

```bash
npm install
npm run dev
```

開発画面は `http://127.0.0.1:5173/`、OBS表示は開発中も `http://127.0.0.1:5173/overlay` です。

本番ビルドを確認する場合：

```bash
npm run build
npm start
```

- コントロール：`http://127.0.0.1:47831/`
- OBS Browser Source：`http://127.0.0.1:47831/overlay`
- 推奨サイズ（横長）：`600 × 180` 以上

## データ保存

開発時は `data/state.json` に保存します。書き込み途中の破損を避けるため、一時ファイルへ書いてから置換します。将来のデスクトップ版では同じ形式をmacOS/Windowsのアプリデータフォルダへ保存します。

タイマー表示は各画面が開始・終了時刻から計算します。サーバーへの保存は操作時と15秒ごとの復旧用チェックポイントだけで、毎秒書き込みません。

## デスクトップアプリ

Tauri版はNodeや開発サーバーを必要とせず、アプリ自身が画面・保存API・OBS用URLを提供します。

```bash
npm run desktop:dev
npm run desktop:build
```

macOSでは `src-tauri/target/release/bundle/macos/StudyStream.app` が生成されます。Windowsでは同じソースからインストーラーを生成できます。

ローカルmacOSビルドには自動でアドホック署名を付けます。手元での起動確認用であり、一般配布にはApple Developer IDによる署名と公証が別途必要です。

データはOS標準のアプリデータフォルダへ保存します。

- macOS：`~/Library/Application Support/app.studystream.desktop/state.json`
- Windows：`%APPDATA%\\app.studystream.desktop\\state.json`

OBSにはアプリ起動中に `http://127.0.0.1:47831/overlay` を登録します。ローカルホストだけで待ち受けるため、LANやインターネットへ公開されません。
