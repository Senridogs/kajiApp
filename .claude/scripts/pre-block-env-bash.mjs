// PreToolUse hook: env設定ファイルへの Bash アクセスをブロック（ホワイトリスト + 難読化検出）
//
// 戦略:
// A) .env リテラルが存在 → ホワイトリスト方式でブロック
// B) リテラルが無くても → 難読化パターンを検出してブロック
//
// 防御レイヤー:
// 0. .env パターンなし かつ 難読化なし → 通過
// 1. リダイレクト (< .env, > .env) → 常にブロック
// 2. ドットソース (. .env, source .env) → 常にブロック
// 3. スクリプト実行時の内容チェック → ブロック
// 4. ホワイトリスト: セグメントごとにコマンド名を判定 → 許可リスト外ならブロック
// 5. 難読化検出: 文字列分割・エンコードによる構築パターン → ブロック
//
// 限界: 静的コマンド文字列解析では全ての動的構築は検出不能。
// 堅牢な防御にはOS レベルのファイルパーミッションを併用すること。

import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

// スクリプト自身の位置からプロジェクトルートを算出（CWD非依存）
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, "..", "..");  // .claude/scripts/ → project root

// env設定ファイルパターン（リテラルドット + env + オプション拡張子）
const ENV_LITERAL = /\.env(\.[a-zA-Z0-9_-]+)?/i;

// ── Layer 5: 難読化検出パターン ──
// リテラル .env が無くても動的構築を検出

