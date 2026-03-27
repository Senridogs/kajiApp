"use client";

import { type FormEvent, useCallback, useState } from "react";
import { Loader2, User } from "lucide-react";
import { USER_COLOR_PALETTE } from "@/components/kaji/constants";
import { apiFetch } from "@/components/kaji/helpers";

type Props = {
  onSuccess: () => void;
};

export function LoginScreen({ onSuccess }: Props) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [color, setColor] = useState(USER_COLOR_PALETTE[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (loading) return;
      try {
        setLoading(true);
        setError("");
        const trimmedInviteCode = inviteCode.trim();
        await apiFetch("/api/register", {
          method: "POST",
          body: JSON.stringify({
            name,
            password,
            color,
            ...(trimmedInviteCode ? { inviteCode: trimmedInviteCode } : {}),
          }),
        });
        onSuccess();
      } catch (err: unknown) {
        setError(
          err instanceof Error ? err.message : "登録に失敗しました。",
        );
      } finally {
        setLoading(false);
      }
    },
    [color, inviteCode, loading, name, onSuccess, password],
  );

  return (
    <main className="min-h-screen overflow-y-auto bg-gradient-to-b from-[var(--background)] to-[var(--app-surface-soft)]">
      <form
        onSubmit={handleSubmit}
        className="mx-auto flex min-h-screen w-full max-w-[430px] flex-col items-center justify-center gap-4 px-5 py-8"
      >
        <div className="rounded-[20px] bg-[var(--app-surface-soft)] p-5">
          <span className="material-symbols-rounded text-[44px] text-[var(--primary)]">
            auto_awesome
          </span>
        </div>
        <p className="text-[42px] font-bold leading-none text-[var(--foreground)]">
          さあ、始めましょう
        </p>

        <div className="flex items-center justify-center gap-2">
          <span className="rounded-full bg-[var(--primary)] px-4 py-2 text-[13px] font-bold text-white">
            はじめての方
          </span>
          <span className="rounded-full border border-[var(--border)] bg-[var(--card)] px-4 py-2 text-[13px] font-semibold text-[var(--muted-foreground)]">
            招待された方
          </span>
        </div>

        <div className="w-full space-y-3 rounded-[20px] border border-[var(--border)] bg-[var(--card)] px-[18px] py-4">
          <div className="flex items-center gap-2">
            <User size={22} className="text-[var(--primary)]" aria-hidden="true" />
            <p className="text-[24px] font-bold text-[var(--foreground)]">
              ログイン / 新規登録
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-[13px] font-semibold text-[var(--muted-foreground)]">
              ユーザーネーム
            </p>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="あなたの名前"
              autoComplete="username"
              className="w-full rounded-[14px] border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-[16.8px] font-semibold text-[var(--foreground)] outline-none placeholder:text-[14px] placeholder:font-medium placeholder:text-[var(--app-text-tertiary)]"
            />
          </div>
          <div className="space-y-1">
            <p className="text-[13px] font-semibold text-[var(--muted-foreground)]">
              パスワード
            </p>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="8文字以上"
              autoComplete="current-password"
              className="w-full rounded-[14px] border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-[16.8px] font-semibold text-[var(--foreground)] outline-none placeholder:text-[14px] placeholder:font-medium placeholder:text-[var(--app-text-tertiary)]"
            />
            <p className="text-[11px] font-medium text-[var(--app-text-tertiary)]">
              パスワード設定前に登録した方は空白のままでログインできます
            </p>
          </div>
          <div className="space-y-2 pt-1">
            <div className="flex items-center gap-1.5">
              <span className="material-symbols-rounded text-[16px] text-[var(--muted-foreground)]">
                sell
              </span>
              <p className="text-[15px] font-bold text-[var(--foreground)]">
                家族コード
              </p>
              <p className="text-[13px] font-medium text-[var(--app-text-tertiary)]">
                （任意）
              </p>
            </div>
            <input
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              placeholder="パートナーから届いたコード"
              className="w-full rounded-[14px] border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-[16px] font-semibold text-[var(--foreground)] outline-none placeholder:text-[14px] placeholder:font-medium placeholder:text-[var(--app-text-tertiary)]"
            />
            <p className="text-[11px] font-medium text-[var(--app-text-tertiary)]">
              パートナーが先に登録済みの場合のみ入力
            </p>
          </div>
        </div>

        <div className="w-full space-y-2 px-1">
          <div className="flex items-center gap-1.5">
            <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-[var(--primary)] text-[11px] font-bold text-white">
              1
            </span>
            <p className="text-[12px] font-medium text-[var(--muted-foreground)]">
              はじめての方：ユーザーネームとパスワードを決めて登録
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-[var(--primary)] text-[11px] font-bold text-white">
              2
            </span>
            <p className="text-[12px] font-medium text-[var(--muted-foreground)]">
              すでに登録済みの方：同じユーザーネームとパスワードでログイン
            </p>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-[16px] bg-[var(--primary)] px-4 py-3 text-[16.8px] font-bold text-white shadow-lg shadow-black/20 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {loading ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <span className="material-symbols-rounded text-[18px] leading-none">
              arrow_forward
            </span>
          )}
          {loading ? "読み込み中..." : "はじめる"}
        </button>
        <div className="flex flex-wrap justify-center gap-2">
          {USER_COLOR_PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className={`h-6 w-6 rounded-full ${color === c ? "ring-2 ring-[var(--foreground)] ring-offset-2" : ""}`}
              style={{ backgroundColor: c }}
              aria-label={c}
            />
          ))}
        </div>
        {error ? (
          <p className="mt-2 text-center text-sm text-[var(--destructive)]">
            {error}
          </p>
        ) : null}
      </form>
    </main>
  );
}
