# Interplay

**AI-powered Sound & Visual development tool**

自然言語でplugdata（Pure Data）のパッチとp5.jsのビジュアルスケッチを対話的に生成・修正できるデスクトップアプリです。
AIバックエンドはClaude（Proプラン）とOpenRouter（無料）から選択できます。

## ワークフロー

```
自然言語で指示 → AIが判断して生成
                  ├─ 音響 → .pd → plugdataで自動表示
                  ├─ 映像 → .html → アプリ内プレビュー
                  └─ 両方 → .pd + .html（OSC連携付き）
  ↑                                    ↓
  ← 「ここを変えて」 ←← 手動微調整して保存
```

## 機能

### 音響（plugdata）
- **対話的パッチ生成**: 自然言語でパッチを生成・修正
- **手動編集の検知**: plugdataで手動編集→保存すると、AIが編集後の状態を理解して追加修正可能
- **既存パッチの読み込み**: 既存の.pdファイルを開いてAIに修正を依頼
- **パッチ自動更新**: 更新時にplugdataの古いパッチを自動で閉じて新パッチを開く
- **ELSE/plugdata対応**: `else/out~`、`else/fbdelay~`、`cyclone/scale`など、ELSEライブラリのオブジェクトを活用
- ※ Pure Data（バニラ + ELSEライブラリ）でも動作しますが、plugdataの使用を推奨します

### 映像（p5.js）
- **ジェネラティブビジュアル生成**: パーティクル、ノイズフィールド、3D、インタラクティブアートなど
- **アプリ内エディタ**: コード表示・編集・保存が可能
- **アプリ内プレビュー**: 生成されたスケッチをアプリ内でリアルタイムプレビュー
- **ブラウザ表示**: ブラウザで開くボタンで全画面プレビューも可能
- **外部ライブラリ対応**: p5.sound等を活用可能

### 音響 + 映像 連携
- **同時生成**: 「音に反応する映像を作って」→ plugdataパッチとp5.jsスケッチを同時生成
- **双方向OSCブリッジ**: plugdata → p5.js、p5.js → plugdata のリアルタイム通信（アプリ内蔵）
- **センサーデータ共有**: micro:bitのセンサー値をplugdataとp5.jsの両方に同時配信
- **デバッグ支援**: 送信側と受信側のコードを照合し、アドレスや値の不整合を検出

### デバイス連携
- **Serial/OSC変換**: micro:bitなどのデバイスからのシリアル入力をOSCメッセージに変換（内蔵）
- **micro:bit対応**: センサ値（明るさ、加速度、音、アナログ入力）に対応

### AIプロバイダー
起動時に以下から選択：
- **Claude**（Proプラン、月額$20〜）— 高品質なコード生成
- **OpenRouter**（無料）— 無料モデルを利用。品質はモデルに依存

## セットアップ

### 必要なもの

