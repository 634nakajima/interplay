# Interplay

**AI-powered Sound & Visual development tool**

自然言語でPure Data（plugdata）のパッチとp5.jsのビジュアルスケッチを対話的に生成・修正できるデスクトップアプリです。
Claude Code CLIをバックエンドとして使用し、音響と映像の両方をAIとの対話で制作できます。

## ワークフロー

```
自然言語で指示 → AIが判断して生成
                  ├─ 音響 → .pd → plugdataで自動表示
                  ├─ 映像 → .html → ブラウザでプレビュー
                  └─ 両方 → .pd + .html（OSC連携付き）
  ↑                                    ↓
  ← 「ここを変えて」 ←← 手動微調整して保存
```

## 機能

### 音響（Pure Data）
- **対話的パッチ生成**: 自然言語でPdパッチを生成・修正
- **手動編集の検知**: plugdataで手動編集→保存すると、AIが編集後の状態を理解して追加修正可能
- **既存パッチの読み込み**: 既存の.pdファイルを開いてAIに修正を依頼
- **ELSE/plugdata対応**: `else/out~`、`else/fbdelay~`、`cyclone/scale`など、ELSEライブラリのオブジェクトを活用

### 映像（p5.js）
- **ジェネラティブビジュアル生成**: パーティクル、ノイズフィールド、3D、インタラクティブアートなど
- **外部ライブラリ対応**: p5.sound、osc-js 等を活用可能
- **ブラウザプレビュー**: 生成されたスケッチは自動でブラウザに表示

### 音響 + 映像 連携
- **同時生成**: 「音に反応する映像を作って」→ Pdパッチとp5.jsスケッチを同時生成
- **双方向OSCブリッジ**: Pd → p5.js、p5.js → Pd のリアルタイム通信（アプリ内蔵）
- **センサーデータ共有**: micro:bitのセンサー値をPdとp5.jsの両方に同時配信
- **デバッグ支援**: 送信側と受信側のコードを照合し、アドレスや値の不整合を検出

### デバイス連携
- **Serial/OSC変換**: micro:bitなどのデバイスからのシリアル入力をOSCメッセージに変換（内蔵）
- **micro:bit対応**: センサ値（明るさ、加速度、音、アナログ入力）に対応

## セットアップ

### 必要なもの

- **plugdata**（または Pure Data + ELSE ライブラリ）
- Claudeアカウント（無料プランでも利用可能）

### インストール

1. `Interplay.app.zip` をダウンロードして展開
2. `Interplay.app` をダブルクリックで起動
3. 初回起動時に「Claudeにログイン」→ ブラウザでClaude認証

## 使い方

### チャットタブ

パッチ・スケッチの生成・修正は「Chat」タブで行います。

```
あなた: 440Hzのサイン波を出力するパッチを作って
AI: osc~ 440 → else/out~ のシンプルなパッチを生成...
    ✅ パッチを保存しました → plugdataで自動表示

あなた: ノイズが動くビジュアルを作って
AI: Perlinノイズベースのジェネラティブアートを生成...
    ✅ スケッチを保存しました → ブラウザで自動表示

あなた: 音に反応する映像を作って
AI: Pdで音の振幅を抽出してOSC送信 + p5.jsで受信して映像に反映...
    ✅ パッチとスケッチを同時に保存しました
```

### Serial/OSCタブ

micro:bitなどのデバイスとの接続は「Serial/OSC」タブで行います。

1. デバイスをUSB接続
2. ポートを選択して「接続」
3. OSC送信先を設定（デフォルト: 127.0.0.1:8000）
4. デバイスからのシリアルデータが自動的にOSCメッセージに変換されます
5. センサーデータはPd（UDP 8000）とp5.js（WebSocket 7401）の両方に配信されます

### OSCブリッジ

アプリ起動時に自動で双方向OSCブリッジが稼働します。

```
Pd (UDP 7400) → [Interplay Bridge] → WebSocket 7401 → p5.js
p5.js (WebSocket 7401) → [Interplay Bridge] → UDP 8000 → Pd
micro:bit → Serial → [Interplay] → UDP 8000 (Pd) + WebSocket 7401 (p5.js)
```

### micro:bit連携

micro:bitのセンサ値でPdとp5.jsの両方を制御するパッチも自然言語で生成できます。

```
あなた: マイクロビットの加速度センサで音のピッチと映像の色を変えたい
AI: Pdで加速度→周波数マッピング + p5.jsで加速度→色相マッピングを生成...
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
│  │ Chat UI    │  │ Serial/   │  │ OSC Bridge  │  │
│  │            │  │ OSC Panel │  │ (双方向)     │  │
│  └─────┬──────┘  └─────┬─────┘  └──┬──────┬───┘  │
│        │               │           │      │      │
│  ┌─────▼──────┐  ┌─────▼─────┐  ┌─▼──┐ ┌─▼───┐  │
│  │Claude Code │  │serialport │  │UDP │ │WS   │  │
│  │  CLI       │  │+ osc-js   │  │7400│ │7401 │  │
│  └──┬────┬────┘  └─────┬─────┘  └─┬──┘ └──┬──┘  │
│     │    │             │          │       │     │
│  .pd   .html       UDP 8000      │       │     │
│     │    │             │          │       │     │
└─────┼────┼─────────────┼──────────┼───────┼─────┘
      │    │             │          │       │
      ▼    ▼             ▼          ▼       ▼
  ┌──────┐ ┌───────┐ ┌──────┐  ┌──────┐ ┌──────┐
  │plug- │ │Browser│ │ Pd   │  │ Pd   │ │p5.js │
  │data  │ │p5.js  │ │ OSC  │  │ OSC  │ │ OSC  │
  │表示  │ │表示   │ │ 受信 │  │ 受信 │ │ 受信 │
  └──────┘ └───────┘ └──────┘  └──────┘ └──────┘
```

## ファイル構成

```
interplay/
├── interplay-app/          # Electron アプリ（メイン）
│   ├── src/
│   │   ├── main/           # メインプロセス
│   │   │   ├── index.ts        # IPCハンドラー
│   │   │   ├── ai-service.ts   # Claude Code CLI連携
│   │   │   ├── pd-file.ts      # .pdファイル読み書き
│   │   │   ├── p5-file.ts      # p5.jsスケッチ読み書き
│   │   │   ├── serial-osc.ts   # シリアル→OSC変換
│   │   │   ├── osc-bridge.ts   # 双方向OSCブリッジ
│   │   │   └── system-prompt.ts # AIシステムプロンプト
│   │   ├── preload/        # IPC ブリッジ
│   │   └── renderer/       # React UI
│   │       ├── App.tsx
│   │       ├── ChatView.tsx
│   │       ├── SerialOSCPanel.tsx
│   │       └── ...
│   └── package.json
├── docs/                   # GitHub Pages サイト
│   └── index.html
└── README.md
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
- plugdata または Pure Data + ELSE ライブラリ
- Claudeアカウント（無料プラン可）
