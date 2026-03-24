# pd-ai-coder

**AI-powered Pure Data patch development tool**

自然言語でPure Data（plugdata）のパッチを対話的に生成・修正できるデスクトップアプリです。
Claude Code CLIをバックエンドとして使用し、パッチ生成→plugdataで自動表示→手動微調整→AIに追加修正指示、というサイクルで開発できます。

## ワークフロー

```
自然言語で指示 → AIがパッチ生成 → plugdataで自動表示
  ↑                                    ↓
  ← 「ここを変えて」 ←← plugdataで手動微調整して保存
```

## 機能

- **対話的パッチ生成**: 自然言語でPdパッチを生成・修正
- **手動編集の検知**: plugdataで手動編集→保存すると、AIが編集後の状態を理解して追加修正可能
- **既存パッチの読み込み**: 既存の.pdファイルを開いてAIに修正を依頼
- **セッション維持**: アプリ起動中は会話の文脈を保持
- **Serial/OSC変換**: micro:bitなどのデバイスからのシリアル入力をOSCメッセージに変換（内蔵）
- **micro:bit連携**: 授業で使用するセンサ値（明るさ、加速度、音、アナログ入力）に対応したパッチ生成
- **ELSE/plugdata対応**: `else/out~`、`else/imp~`、`cyclone/scale`など、ELSEライブラリのオブジェクトを活用

## セットアップ

### 必要なもの

- **plugdata**（または Pure Data + ELSE ライブラリ）
- **Claude Code CLI**（`npm install -g @anthropic-ai/claude-code`）
- Claudeアカウント（無料プランでも利用可能）

### インストール

1. `pd-ai-coder.app.zip` をダウンロードして展開
2. `pd-ai-coder.app` をダブルクリックで起動
3. 初回起動時に「Claudeにログイン」→ ブラウザでClaude認証

## 使い方

### チャットタブ

パッチの生成・修正は「Chat」タブで行います。

```
あなた: 440Hzのサイン波を出力するパッチを作って
AI: osc~ 440 → else/out~ のシンプルなパッチを生成...
    ✅ パッチを保存しました → plugdataで自動表示

あなた: フィルタのカットオフにLFOをかけて
AI: 手動編集を検知しました
    LFOでローパスフィルタのカットオフを変調するよう修正...

あなた: osc~の引数って何？
AI: osc~ の引数は周波数（Hz）です。osc~ 440 とすると...
    （質問にはパッチを生成せず説明で回答）
```

### Serial/OSCタブ

micro:bitなどのデバイスとの接続は「Serial/OSC」タブで行います。

1. デバイスをUSB接続
2. ポートを選択して「接続」
3. OSC送信先を設定（デフォルト: 127.0.0.1:8000）
4. デバイスからのシリアルデータが自動的にOSCメッセージに変換されます

### micro:bit連携

micro:bitのセンサ値をPdで受け取るパッチも自然言語で生成できます。

```
あなた: マイクロビットからの明るさセンサの値に応じて周波数が変化するパッチを作って
AI: /brightness をOSCで受信し、cyclone/scale で周波数にマッピング...
```

対応しているOSCアドレス:
- `/brightness` - 明るさセンサ（0-255）
- `/accX`, `/accY`, `/accZ` - 加速度センサ
- `/sound` - 音センサ
- `/p0` - P0端子のアナログ値（0-1023）

MakeCodeプロジェクト: https://makecode.microbit.org/S19392-01978-77199-41699

## アーキテクチャ

```
┌─ pd-ai-coder.app ──────────────────────────┐
│                                              │
│  Electron (React + TypeScript)               │
│  ┌────────────┐  ┌─────────────────────┐     │
│  │ Chat UI    │  │ Serial/OSC Panel    │     │
│  └─────┬──────┘  └──────┬──────────────┘     │
│        │                │                    │
│  ┌─────▼──────┐  ┌──────▼──────────────┐     │
│  │Claude Code │  │ serialport + osc-js │     │
│  │  CLI       │  │ (シリアル→OSC変換)    │     │
│  └─────┬──────┘  └──────┬──────────────┘     │
│        │                │                    │
│   .pd file 保存     UDP OSC送信              │
│        │                │                    │
└────────┼────────────────┼────────────────────┘
         │                │
    open コマンド          │
         ▼                ▼
┌──────────────┐  ┌──────────────────┐
│  plugdata    │  │  Pdパッチ内の     │
│  パッチ表示   │  │  OSC受信          │
│  手動編集     │  │  (oscreceive等)   │
│  音声出力     │  │                  │
└──────────────┘  └──────────────────┘
```

## ファイル構成

```
pd-ai-coder/
├── pd-ai-coder-app/         # Electron アプリ（メイン）
│   ├── src/
│   │   ├── main/            # メインプロセス
│   │   │   ├── index.ts     # IPCハンドラー
│   │   │   ├── ai-service.ts    # Claude Code CLI連携
│   │   │   ├── pd-file.ts       # .pdファイル読み書き
│   │   │   ├── serial-osc.ts    # シリアル→OSC変換
│   │   │   └── system-prompt.ts  # AIシステムプロンプト
│   │   ├── preload/         # IPC ブリッジ
│   │   └── renderer/        # React UI
│   │       ├── App.tsx
│   │       ├── ChatView.tsx
│   │       ├── SerialOSCPanel.tsx
│   │       └── ...
│   └── package.json
├── docs/                    # GitHub Pages サイト
│   └── index.html
├── pd_ai_coder.py           # Python CLI版（レガシー）
├── pd_file.py
├── fudi.py
├── prompts.py
├── pd-ai-receiver.pd        # FUDI受信用Pdパッチ（将来用）
└── README.md
```

## 開発

### Python CLI版（レガシー）

```bash
pip install prompt_toolkit
python pd_ai_coder.py
```

### Electron版

```bash
cd pd-ai-coder-app
npm install
npm run dev     # 開発モード
npm run build   # ビルド（release/ にパッケージ生成）
```

## 必要環境

- macOS（現在の対応OS）
- plugdata または Pure Data + ELSE ライブラリ
- Claude Code CLI
- Claudeアカウント（無料プラン可）