- **plugdata**（推奨。Pure Data + ELSEライブラリでも動作可）
- AIプロバイダーのアカウント:
  - Claude: Proプラン以上（月額$20〜）
  - OpenRouter: 無料アカウント（[openrouter.ai/keys](https://openrouter.ai/keys) でAPIキーを取得）

### インストール

1. `Interplay.app.zip` をダウンロードして展開
2. `Interplay.app` をダブルクリックで起動
3. 初回起動時にAIプロバイダーを選択:
   - **Claude**: 「Claudeにログイン」→ ブラウザでClaude認証
   - **OpenRouter**: APIキーを入力して「接続」

## 使い方

### チャットタブ

パッチ・スケッチの生成・修正は「Chat」タブで行います。

```
あなた: 440Hzのサイン波を出力するパッチを作って
AI: osc~ 440 → else/out~ のシンプルなパッチを生成...
    → plugdataで自動表示

あなた: ノイズが動くビジュアルを作って
AI: Perlinノイズベースのジェネラティブアートを生成...
    → アプリ内プレビューに表示

あなた: 音に反応する映像を作って
AI: plugdataで音の振幅を抽出してOSC送信 + p5.jsで受信して映像に反映...
    → パッチとスケッチを同時に生成
```

### p5.jsエディタ

スケッチ生成後、チャットの右側にコードエディタとプレビューが表示されます。
- コードを直接編集して保存可能
- ▶ ボタンでプレビュー表示/非表示を切り替え
- 🌐 ボタンでブラウザに全画面表示

### Serial/OSCタブ

micro:bitなどのデバイスとの接続は「Serial/OSC」タブで行います。

1. デバイスをUSB接続
2. ポートを選択して「接続」
3. OSC送信先を設定（デフォルト: 127.0.0.1:8000）
4. デバイスからのシリアルデータが自動的にOSCメッセージに変換されます
5. センサーデータはplugdata（UDP 8000）とp5.js（WebSocket 7401）の両方に配信されます

### OSCブリッジ

アプリ起動時に自動で双方向OSCブリッジが稼働します。

```
plugdata (UDP 7400) → [Interplay Bridge] → WebSocket 7401 → p5.js
p5.js (WebSocket 7401) → [Interplay Bridge] → UDP 8000 → plugdata
micro:bit → Serial → [Interplay] → UDP 8000 (plugdata) + WebSocket 7401 (p5.js)
```

### micro:bit連携

micro:bitのセンサ値でplugdataとp5.jsの両方を制御するパッチも自然言語で生成できます。

```
あなた: マイクロビットの加速度センサで音のピッチと映像の色を変えたい
AI: plugdataで加速度→周波数マッピング + p5.jsで加速度→色相マッピングを生成...
```

対応しているOSCアドレス:
- `/brightness` - 明るさセンサ（0-255）
- `/accX`, `/accY`, `/accZ` - 加速度センサ
- `/sound` - 音センサ
- `/p0` - P0端子のアナログ値（0-1023）

MakeCodeプロジェクト: https://makecode.microbit.org/S19392-01978-77199-41699

## アーキテクチャ

```
┌─ Interplay.app ──────────────────────────────────┐
│                                                   │
│  Electron (React + TypeScript)                    │
│  ┌────────────┐  ┌───────────┐  ┌─────────────┐  │
│  │ Chat UI +  │  │ Serial/   │  │ OSC Bridge  │  │
│  │ p5 Editor  │  │ OSC Panel │  │ (双方向)     │  │
│  └─────┬──────┘  └─────┬─────┘  └──┬──────┬───┘  │
│        │               │           │      │      │
│  ┌─────▼──────┐  ┌─────▼─────┐  ┌─▼──┐ ┌─▼───┐  │
│  │Claude CLI  │  │serialport │  │UDP │ │WS   │  │
│  │  or        │  │+ osc-js   │  │7400│ │7401 │  │
│  │OpenRouter  │  └─────┬─────┘  └─┬──┘ └──┬──┘  │
│  └──┬────┬────┘        │          │       │     │
│  .pd   .html       UDP 8000      │       │     │
│     │    │             │          │       │     │
└─────┼────┼─────────────┼──────────┼───────┼─────┘
      │    │             │          │       │
      ▼    ▼             ▼          ▼       ▼
  ┌──────┐ ┌───────┐ ┌──────┐  ┌──────┐ ┌──────┐
  │plug- │ │Preview│ │plug- │  │plug- │ │p5.js │
  │data  │ │/     │ │data  │  │data  │ │ OSC  │
  │表示  │ │Browser│ │ OSC  │  │ OSC  │ │ 受信 │
  └──────┘ └───────┘ └──────┘  └──────┘ └──────┘
```

## 開発

```bash
cd interplay-app
npm install
npm run dev         # 開発モード
npm run build:mac   # macOSビルド（release/ にパッケージ生成）
```

## 必要環境

- macOS（現在の対応OS）
- plugdata（推奨。Pure Data + ELSEライブラリでも動作可）
- AIプロバイダー: Claude Proプラン or OpenRouter（無料）