// 文字列分割フラグメント（例: printf '%s%s' '.en' 'v.local'）
const SPLIT_FRAGMENT = /['"]\.?en['"\s)]*['"\s(]*v/i;

// printf %s による文字列結合でファイル名構築
const PRINTF_CONCAT = /printf\s+['"]%s/;

// base64 デコード（任意のファイル名を再構築可能）
const BASE64_DECODE = /base64\s+(-d|--decode)/;

// eval による動的コマンド構築
const EVAL_PATTERN = /\beval\s/;

// hex エスケープ（\x2e\x65\x6e\x76 = dot+e+n+v）
const HEX_ENV = /\\x2e\\x65\\x6e\\x76/i;

// ANSI-C quoting: $'\x2e\x65'
const ANSI_C_HEX = /\$'[^']*\\x[0-9a-f]{2}/i;

// 変数経由のリダイレクト: < "$var"
const VAR_REDIRECT = /<\s*["']?\$/;

// 変数経由のファイル読み取り: cat "$var", head "$var" 等
const VAR_FILE_READ =
  /\b(cat|head|tail|less|more|tac|nl|od|xxd|strings|hexdump|bat|batcat|expand|fold|fmt|pr|cut|sort|uniq|wc|tr|paste|join|comm|diff|cmp|awk|gawk|mawk|sed|grep|egrep|fgrep|rg|ag|ack)\s+["']?\$/i;

function detectObfuscation(cmd) {
  if (SPLIT_FRAGMENT.test(cmd)) return "文字列分割";
  if (PRINTF_CONCAT.test(cmd)) return "printf結合";
  if (BASE64_DECODE.test(cmd)) return "base64デコード";
  if (EVAL_PATTERN.test(cmd)) return "eval動的構築";
  if (HEX_ENV.test(cmd)) return "hexエスケープ";
  if (ANSI_C_HEX.test(cmd)) return "ANSI-C quoting";
  if (VAR_REDIRECT.test(cmd)) return "変数リダイレクト";
  if (VAR_FILE_READ.test(cmd)) return "変数ファイル読み取り";
  return null;
}

// ── その他の定数・ユーティリティ ──

// リダイレクト: < .env.local, > .env, >> .env.local
const REDIRECT_PATTERN =
  /<{1,2}\s*\S*\.env(\.[a-zA-Z0-9_-]+)?|>{1,2}\s*\S*\.env(\.[a-zA-Z0-9_-]+)?/i;

// ドットソース: . .env.local, source .env.local
const DOT_SOURCE_PATTERN = /^(\.\s+|source\s+)\S*\.env/i;

// スクリプト実行: node script.js, python script.py
const SCRIPT_EXEC_PATTERN =
  /\b(node|python3?|ruby|perl)\s+(?!-)([\w.\/_-]+\.(mjs|js|cjs|py|rb|pl))\b/;

// ファイル内容を読み取らない安全コマンド
const SAFE_COMMANDS = new Set([
  "echo",    // テキスト出力
  "printf",  // テキスト出力
  "ls",      // ファイル一覧（名前のみ）
  "dir",     // ファイル一覧（Windows）
  "test",    // 存在チェック
  "[",       // 存在チェック（test の別形式）
  "mkdir",   // ディレクトリ作成
  "touch",   // 空ファイル作成
]);

function block(message) {
  process.stderr.write(message);
  process.exit(2);
}

function checkScriptContent(scriptPath) {
  try {
    const content = readFileSync(resolve(PROJECT_ROOT, scriptPath), "utf8");
    return ENV_LITERAL.test(content);
  } catch {
    return false;
  }
}

// シェル演算子でコマンドを分割
function splitCommand(cmd) {
  return cmd
    .split(/&&|\|\||[;|]|\$\(|`/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// セグメントの先頭コマンド名を抽出
function getCommandName(segment) {
  // 先頭の VAR=val パターンと空白を除去
  const cleaned = segment.replace(/^\s*([\w]+=\S*\s+)*/, "");
  const match = cleaned.match(/^(\S+)/);
  if (!match) return "";
  // パスプレフィックスを除去（/usr/bin/cat → cat）
  return match[1].replace(/^.*\//, "");
}

// ── メイン処理 ──

const chunks = [];
process.stdin.on("data", (c) => chunks.push(c));
process.stdin.on("end", () => {
  try {
    const input = JSON.parse(Buffer.concat(chunks).toString());
    const cmd = input.tool_input?.command || "";

    const hasEnvLiteral = ENV_LITERAL.test(cmd);
    const obfuscationType = detectObfuscation(cmd);

    // Layer 0: パターンなし かつ 難読化なし → 通過
    if (!hasEnvLiteral && !obfuscationType) {
      process.exit(0);
    }

    // Layer 5: 難読化検出（リテラルが無くても発動）
    if (obfuscationType) {
      block(
        `BLOCK: env設定ファイルへのアクセスが難読化されています（${obfuscationType}）。`,
      );
    }

    // 以降は ENV_LITERAL がある場合のチェック

    // Layer 1: リダイレクト → 常にブロック
    if (REDIRECT_PATTERN.test(cmd)) {
      block("BLOCK: env設定ファイルへのリダイレクト参照は禁止です。");
    }

    // Layer 2: ドットソース → 常にブロック
    const segments = splitCommand(cmd);
    for (const seg of segments) {
      if (DOT_SOURCE_PATTERN.test(seg)) {
        block("BLOCK: env設定ファイルのドットソースは禁止です。");
      }
    }

    // Layer 3: スクリプト実行の内容チェック
    const scriptMatch = cmd.match(SCRIPT_EXEC_PATTERN);
    if (scriptMatch) {
      if (checkScriptContent(scriptMatch[2])) {
        block("BLOCK: env設定ファイルを参照するスクリプトの実行は禁止です。");
      }
    }

    // Layer 4: ホワイトリスト方式
    // .env を含むセグメントのコマンドが許可リストにない → ブロック
    for (const seg of segments) {
      if (!ENV_LITERAL.test(seg)) continue;

      const cmdName = getCommandName(seg);
      if (!cmdName || !SAFE_COMMANDS.has(cmdName)) {
        const displayCmd = cmdName || "(不明)";
        block(
          `BLOCK: env設定ファイルへのBash参照は禁止です（${displayCmd} は許可リストにありません）。`,
        );
      }
    }
  } catch {
    // パースエラーは無視して通過
  }
});
