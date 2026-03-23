# pd-ai-coder

**AI-powered Pure Data patch development tool**

自然言語でPure Dataのパッチを対話的に生成・修正できるCLIツールです。
Claude APIを使ってパッチを生成し、Pdで開いて手動微調整、さらにAIに追加修正を指示、というサイクルで開発できます。

## ワークフロー

```
自然言語で指示 → AIがパッチ生成 → Pdで自動表示
  ↑                                    ↓
  ← 「ここを変えて」 ←← Pdで手動微調整して保存
```

## セットアップ

### 1. 依存パッケージのインストール

```bash
pip install anthropic prompt_toolkit
```

### 2. API キーの設定

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

### 3. Pure Data の準備（FUDI接続を使う場合）

1. Pure Data を起動
2. `pd-ai-receiver.pd` を開く（FUDIメッセージ受信用）
3. pd-ai-coder を起動すると自動的に接続

FUDI接続なしでも動作します（パッチはファイルとして保存され、手動でPdで開けます）。

## 使い方

### 基本

```bash
python pd_ai_coder.py
```

### オプション

```bash
# パッチファイルのパスを指定
python pd_ai_coder.py --patch ~/my-project/synth.pd

# FUDI接続なし（ファイルベースのみ）
python pd_ai_coder.py --no-fudi

# FUDIポートを変更
python pd_ai_coder.py --port 3002
```

### 対話例

```
pd-ai > 440Hzのサイン波を出力するパッチを作って

📋 説明
440Hzのサイン波を生成し、スライダーで音量を調整できるパッチです。

✅ パッチ保存: ~/pd-ai-patches/ai-patch.pd
🔊 Pdでパッチを開きました

pd-ai > フィルタのカットオフにLFOをかけて

📋 説明
LFO（低周波オシレーター）でローパスフィルタのカットオフ周波数を
周期的に変化させるように修正しました。

🔧 変更点
- osc~ 0.5 (LFO) を追加
- cyclone/scale でLFO出力を200-5000Hzにマッピング
- lop~ のカットオフ入力に接続

✅ パッチ保存: ~/pd-ai-patches/ai-patch.pd
🔊 Pdでパッチを開きました

pd-ai > （Pdでパラメータを手動調整して保存）
pd-ai > もう少しリバーブを深くして
📝 Pdでの手動編集を検出しました
...
```

### コマンド

| コマンド | 説明 |
|---------|------|
| `/help` | ヘルプを表示 |
| `/status` | 現在の状態を表示 |
| `/patch` | 現在のパッチ内容を表示 |
| `/reload` | Pdで保存されたパッチを再読み込み |
| `/open` | Pdでパッチを開き直す |
| `/save <name>` | パッチを別名で保存 |
| `/load <file>` | 別のパッチファイルを読み込む |
| `/reset` | 会話履歴をリセット |
| `/quit` | 終了 |

## アーキテクチャ

```
┌─────────────────────────────────────┐
│  pd_ai_coder.py (CLI)              │
│  ┌──────────┐  ┌───────────────┐   │
│  │Claude API│  │ pd_file.py    │   │
│  │ (生成)   │  │ (読み書き)    │   │
│  └──────────┘  └───────┬───────┘   │
│       │               │            │
│       ▼          .pd file          │
│  ┌──────────┐    ↕ (保存/読込)     │
│  │ fudi.py  │         │            │
│  │ (TCP)    ├─── FUDI open ──┐     │
│  └──────────┘         │      │     │
└───────────────────────┼──────┼─────┘
                        │      │
                        ▼      ▼
              ┌─────────────────────┐
              │   Pure Data         │
              │   - パッチ表示       │
              │   - 手動編集         │
              │   - 音声出力         │
              └─────────────────────┘
```

## ファイル構成

```
pd-ai-coder/
├── pd_ai_coder.py      # メインCLI
├── pd_file.py           # .pdファイル読み書き・パース
├── fudi.py              # FUDI TCPクライアント
├── prompts.py           # AIシステムプロンプト
├── pd-ai-receiver.pd    # Pd側レシーバーパッチ
├── requirements.txt     # 依存パッケージ
└── README.md            # このファイル
```

## 今後の拡張予定

- [ ] FUDI動的パッチング（オブジェクトがリアルタイムに出現する体験）
- [ ] パッチのバージョン管理（undo/redo）
- [ ] 音響プレビュー用のテストトーン送信
- [ ] パッチテンプレート機能
- [ ] SuperCollider対応

## 必要環境

- Python 3.11+
- Pure Data（Pd-L2Ork または Pd + ELSE ライブラリ推奨）
- Anthropic API キー
