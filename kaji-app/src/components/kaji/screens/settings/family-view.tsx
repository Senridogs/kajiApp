"use client";

import { useCallback, useState } from "react";
import type { BootstrapResponse } from "@/lib/types";
import { PRIMARY_COLOR } from "../../constants";
import { SettingsPanel } from "./settings-shared";

type Props = {
  boot: BootstrapResponse;
  onBack: () => void;
};

export function FamilyView({ boot, onBack }: Props) {
  const sessionUser = boot.sessionUser;
  const inviteCode = boot.householdInviteCode ?? "";
  const inviteLink =
    typeof window === "undefined"
      ? `https://ietasuku.vercel.app/?invite=${inviteCode}`
      : `${window.location.origin}/?invite=${inviteCode}`;

  const [codeCopied, setCodeCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  const copyCode = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(inviteCode);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    } catch {
      // clipboard API not available
    }
  }, [inviteCode]);

  const shareLink = useCallback(async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "いえたすく 招待",
          text: inviteLink,
          url: inviteLink,
        });
        return;
      } catch {
        // share cancelled or not available, fall through to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(inviteLink);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      // clipboard API not available
    }
  }, [inviteLink]);

  return (
    <SettingsPanel title="家族招待・家族管理" onBack={onBack}>
      {/* 家族コード */}
      <div className="space-y-2 rounded-[16px] border border-[var(--border)] bg-[var(--card)] p-5">
        <p className="text-[14px] font-bold text-[var(--muted-foreground)]">
          家族コード
        </p>
        <p className="text-[30px] font-extrabold tracking-[0.16em] text-[var(--primary)]">
          {inviteCode || "----"}
        </p>
        <p className="text-[11px] font-medium text-[var(--app-text-tertiary)]">
          パートナーにこのコードを共有してください
        </p>
        <button
          type="button"
          onClick={() => {
            void copyCode();
          }}
          className="rounded-[12px] bg-[var(--primary)] px-3 py-2 text-[14px] font-bold text-white"
        >
          {codeCopied ? "コピーしました！" : "コードをコピー"}
        </button>
      </div>

      {/* 招待リンク */}
      <div className="space-y-2 rounded-[16px] border border-[var(--border)] bg-[var(--card)] p-5">
        <p className="text-[14px] font-bold text-[var(--muted-foreground)]">
          招待リンク
        </p>
        <p className="truncate rounded-[10px] bg-[var(--secondary)] px-3 py-2 text-[13px] font-medium text-[var(--muted-foreground)]">
          {inviteLink}
        </p>
        <button
          type="button"
          onClick={() => {
            void shareLink();
          }}
          className="rounded-[12px] border-2 border-[var(--primary)] bg-[var(--card)] px-3 py-2 text-[14px] font-bold text-[var(--primary)]"
        >
          {linkCopied ? "コピーしました！" : "リンクを共有"}
        </button>
      </div>

      {/* 家族メンバー */}
      <div className="space-y-2">
        <p className="text-[22px] font-bold text-[var(--foreground)]">
          家族メンバー
        </p>
        {boot.users.map((member) => (
          <div
            key={member.id}
            className="flex items-center gap-3 rounded-[14px] border border-[var(--border)] bg-[var(--card)] px-4 py-3"
          >
            <div
              className="flex h-9 w-9 items-center justify-center rounded-full text-white"
              style={{
                backgroundColor: member.color ?? PRIMARY_COLOR,
              }}
            >
              <span className="material-symbols-rounded text-[20px]">
                person
              </span>
            </div>
            <p className="flex-1 text-[15px] font-semibold text-[var(--foreground)]">
              {member.name}
              {member.id === sessionUser?.id ? "（あなた）" : ""}
            </p>
            <span
              className={`text-[11px] font-bold ${
                member.id === sessionUser?.id
                  ? "text-[var(--primary)]"
                  : "text-[var(--muted-foreground)]"
              }`}
            >
              {member.id === sessionUser?.id ? "管理者" : "参加中"}
            </span>
          </div>
        ))}
      </div>
    </SettingsPanel>
  );
}
