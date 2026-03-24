// PreToolUse hook: .env 系ファイルへのアクセスをブロック
//
// 防御レイヤー:
// 1. ファイルパスが .env パターンにマッチ → ブロック（Read/Edit/Write）
// 2. Write時のファイル内容に .env を読むコードが含まれる → ブロック（間接アクセス防止）

const ENV_PATH_PATTERN = /\.env(\.[a-zA-Z0-9_-]+)?$/i;

// .env ファイルをプログラム的に読み取るコードのパターン
// readFileSync('.env'), open('.env'), fs.read(...'.env') 等
const ENV_READ_CODE_PATTERNS = [
  // Node.js fs 系
  /readFileSync\s*\(.*\.env/i,
  /readFile\s*\(.*\.env/i,
  /createReadStream\s*\(.*\.env/i,
  // Python 系
  /open\s*\(.*\.env/i,
  // 汎用: 文字列リテラル内の .env ファイルパス参照
  /['"]\S*\.env(\.[a-zA-Z0-9_-]+)?['"]/i,
];

const chunks = [];
process.stdin.on("data", (c) => chunks.push(c));
process.stdin.on("end", () => {
  try {
    const input = JSON.parse(Buffer.concat(chunks).toString());
    const toolName = input.tool_name || "";

    // Layer 1: ファイルパスチェック（Read/Edit/Write共通）
    const filePath = input.tool_input?.file_path || "";
    if (ENV_PATH_PATTERN.test(filePath)) {
      process.stderr.write(
        "BLOCK: .env系ファイルへのアクセスは禁止です。環境変数の確認・変更はユーザーに依頼してください。"
      );
      process.exit(2);
    }

    // Layer 2: Write時のファイル内容チェック（間接アクセス防止）
    if (toolName === "Write" || toolName === "Edit") {
      const content = input.tool_input?.content || input.tool_input?.new_string || "";
      for (const pattern of ENV_READ_CODE_PATTERNS) {
        if (pattern.test(content)) {
          process.stderr.write(
            "BLOCK: .env系ファイルを読み取るコードの作成は禁止です。環境変数の確認はユーザーに依頼してください。"
          );
          process.exit(2);
        }
      }
    }
  } catch {
    // パースエラーは無視して通過させる
  }
});
