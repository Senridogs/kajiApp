import { memo } from "react";
import type { PlantStage } from "@/lib/freshness";

const STAGE_COLORS: Record<PlantStage, string> = {
  sprout: "#22c55e",
  growing: "#16a34a",
  budding: "#84cc16",
  bloom: "#eab308",
  wilting: "#f97316",
  withered: "#a16207",
};

const STAGE_LABELS: Record<PlantStage, string> = {
  sprout: "芽生え",
  growing: "成長中",
  budding: "つぼみ",
  bloom: "満開",
  wilting: "しおれ",
  withered: "枯れ",
};

/** 土の部分（全ステージ共通） */
const SOIL_PATH = "M4 20c0 1.1 3.6 2 8 2s8-.9 8-2c0-.6-1.2-1.1-3-1.5H7c-1.8.4-3 .9-3 1.5z";

const STAGE_PATHS: Record<PlantStage, React.ReactNode> = {
  // 双葉：小さな茎と2枚の丸い葉
  sprout: (
    <>
      <path d={SOIL_PATH} fill="#8B6914" opacity={0.5} />
      <rect x={11.25} y={14} width={1.5} height={6} rx={0.75} fill="currentColor" />
      <ellipse cx={9} cy={13.5} rx={3} ry={2.2} fill="currentColor" transform="rotate(-20 9 13.5)" />
      <ellipse cx={15} cy={13.5} rx={3} ry={2.2} fill="currentColor" transform="rotate(20 15 13.5)" />
    </>
  ),

  // 成長中：茎が伸び、左右に葉が3枚
  growing: (
    <>
      <path d={SOIL_PATH} fill="#8B6914" opacity={0.5} />
      <rect x={11.25} y={8} width={1.5} height={12} rx={0.75} fill="currentColor" />
      <ellipse cx={8} cy={14} rx={3.5} ry={2} fill="currentColor" transform="rotate(-25 8 14)" />
      <ellipse cx={16} cy={11} rx={3.5} ry={2} fill="currentColor" transform="rotate(25 16 11)" />
      <ellipse cx={7.5} cy={9.5} rx={3} ry={1.8} fill="currentColor" transform="rotate(-15 7.5 9.5)" />
    </>
  ),

  // つぼみ：茎の先に丸いつぼみ
  budding: (
    <>
      <path d={SOIL_PATH} fill="#8B6914" opacity={0.5} />
      <rect x={11.25} y={7} width={1.5} height={13} rx={0.75} fill="currentColor" />
      <ellipse cx={8} cy={13} rx={3.2} ry={1.8} fill="currentColor" transform="rotate(-20 8 13)" />
      <ellipse cx={16} cy={10.5} rx={3.2} ry={1.8} fill="currentColor" transform="rotate(20 16 10.5)" />
      {/* つぼみ本体 */}
      <ellipse cx={12} cy={5.5} rx={2.5} ry={3} fill="currentColor" />
      {/* つぼみのがく */}
      <path d="M9.5 7.5c1-1 1.5-2 2.5-2s1.5 1 2.5 2" fill="currentColor" opacity={0.6} />
    </>
  ),

  // 満開：大きな花が開いている
  bloom: (
    <>
      <path d={SOIL_PATH} fill="#8B6914" opacity={0.5} />
      <rect x={11.25} y={10} width={1.5} height={10} rx={0.75} fill="#16a34a" />
      <ellipse cx={7.5} cy={14} rx={3} ry={1.8} fill="#16a34a" transform="rotate(-20 7.5 14)" />
      <ellipse cx={16.5} cy={12} rx={3} ry={1.8} fill="#16a34a" transform="rotate(20 16.5 12)" />
      {/* 花びら（5枚、放射状） */}
      <ellipse cx={12} cy={4} rx={2.2} ry={3} fill="currentColor" />
      <ellipse cx={8.2} cy={6.5} rx={2.2} ry={3} fill="currentColor" transform="rotate(-55 8.2 6.5)" />
      <ellipse cx={15.8} cy={6.5} rx={2.2} ry={3} fill="currentColor" transform="rotate(55 15.8 6.5)" />
      <ellipse cx={9.5} cy={10} rx={2.2} ry={3} fill="currentColor" transform="rotate(-80 9.5 10)" />
      <ellipse cx={14.5} cy={10} rx={2.2} ry={3} fill="currentColor" transform="rotate(80 14.5 10)" />
      {/* 花芯 */}
      <circle cx={12} cy={7.5} r={2} fill="#fbbf24" />
    </>
  ),

  // しおれ：花が傾いてうなだれている
  wilting: (
    <>
      <path d={SOIL_PATH} fill="#8B6914" opacity={0.5} />
      {/* 曲がった茎 */}
      <path d="M12 20 C12 16, 12 14, 14 11 C15 9, 16 8, 16.5 7" stroke="currentColor" strokeWidth={1.5} fill="none" strokeLinecap="round" />
      <ellipse cx={8.5} cy={14.5} rx={2.8} ry={1.5} fill="currentColor" opacity={0.6} transform="rotate(-25 8.5 14.5)" />
      {/* しおれた花びら（下を向いている） */}
      <ellipse cx={17} cy={8.5} rx={2} ry={2.8} fill="currentColor" opacity={0.7} transform="rotate(30 17 8.5)" />
      <ellipse cx={18} cy={6} rx={1.8} ry={2.5} fill="currentColor" opacity={0.7} transform="rotate(50 18 6)" />
      <ellipse cx={15} cy={5.5} rx={1.8} ry={2.5} fill="currentColor" opacity={0.7} transform="rotate(-10 15 5.5)" />
      <circle cx={16.5} cy={7} r={1.5} fill="currentColor" opacity={0.4} />
    </>
  ),

  // 枯れ：落ち葉、枯れた枝
  withered: (
    <>
      <path d={SOIL_PATH} fill="#8B6914" opacity={0.5} />
      {/* 枯れた茎 */}
      <path d="M12 20 C12 17, 11.5 14, 11 12 C10.5 10, 11 8, 12 7" stroke="currentColor" strokeWidth={1.2} fill="none" strokeLinecap="round" />
      {/* 枯れた小枝 */}
      <path d="M12 12 L15 10" stroke="currentColor" strokeWidth={1} fill="none" strokeLinecap="round" />
      <path d="M11.5 9 L8.5 7.5" stroke="currentColor" strokeWidth={1} fill="none" strokeLinecap="round" />
      {/* 落ち葉（地面付近） */}
      <ellipse cx={7} cy={18.5} rx={2.5} ry={1.2} fill="currentColor" opacity={0.6} transform="rotate(-15 7 18.5)" />
      <ellipse cx={16} cy={19} rx={2.2} ry={1} fill="currentColor" opacity={0.5} transform="rotate(10 16 19)" />
      {/* 枯れた葉（茎についている） */}
      <ellipse cx={15.5} cy={9.5} rx={2} ry={1} fill="currentColor" opacity={0.4} transform="rotate(20 15.5 9.5)" />
      <ellipse cx={8} cy={7} rx={1.8} ry={0.9} fill="currentColor" opacity={0.4} transform="rotate(-10 8 7)" />
    </>
  ),
};

type PlantIconProps = {
  stage: PlantStage;
  size?: number;
  className?: string;
};

export const PlantIcon = memo(function PlantIcon({
  stage,
  size = 28,
  className,
}: PlantIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ color: STAGE_COLORS[stage] }}
      role="img"
      aria-label={STAGE_LABELS[stage]}
    >
      {STAGE_PATHS[stage]}
    </svg>
  );
});
